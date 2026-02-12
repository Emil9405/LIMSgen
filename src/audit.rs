// ============================================================
// ФАЙЛ: src/audit.rs — Вспомогательный модуль для аудит-логирования
// Добавить в проект как новый файл, затем добавить `mod audit;` в main.rs
// ============================================================

use sqlx::SqlitePool;
use uuid::Uuid;
use chrono::Utc;
use actix_web::HttpRequest;

/// Записать событие в audit_logs
pub async fn log_activity(
    pool: &SqlitePool,
    user_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
    description: Option<&str>,
    changes: Option<&str>,
    request: Option<&HttpRequest>,
) -> Result<(), sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let ip_address = request.and_then(|req| {
        req.connection_info()
            .realip_remote_addr()
            .map(|s| s.to_string())
    });

    let user_agent = request.and_then(|req| {
        req.headers()
            .get("User-Agent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    });

    sqlx::query(
        r#"INSERT INTO audit_logs 
           (id, user_id, action, entity_type, entity_id, description, changes, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
    )
    .bind(&id)
    .bind(user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(description)
    .bind(changes)
    .bind(&ip_address)
    .bind(&user_agent)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Короткая версия для частых вызовов
pub async fn audit(
    pool: &SqlitePool,
    user_id: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    description: &str,
    request: &HttpRequest,
) {
    if let Err(e) = log_activity(
        pool,
        Some(user_id),
        action,
        entity_type,
        Some(entity_id),
        Some(description),
        None,
        Some(request),
    ).await {
        log::error!("Failed to write audit log: {}", e);
    }
}
