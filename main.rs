use actix_web::{
    middleware::{Logger, DefaultHeaders},
    web, App, HttpResponse, HttpServer, Result,
    http::header::{CONTENT_TYPE, AUTHORIZATION}
};
use actix_web_httpauth::middleware::HttpAuthentication;
use actix_cors::Cors;
use anyhow::Context;
use sqlx::{sqlite::SqliteConnectOptions, migrate::MigrateDatabase, Sqlite, SqlitePool};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use handlers::{get_dashboard_stats, get_all_batches};
use auth_handlers::{change_user_password, delete_user};
mod auth;
mod auth_handlers;
mod config;
mod db;
mod error;
mod handlers;
mod models;
mod monitoring;
mod test;

use crate::handlers::get_reagent_with_batches;
use crate::handlers::get_batch;
use actix_web::middleware::Compress;
use config::{Config, load_env_file};
use auth::{AuthService, jwt_middleware};
use handlers::{
    search_reagents, get_low_stock_batches, get_expiring_batches,
    use_reagent, get_usage_history
};
use crate::handlers::create_batch_with_user;
use crate::handlers::create_reagent_with_user;
use crate::handlers::update_reagent_with_user;
use crate::handlers::update_batch_with_user;
use crate::handlers::delete_batch;
use auth_handlers::*;
use monitoring::{Metrics, RequestLogger, start_maintenance_tasks};
use error::ApiResult;
use crate::handlers::delete_reagent;
use crate::handlers::get_reagents;
use crate::handlers::get_reagent_by_id;

pub struct AppState {
    pub db_pool: SqlitePool,
    pub config: Config,
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    load_env_file().ok();

    let config = Config::load().context("Failed to load configuration")?;

    setup_logging(&config)?;
    config.print_startup_info();

    if config.is_production() {
        validate_production_config(&config)?;
    }

    let database_url = &config.database.url;
    setup_database(database_url).await?;

    let db_pool = create_database_pool(&config.database).await?;

    db::run_migrations(&db_pool)
        .await
        .context("Failed to run database migrations")?;

    let auth_service = Arc::new(AuthService::new(&config.auth.jwt_secret));
    let metrics = Arc::new(Metrics::new());

    // Clone config values before moving into AppState
    let server_host = config.server.host.clone();
    let server_port = config.server.port;
    let server_workers = config.server.workers;
    let security_config = config.security.clone();

    let app_state = Arc::new(AppState {
        db_pool: db_pool.clone(),
        config,
    });

    start_maintenance_tasks(db_pool.clone()).await;
    create_default_admin_if_needed(&db_pool, &auth_service).await?;

    log::info!("Starting HTTP server on {}:{}", server_host, server_port);

    let server = HttpServer::new(move || {
        let cors = setup_cors(&security_config.allowed_origins);
        let auth_middleware = HttpAuthentication::bearer(jwt_middleware);

        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .app_data(web::Data::new(auth_service.clone()))
            .app_data(web::Data::new(metrics.clone()))
            .wrap(cors)
            .wrap(RequestLogger::new(metrics.clone()))
            .wrap(Logger::new(r#"%a "%r" %s %b "%{Referer}i" "%{User-Agent}i" %T"#))
            .wrap(setup_security_headers(&security_config))
            .wrap(Compress::default())

            .service(
                web::scope("/health")
                    .route("", web::get().to(monitoring::health_check))
                    .route("/ready", web::get().to(monitoring::readiness_check))
                    .route("/live", web::get().to(monitoring::liveness_check))
                    .route("/metrics", web::get().to(monitoring::metrics_endpoint))
            )
            .service(
                web::scope("/auth")
                    .route("/login", web::post().to(login))
                    

            )

            .service(
                web::scope("/api/v1")
                    .wrap(auth_middleware)
                    .service(
                        web::scope("/auth")
                            .route("/profile", web::get().to(get_profile))
                            .route("/change-password", web::post().to(change_password))
                            .route("/logout", web::post().to(logout))
                            .route("/register", web::post().to(register))
                            .route("/users", web::get().to(list_users))
                            
                            .route("/users/{id}/reset-password", web::put().to(change_user_password))
                            .route("/users/{id}", web::put().to(update_user))
                            .route("/users/{id}", web::delete().to(delete_user))


                    )
                    .service(
                        web::scope("/dashboard")
                            .route("/stats", web::get().to(get_dashboard_stats))
                    )
                    .service(
                        web::scope("/batches")
                            .route("", web::get().to(get_all_batches))
                            .route("/low-stock", web::get().to(get_low_stock_batches))
                            .route("/expiring", web::get().to(get_expiring_batches))

                    )
                    .service(
                        web::scope("/reagents")
                            .route("", web::post().to(create_reagent_protected))
                            .route("", web::get().to(get_reagents))  // Для /reagents (дашборд)
                            .route("/search", web::get().to(search_reagents))  // Поиск
                            .route("/low-stock", web::get().to(get_low_stock_batches))  // Низкий запас (перед /{id})
                            .route("/expiring", web::get().to(get_expiring_batches))  // Истекающие (перед /{id})
                            .route("/{id}", web::get().to(get_reagent_by_id))  // Общий для ID (после специфических)
                            .route("/{id}", web::put().to(update_reagent_protected))
                            .route("/{id}", web::delete().to(delete_reagent_protected))
                            .route("/{id}/details", web::get().to(get_reagent_with_batches))
                            .route("/{id}/batches", web::post().to(create_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}", web::get().to(get_batch))
                            .route("/{reagent_id}/batches/{batch_id}", web::put().to(update_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}", web::delete().to(delete_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}/use", web::post().to(use_reagent))
                            .route("/{reagent_id}/batches/{batch_id}/usage", web::get().to(get_usage_history))
                    )
            )

            .route("/", web::get().to(serve_index))
            .default_service(web::get().to(serve_index))
    });

    let server = match server_workers {
        Some(workers) => server.workers(workers),
        None => server,
    };

    server
        .bind((server_host.as_str(), server_port))
        .context("Failed to bind server")?
        .run()
        .await
        .context("Server failed to run")?;

    Ok(())
}

fn setup_logging(config: &Config) -> anyhow::Result<()> {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| format!("lims={},sqlx=warn,actix_web=info", config.logging.level).into());

    let subscriber = tracing_subscriber::registry().with(env_filter);

    if config.logging.console_enabled {
        let format = tracing_subscriber::fmt::layer()
            .with_target(false)
            .compact();
        subscriber.with(format).init();
    } else {
        subscriber.init();
    }

    Ok(())
}

fn validate_production_config(config: &Config) -> anyhow::Result<()> {
    if !config.security.require_https {
        log::warn!("HTTPS not required in production mode - this is insecure!");
    }

    if config.security.allowed_origins.contains(&"*".to_string()) {
        return Err(anyhow::anyhow!(
            "Wildcard CORS origins not allowed in production. Specify exact origins."
        ));
    }

    if config.auth.jwt_secret == "change-me-in-production" {
        return Err(anyhow::anyhow!(
            "Default JWT secret detected in production. Set JWT_SECRET environment variable."
        ));
    }

    Ok(())
}

async fn setup_database(database_url: &str) -> anyhow::Result<()> {
    if !Sqlite::database_exists(database_url).await? {
        log::info!("Creating database: {}", database_url);
        Sqlite::create_database(database_url).await?;
    }
    Ok(())
}

async fn create_database_pool(config: &config::DatabaseConfig) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(&config.url.replace("sqlite:", ""))
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(30));

    SqlitePool::connect_with(options)
        .await
        .context("Failed to connect to database")
}

fn setup_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allowed_headers(vec![CONTENT_TYPE, AUTHORIZATION])
        .max_age(3600);

    if allowed_origins.contains(&"*".to_string()) {
        cors = cors.allow_any_origin().allow_any_header();
    } else {
        for origin in allowed_origins {
            cors = cors.allowed_origin(origin);
        }
    }

    cors
}

fn setup_security_headers(security_config: &config::SecurityConfig) -> DefaultHeaders {
    let mut headers = DefaultHeaders::new()
        .add(("X-Content-Type-Options", "nosniff"))
        .add(("X-Frame-Options", "DENY"))
        .add(("X-XSS-Protection", "1; mode=block"))
        .add(("Referrer-Policy", "strict-origin-when-cross-origin"));

    if security_config.require_https {
        headers = headers.add((
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload"
        ));
    }

    headers
}

async fn create_default_admin_if_needed(
    pool: &SqlitePool,
    auth_service: &AuthService,
) -> anyhow::Result<()> {
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if user_count.0 == 0 {
        use auth::{User, RegisterRequest, UserRole};

        let admin_request = RegisterRequest {
            username: "admin".to_string(),
            email: "admin@lims.local".to_string(),
            password: "admin123456".to_string(),
            role: None,
        };

        let _ =User::create(pool, admin_request, UserRole::Admin, auth_service)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create default admin user: {}", e))?;

        log::warn!("Default admin user created:");
        log::warn!("  Username: admin");
        log::warn!("  Password: admin123456");
        log::warn!("  ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!");
    }

    Ok(())
}

async fn serve_index() -> Result<HttpResponse> {
    let html_content = include_str!("../web_interface.html");
    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html_content))
}

// Protected handler wrappers that check permissions
async fn create_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    reagent: web::Json<crate::models::CreateReagentRequest>,
    http_request: actix_web::HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission(&http_request, auth_handlers::ReagentAction::Create)?;

    let claims = auth::get_current_user(&http_request)?;
    create_reagent_with_user(app_state, reagent, claims.sub).await
}

async fn update_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<crate::models::UpdateReagentRequest>,
    http_request: actix_web::HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission(&http_request, auth_handlers::ReagentAction::Edit)?;

    let claims = auth::get_current_user(&http_request)?;
    update_reagent_with_user(app_state, path, update_data, claims.sub).await
}

async fn delete_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: actix_web::HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission(&http_request, auth_handlers::ReagentAction::Delete)?;
    delete_reagent(app_state, path).await
}

async fn create_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    batch: web::Json<crate::models::CreateBatchRequest>,
    http_request: actix_web::HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission(&http_request, auth_handlers::BatchAction::Create)?;

    let claims = auth::get_current_user(&http_request)?;
    create_batch_with_user(app_state, path, batch, claims.sub).await
}

async fn update_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update_data: web::Json<crate::models::UpdateBatchRequest>,
    http_request: actix_web::HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission(&http_request, auth_handlers::BatchAction::Edit)?;

    let claims = auth::get_current_user(&http_request)?;
    update_batch_with_user(app_state, path, update_data, claims.sub).await
}

async fn delete_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: actix_web::HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission(&http_request, auth_handlers::BatchAction::Delete)?;
    delete_batch(app_state, path).await
}