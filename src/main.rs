// Updated main.rs with modular handlers and import/export functionality
use actix_web::{
    middleware::{Logger, DefaultHeaders},
    web, App, HttpResponse, HttpServer, HttpRequest, Result,
};
use actix_multipart::Multipart;
use actix_web_httpauth::middleware::HttpAuthentication;
use actix_web::http::header;
use actix_cors::Cors;
use actix_files::{NamedFile, Files};
use std::env;
use std::path::PathBuf;
use crate::config::load_config;
use crate::auth::UserRole;
use crate::auth::get_current_user;
use crate::handlers::PaginationQuery;
use crate::handlers::get_dashboard_trends;
use crate::handlers::get_recent_activity;
use crate::models::{
    // Equipment
    CreateEquipmentRequest, UpdateEquipmentRequest, 
    CreateEquipmentPartRequest, UpdateEquipmentPartRequest,
    CreateMaintenanceRequest, UpdateMaintenanceRequest, CompleteMaintenanceRequest,
    UpcomingMaintenanceQuery,
    
    // Experiment
    CreateExperimentRequest, UpdateExperimentRequest,
    
    // Reagent & Batch
    CreateReagentRequest, UpdateReagentRequest,
    CreateBatchRequest, UpdateBatchRequest,
    
    // Room
    CreateRoomRequest, UpdateRoomRequest, RoomStatus
};

use rand::{thread_rng, Rng, distributions::Alphanumeric};
use rand::distributions::Distribution;
use rand::seq::SliceRandom;
use anyhow::Context;
use sqlx::{sqlite::SqliteConnectOptions, migrate::MigrateDatabase, Sqlite, SqlitePool};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
// Module declarations
mod auth;
mod audit;
mod auth_handlers;
mod filter_handlers;
mod config;
mod db;
mod error;
mod handlers;
mod experiment_handlers;
mod report_handlers;
mod models;
mod monitoring;
mod jwt_rotation;
pub mod validator;
mod placement_handlers;
pub mod repositories;
pub mod query_builders;
mod reagent_handlers;
pub mod room_handlers;
mod batch_handlers;
mod equipment_handlers;
mod import_export;
mod pagination;
use actix_web::middleware::Compress;
use config::Config;
use auth::{AuthService, jwt_middleware};

use auth_handlers::{change_user_password, delete_user, create_user, get_roles};
use crate::audit::ChangeSet;


// Handlers - only common utilities and specific functions
use handlers::{
    get_dashboard_stats, use_reagent, get_usage_history,
    get_reagent_with_batches, get_jwt_rotation_status, force_jwt_rotation
};

// Reagent handlers
use reagent_handlers::{
    get_reagent_by_id, 
    get_reagents, 
    search_reagents,
    rebuild_cache,

};

// Batch handlers - FIXED: get_batches_for_reagent instead of get_batches_by_reagent
use batch_handlers::{
    get_all_batches, get_batch, get_low_stock_batches, get_expiring_batches,
    get_batches_for_reagent, dispense_units, get_batch_units_info
};

// Equipment handlers - FIXED: removed get_upcoming_maintenance (doesn't exist)
use equipment_handlers::{
    get_equipment, get_equipment_by_id,
    // Parts
    get_equipment_parts, add_equipment_part, update_equipment_part, delete_equipment_part,
    // Maintenance
    get_equipment_maintenance, create_maintenance, 
    update_maintenance, complete_maintenance, delete_maintenance,
    // Files
    get_equipment_files, upload_equipment_file, download_equipment_file, delete_equipment_file,
    get_part_files,
    // Search
    search_equipment,
};
// Import/Export handlers
use import_export::{
    import_reagents, export_reagents, import_reagents_json, import_reagents_excel,
    import_batches, export_batches, import_batches_json, import_batches_excel,
    import_equipment, export_equipment, import_equipment_json, import_equipment_excel
};

// Experiment handlers
use experiment_handlers::{
    create_experiment, get_experiment, get_all_experiments,
    update_experiment, delete_experiment,
    add_reagent_to_experiment, get_experiment_reagents, remove_reagent_from_experiment,
    get_experiment_stats, start_experiment, complete_experiment, cancel_experiment,
    consume_experiment_reagent, auto_update_experiment_statuses,
    run_auto_update_statuses, seconds_until_next_transition,
};

// Room handlers
use room_handlers::{
    get_all_rooms, get_room, get_available_rooms
};

use auth_handlers::*;
use monitoring::{Metrics, RequestLogger, start_maintenance_tasks};
use error::ApiResult;

pub struct AppState {
    pub db_pool: SqlitePool,
    pub config: Config,
}

// ==================== EXPERIMENT PROTECTED WRAPPERS ====================

async fn create_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    experiment: web::Json<crate::models::experiment::CreateExperimentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Create, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();

    let mut cs = ChangeSet::new();
    cs.created("title", &experiment.title);
    if let Some(ref desc) = experiment.description {
        cs.created("description", desc);
    }
    if let Some(ref et) = experiment.experiment_type {
        cs.created("experiment_type", et);
    }
    if let Some(ref loc) = experiment.location {
        cs.created("location", loc);
    }

    let response = create_experiment(app_state.clone(), experiment, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "create", "experiment", "",
        &format!("Created experiment: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn update_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<crate::models::experiment::UpdateExperimentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let experiment_id = path.into_inner();

    // Fetch old experiment data for comparison
    let mut cs = ChangeSet::new();
    if let Ok(old) = sqlx::query_as::<_, (String, Option<String>, String, Option<String>)>(
        "SELECT title, description, status, location FROM experiments WHERE id = ?"
    ).bind(&experiment_id).fetch_one(&app_state.db_pool).await {
        if let Some(ref new_title) = update_data.title {
            cs.add("title", &old.0, new_title);
        }
        if let Some(ref new_desc) = update_data.description {
            cs.add_opt("description", &old.1, &Some(new_desc.clone()));
        }
        if let Some(ref new_loc) = update_data.location {
            cs.add_opt("location", &old.3, &Some(new_loc.clone()));
        }
    }

    let desc = if cs.has_changes() {
        format!("Experiment {} updated: {}", experiment_id, cs.to_description())
    } else {
        format!("Experiment {} updated", experiment_id)
    };

    let response = update_experiment(app_state.clone(), web::Path::from(experiment_id.clone()), update_data, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "edit", "experiment", &experiment_id,
        &desc, &cs, &http_request,
    ).await;
    Ok(response)
}

async fn delete_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Delete, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let experiment_id = path.into_inner();

    // Fetch data before deletion
    let mut cs = ChangeSet::new();
    if let Ok(old) = sqlx::query_as::<_, (String, String)>(
        "SELECT title, status FROM experiments WHERE id = ?"
    ).bind(&experiment_id).fetch_one(&app_state.db_pool).await {
        cs.deleted("title", &old.0);
        cs.deleted("status", &old.1);
    }

    let response = delete_experiment(app_state.clone(), web::Path::from(experiment_id.clone()), claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "delete", "experiment", &experiment_id,
        &format!("Deleted experiment: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn add_experiment_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    reagent: web::Json<experiment_handlers::AddReagentToExperimentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    add_reagent_to_experiment(app_state, path, reagent, claims.sub).await
}

async fn remove_experiment_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    remove_reagent_from_experiment(app_state, path, claims.sub).await
}

async fn start_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    start_experiment(app_state, path, claims.sub).await
}

async fn complete_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    complete_experiment(app_state, path, claims.sub).await
}

async fn cancel_experiment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    cancel_experiment(app_state, path, claims.sub).await
}

async fn consume_experiment_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_experiment_permission(&http_request, auth_handlers::ExperimentAction::Edit, &app_state.db_pool).await?;
    let claims = crate::auth::get_current_user(&http_request)?;
    consume_experiment_reagent(app_state, path, claims.sub).await
}

async fn auto_update_experiment_statuses_handler(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    auto_update_experiment_statuses(app_state).await
}

// ==================== REAGENT PROTECTED WRAPPERS ====================

async fn create_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    reagent: web::Json<crate::models::reagent::CreateReagentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission_async(&http_request, auth_handlers::ReagentAction::Create, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();

    let mut cs = ChangeSet::new();
    cs.created("name", &reagent.name);
    if let Some(ref v) = reagent.formula { cs.created("formula", v); }
    if let Some(ref v) = reagent.cas_number { cs.created("cas_number", v); }
    if let Some(ref v) = reagent.manufacturer { cs.created("manufacturer", v); }
    if let Some(ref v) = reagent.physical_state { cs.created("physical_state", v); }
    if let Some(ref v) = reagent.hazard_pictograms { cs.created("hazard_pictograms", v); }
    if let Some(ref v) = reagent.storage_conditions { cs.created("storage_conditions", v); }

    let response = reagent_handlers::create_reagent(app_state.clone(), reagent, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "create", "reagent", "",
        &format!("Created reagent: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn update_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<crate::models::reagent::UpdateReagentRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission_async(&http_request, auth_handlers::ReagentAction::Edit, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let reagent_id = path.into_inner();

    // Fetch old reagent for comparison
    let mut cs = ChangeSet::new();
    let mut reagent_name = reagent_id.clone();

    if let Ok(old) = sqlx::query_as::<_, (
        String, Option<String>, Option<f64>, Option<String>, Option<String>,
        Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String
    )>(
        "SELECT name, formula, molecular_weight, physical_state, cas_number, \
         manufacturer, description, storage_conditions, appearance, hazard_pictograms, status \
         FROM reagents WHERE id = ?"
    ).bind(&reagent_id).fetch_one(&app_state.db_pool).await {
        reagent_name = old.0.clone();
        if let Some(ref new_val) = update_data.name { cs.add("name", &old.0, new_val); }
        if let Some(ref new_val) = update_data.formula { cs.add_opt("formula", &old.1, &Some(new_val.clone())); }
        if let Some(new_val) = update_data.molecular_weight { cs.add_opt_f64("molecular_weight", old.2, Some(new_val)); }
        if let Some(ref new_val) = update_data.physical_state { cs.add_opt("physical_state", &old.3, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.cas_number { cs.add_opt("cas_number", &old.4, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.manufacturer { cs.add_opt("manufacturer", &old.5, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.description { cs.add_opt("description", &old.6, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.storage_conditions { cs.add_opt("storage_conditions", &old.7, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.appearance { cs.add_opt("appearance", &old.8, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.hazard_pictograms { cs.add_opt("hazard_pictograms", &old.9, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.status { cs.add("status", &old.10, new_val); }
    }

    let desc = if cs.has_changes() {
        format!("Reagent '{}' updated: {}", reagent_name, cs.to_description())
    } else {
        format!("Reagent '{}' updated", reagent_name)
    };

    let response = reagent_handlers::update_reagent(app_state.clone(), web::Path::from(reagent_id.clone()), update_data, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "edit", "reagent", &reagent_id,
        &desc, &cs, &http_request,
    ).await;
    Ok(response)
}

async fn delete_reagent_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_reagent_permission_async(&http_request, auth_handlers::ReagentAction::Delete, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let reagent_id = path.into_inner();

    // Fetch info before deletion
    let mut cs = ChangeSet::new();
    if let Ok(old) = sqlx::query_as::<_, (String, Option<String>, Option<String>, String)>(
        "SELECT name, cas_number, manufacturer, status FROM reagents WHERE id = ? AND deleted_at IS NULL"
    ).bind(&reagent_id).fetch_one(&app_state.db_pool).await {
        cs.deleted("name", &old.0);
        if let Some(ref cas) = old.1 { cs.deleted("cas_number", cas); }
        if let Some(ref mfr) = old.2 { cs.deleted("manufacturer", mfr); }
        cs.deleted("status", &old.3);
    }

    let response = reagent_handlers::delete_reagent(app_state.clone(), web::Path::from(reagent_id.clone()), claims.sub.clone()).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &claims.sub, "delete", "reagent", &reagent_id,
        &format!("Deleted reagent: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

// ==================== BATCH PROTECTED WRAPPERS ====================

async fn create_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    batch: web::Json<crate::models::batch::CreateBatchRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(&http_request, auth_handlers::BatchAction::Create, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let reagent_id = path.into_inner();

    // Fetch reagent name
    let reagent_name = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM reagents WHERE id = ?"
    ).bind(&reagent_id).fetch_optional(&app_state.db_pool).await
        .ok().flatten().map(|r| r.0).unwrap_or_else(|| reagent_id.clone());

    let mut cs = ChangeSet::new();
    cs.created("reagent", &reagent_name);
    cs.created("batch_number", &batch.batch_number);
    cs.created("quantity", &format!("{} {}", batch.quantity, batch.unit));
    if let Some(ref v) = batch.lot_number { cs.created("lot_number", v); }
    if let Some(ref v) = batch.supplier { cs.created("supplier", v); }
    if let Some(ref v) = batch.location { cs.created("location", v); }
    if let Some(ref v) = batch.cat_number { cs.created("cat_number", v); }
    if let Some(ref v) = batch.expiry_date { cs.created("expiry_date", &v.to_string()); }

    let response = batch_handlers::create_batch(app_state.clone(), web::Path::from(reagent_id.clone()), batch, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "create", "batch", "",
        &format!("Created batch for '{}': {}", reagent_name, cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn update_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update_data: web::Json<crate::models::batch::UpdateBatchRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(&http_request, auth_handlers::BatchAction::Edit, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let (reagent_id, batch_id) = path.into_inner();

    // Fetch old batch data for comparison
    let mut cs = ChangeSet::new();
    let mut batch_label = batch_id.clone();

    if let Ok(old) = sqlx::query_as::<_, (
        String, f64, String, String, Option<String>, Option<String>,
        Option<String>, Option<String>, Option<String>, Option<String>, Option<String>
    )>(
        "SELECT batch_number, quantity, unit, status, \
         lot_number, location, supplier, manufacturer, expiry_date, notes, cat_number \
         FROM batches WHERE id = ? AND reagent_id = ?"
    ).bind(&batch_id).bind(&reagent_id).fetch_one(&app_state.db_pool).await {
        batch_label = old.0.clone();

        if let Some(ref new_val) = update_data.batch_number { cs.add("batch_number", &old.0, new_val); }
        if let Some(new_val) = update_data.quantity { cs.add_f64("quantity", old.1, new_val); }
        if let Some(ref new_val) = update_data.unit { cs.add("unit", &old.2, new_val); }
        if let Some(ref new_val) = update_data.status { cs.add("status", &old.3, new_val); }
        if let Some(ref new_val) = update_data.lot_number { cs.add_opt("lot_number", &old.4, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.location { cs.add_opt("location", &old.5, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.supplier { cs.add_opt("supplier", &old.6, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.manufacturer { cs.add_opt("manufacturer", &old.7, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.expiry_date { cs.add_opt("expiry_date", &old.8, &Some(new_val.to_string())); }
        if let Some(ref new_val) = update_data.notes { cs.add_opt("notes", &old.9, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.cat_number { cs.add_opt("cat_number", &old.10, &Some(new_val.clone())); }
    }

    // Fetch reagent name for description
    let reagent_name = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM reagents WHERE id = ?"
    ).bind(&reagent_id).fetch_optional(&app_state.db_pool).await
        .ok().flatten().map(|r| r.0).unwrap_or_else(|| reagent_id.clone());

    let desc = if cs.has_changes() {
        format!("Batch {} of reagent '{}' updated: {}", batch_label, reagent_name, cs.to_description())
    } else {
        format!("Batch {} of reagent '{}' updated", batch_label, reagent_name)
    };

    let response = batch_handlers::update_batch(app_state.clone(), web::Path::from((reagent_id.clone(), batch_id.clone())), update_data, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "edit", "batch", &batch_id,
        &desc, &cs, &http_request,
    ).await;
    Ok(response)
}

async fn delete_batch_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(&http_request, auth_handlers::BatchAction::Delete, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let (reagent_id, batch_id) = path.into_inner();

    // Fetch info before deletion
    let mut cs = ChangeSet::new();
    let reagent_name = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM reagents WHERE id = ?"
    ).bind(&reagent_id).fetch_optional(&app_state.db_pool).await
        .ok().flatten().map(|r| r.0).unwrap_or_else(|| reagent_id.clone());

    if let Ok(old) = sqlx::query_as::<_, (String, f64, String, String, Option<String>)>(
        "SELECT batch_number, quantity, unit, status, lot_number FROM batches WHERE id = ? AND reagent_id = ?"
    ).bind(&batch_id).bind(&reagent_id).fetch_one(&app_state.db_pool).await {
        cs.deleted("batch_number", &old.0);
        cs.deleted("quantity", &format!("{} {}", old.1, old.2));
        cs.deleted("status", &old.3);
        if let Some(ref lot) = old.4 { cs.deleted("lot_number", lot); }
    }

    // FIXED: pass user_id as third argument
    let response = batch_handlers::delete_batch(app_state.clone(), web::Path::from((reagent_id.clone(), batch_id.clone())), claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "delete", "batch", &batch_id,
        &format!("Deleted batch of reagent '{}': {}", reagent_name, cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

// ==================== EQUIPMENT PROTECTED WRAPPERS ====================

async fn create_equipment_protected(
    app_state: web::Data<Arc<AppState>>,
    equipment: web::Json<CreateEquipmentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Create, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();

    let mut cs = ChangeSet::new();
    cs.created("name", &equipment.name);
    cs.created("type", &equipment.type_);
    cs.created("quantity", &format!("{}", equipment.quantity));
    if let Some(ref v) = equipment.location { cs.created("location", v); }
    if let Some(ref v) = equipment.serial_number { cs.created("serial_number", v); }
    if let Some(ref v) = equipment.manufacturer { cs.created("manufacturer", v); }
    if let Some(ref v) = equipment.model { cs.created("model", v); }
 

    let response = equipment_handlers::create_equipment(app_state.clone(), equipment, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "create", "equipment", "",
        &format!("Created equipment: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn update_equipment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<UpdateEquipmentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let equipment_id = path.into_inner();

    let mut cs = ChangeSet::new();
    let mut equip_name = equipment_id.clone();

    if let Ok(old) = sqlx::query_as::<_, (
        String, i64, String, Option<String>, Option<String>,
        Option<String>, Option<String>, Option<String>
    )>(
        "SELECT name, quantity, status, location, serial_number, \
         manufacturer, model, description FROM equipment WHERE id = ?"
    ).bind(&equipment_id).fetch_one(&app_state.db_pool).await {
        equip_name = old.0.clone();
        if let Some(ref new_val) = update_data.name { cs.add("name", &old.0, new_val); }
        if let Some(new_val) = update_data.quantity { cs.add_i64("quantity", old.1, new_val as i64); }
        if let Some(ref new_val) = update_data.status { cs.add("status", &old.2, new_val); }
        if let Some(ref new_val) = update_data.location { cs.add_opt("location", &old.3, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.serial_number { cs.add_opt("serial_number", &old.4, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.manufacturer { cs.add_opt("manufacturer", &old.5, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.model { cs.add_opt("model", &old.6, &Some(new_val.clone())); }
        if let Some(ref new_val) = update_data.description { cs.add_opt("description", &old.7, &Some(new_val.clone())); }
    }

    let desc = if cs.has_changes() {
        format!("Equipment '{}' updated: {}", equip_name, cs.to_description())
    } else {
        format!("Equipment '{}' updated", equip_name)
    };

    let response = equipment_handlers::update_equipment(app_state.clone(), web::Path::from(equipment_id.clone()), update_data, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "edit", "equipment", &equipment_id,
        &desc, &cs, &http_request,
    ).await;
    Ok(response)
}

async fn delete_equipment_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Delete, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let equipment_id = path.into_inner();

    let mut cs = ChangeSet::new();
    if let Ok(old) = sqlx::query_as::<_, (String, String, String)>(
        "SELECT name, type_, status FROM equipment WHERE id = ?"
    ).bind(&equipment_id).fetch_one(&app_state.db_pool).await {
        cs.deleted("name", &old.0);
        cs.deleted("type", &old.1);
        cs.deleted("status", &old.2);
    }

    let response = equipment_handlers::delete_equipment(app_state.clone(), web::Path::from(equipment_id.clone())).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &claims.sub, "delete", "equipment", &equipment_id,
        &format!("Deleted equipment: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

// Parts
async fn get_equipment_parts_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    get_equipment_parts(app_state, path).await
}

async fn add_equipment_part_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    part: web::Json<CreateEquipmentPartRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    add_equipment_part(app_state, path, part, claims.sub).await
}

async fn update_equipment_part_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update: web::Json<UpdateEquipmentPartRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    update_equipment_part(app_state, path, update, claims.sub).await
}

async fn delete_equipment_part_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Delete, &app_state.db_pool).await?;
    delete_equipment_part(app_state, path).await
}

// Maintenance - FIXED: removed query parameter
async fn get_equipment_maintenance_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    get_equipment_maintenance(app_state, path).await
}

async fn create_maintenance_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    maintenance: web::Json<CreateMaintenanceRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    create_maintenance(app_state, path, maintenance, claims.sub).await
}

async fn update_maintenance_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update: web::Json<UpdateMaintenanceRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    update_maintenance(app_state, path, update, claims.sub).await
}

async fn complete_maintenance_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    body: web::Json<CompleteMaintenanceRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    complete_maintenance(app_state, path, body, claims.sub).await
}

async fn delete_maintenance_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Delete, &app_state.db_pool).await?;
    delete_maintenance(app_state, path).await
}

// Files
async fn get_equipment_files_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    get_equipment_files(app_state, path).await
}

async fn upload_equipment_file_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    payload: Multipart,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth_handlers::get_claims_from_request(&http_request)?;
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Edit, &app_state.db_pool).await?;
    upload_equipment_file(app_state, path, payload, claims.sub).await
}

async fn download_equipment_file_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
) -> ApiResult<HttpResponse> {
    download_equipment_file(app_state, path).await
}

async fn delete_equipment_file_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_equipment_permission(&http_request, auth_handlers::EquipmentAction::Delete, &app_state.db_pool).await?;
    delete_equipment_file(app_state, path).await
}

async fn get_part_files_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
) -> ApiResult<HttpResponse> {
    get_part_files(app_state, path).await
}

// ==================== ROOM PROTECTED WRAPPERS ====================

async fn create_room_protected(
    app_state: web::Data<Arc<AppState>>,
    room: web::Json<crate::models::room::CreateRoomRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_room_permission(&http_request, auth_handlers::RoomAction::Create, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();

    let mut cs = ChangeSet::new();
    cs.created("name", &room.name);
    if let Some(ref v) = room.description { cs.created("description", v); }
    if let Some(v) = room.capacity { cs.created("capacity", &format!("{}", v)); }

    let response = room_handlers::create_room(app_state.clone(), room, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "create", "room", "",
        &format!("Created room: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

async fn update_room_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<crate::models::room::UpdateRoomRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_room_permission(&http_request, auth_handlers::RoomAction::Edit, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let user_id = claims.sub.clone();
    let room_id = path.into_inner();

    let mut cs = ChangeSet::new();
    let mut room_name = room_id.clone();

    if let Ok(old) = sqlx::query_as::<_, (String, Option<String>, Option<i64>, String)>(
        "SELECT name, description, capacity, status FROM rooms WHERE id = ?"
    ).bind(&room_id).fetch_one(&app_state.db_pool).await {
        room_name = old.0.clone();
        if let Some(ref new_val) = update_data.name { cs.add("name", &old.0, new_val); }
        if let Some(ref new_val) = update_data.description { cs.add_opt("description", &old.1, &Some(new_val.clone())); }
        if let Some(new_val) = update_data.capacity {
            cs.add_i64("capacity", old.2.unwrap_or(0), new_val as i64);
        }
    }

    let desc = if cs.has_changes() {
        format!("Room '{}' updated: {}", room_name, cs.to_description())
    } else {
        format!("Room '{}' updated", room_name)
    };

    let response = room_handlers::update_room(app_state.clone(), web::Path::from(room_id.clone()), update_data, claims.sub).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &user_id, "edit", "room", &room_id,
        &desc, &cs, &http_request,
    ).await;
    Ok(response)
}

async fn delete_room_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    auth_handlers::check_room_permission(&http_request, auth_handlers::RoomAction::Delete, &app_state.db_pool).await?;
    let claims = auth::get_current_user(&http_request)?;
    let room_id = path.into_inner();

    let mut cs = ChangeSet::new();
    if let Ok(old) = sqlx::query_as::<_, (String, String)>(
        "SELECT name, status FROM rooms WHERE id = ?"
    ).bind(&room_id).fetch_one(&app_state.db_pool).await {
        cs.deleted("name", &old.0);
        cs.deleted("status", &old.1);
    }

    let response = room_handlers::delete_room(app_state.clone(), web::Path::from(room_id.clone())).await?;
    audit::audit_with_changes(
        &app_state.db_pool, &claims.sub, "delete", "room", &room_id,
        &format!("Deleted room: {}", cs.to_description()),
        &cs, &http_request,
    ).await;
    Ok(response)
}

// ==================== PLACEMENT PROTECTED WRAPPERS ====================

async fn create_placement_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    request: web::Json<crate::models::batch_placement::CreatePlacementRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(
        &http_request, auth_handlers::BatchAction::Edit, &app_state.db_pool
    ).await?;
    placement_handlers::create_placement(app_state, path, request, http_request).await
}

async fn update_placement_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    request: web::Json<crate::models::batch_placement::UpdatePlacementRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(
        &http_request, auth_handlers::BatchAction::Edit, &app_state.db_pool
    ).await?;
    placement_handlers::update_placement(app_state, path, request, http_request).await
}

async fn delete_placement_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(
        &http_request, auth_handlers::BatchAction::Delete, &app_state.db_pool
    ).await?;
    placement_handlers::delete_placement(app_state, path, http_request).await
}

async fn move_placement_protected(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    request: web::Json<crate::models::batch_placement::MovePlacementRequest>,
    http_request: HttpRequest,
) -> error::ApiResult<HttpResponse> {
    auth_handlers::check_batch_permission_async(
        &http_request, auth_handlers::BatchAction::Edit, &app_state.db_pool
    ).await?;
    placement_handlers::move_placement(app_state, path, request, http_request).await
}

// ==================== STUB HANDLERS FOR MISSING FUNCTIONS ====================

// FIXED: Add logout stub handler
async fn logout(
    _http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    // JWT tokens are stateless - logout is handled client-side by removing the token
    Ok(HttpResponse::Ok().json(handlers::ApiResponse::<()>::success_with_message(
        (),
        "Logged out successfully".to_string(),
    )))
}
async fn rebuild_cache_protected(
    app_state: web::Data<Arc<AppState>>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = auth::get_current_user(&http_request)?;
        if claims.role != crate::auth::UserRole::Admin {
            return Err(crate::error::ApiError::Forbidden("Admin access required".to_string()));
    }

    reagent_handlers::rebuild_cache(app_state).await
}
// ==================== MAIN ====================

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    // Load configuration (this calls load_env_file internally)
    let config = load_config()?;

    // Setup logging
    setup_logging(&config)?;

    // Validate production config
    if env::var("LIMS_ENV").as_deref() == Ok("production") {
        validate_production_config(&config)?;
    }

    // Setup database
    setup_database(&config.database.url).await?;

    // Create database pool
    let pool = create_database_pool(&config.database).await?;

    // Run migrations
    db::run_migrations(&pool).await?;

    // Initialize JWT rotation table
    jwt_rotation::init_rotation_table(&pool).await?;

    // Create auth service
    let auth_service = Arc::new(AuthService::new(&config.auth.jwt_secret));

    // Create default admin if needed
    create_default_admin_if_needed(&pool, &auth_service).await?;

    // Create app state
    let app_state = Arc::new(AppState {
        db_pool: pool.clone(),
        config: config.clone(),
    });

    // Start maintenance tasks
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        start_maintenance_tasks(pool_clone).await;
    });

    // Фоновая задача: авто-обновление статусов экспериментов (event-driven, не поллинг)
    // Спрашивает у БД «через сколько секунд ближайшее событие?» и спит ровно до него.
    // Если нет pending экспериментов — спит 5 минут и проверяет снова (на случай новых).
    let experiment_pool = pool.clone();
    tokio::spawn(async move {
        use tokio::time::{sleep, Duration};

        const MAX_IDLE_SECS: u64 = 300; // 5 мин — проверка если нет pending
        const MIN_PAUSE_SECS: u64 = 2;  // Минимальная пауза (защита от busy loop)

        sleep(Duration::from_secs(5)).await; // Даём серверу стартовать
        log::info!("Experiment auto-update task started (event-driven, idle check: {}s)", MAX_IDLE_SECS);

        loop {
            // 1. Спрашиваем: сколько секунд до ближайшего перехода?
            let sleep_secs = match seconds_until_next_transition(&experiment_pool).await {
                Ok(Some(secs)) if secs <= 0 => {
                    // Уже просрочено — обрабатываем сейчас
                    match run_auto_update_statuses(&experiment_pool).await {
                        Ok(r) if r.total_updated > 0 => {
                            log::info!(
                                "BG auto-update: {} started, {} completed (reagents consumed)",
                                r.started, r.completed
                            );
                        }
                        Err(e) => log::error!("BG auto-update error: {}", e),
                        _ => {}
                    }
                    MIN_PAUSE_SECS // Короткая пауза, потом проверяем снова
                }
                Ok(Some(secs)) => {
                    // Есть событие через N секунд — спим до него (+1 сек буфер)
                    let wait = (secs as u64).min(MAX_IDLE_SECS) + 1;
                    log::debug!("Next experiment transition in ~{}s, sleeping {}s", secs, wait);
                    wait
                }
                Ok(None) => {
                    // Нет pending экспериментов — спим долго
                    MAX_IDLE_SECS
                }
                Err(e) => {
                    log::error!("BG next-transition query error: {}", e);
                    MAX_IDLE_SECS
                }
            };

            sleep(Duration::from_secs(sleep_secs)).await;
        }
    });

    // Start JWT rotation background task
    let rotation_pool = pool.clone();
    let env_file = env::var("ENV_FILE").unwrap_or_else(|_| ".env".to_string());
    tokio::spawn(async move {
        jwt_rotation::start_rotation_task(rotation_pool, env_file).await;
    });

    let bind_address = format!("{}:{}", config.server.host, config.server.port);
    log::info!("Starting server at http://{}", bind_address);

    // Create metrics
    let metrics_arc = Arc::new(Metrics::new());
    let metrics = web::Data::from(metrics_arc.clone());

    HttpServer::new(move || {
        let cors = setup_improved_cors(&config.security.allowed_origins);
        let auth_middleware = HttpAuthentication::bearer(jwt_middleware);
        let security_headers = setup_security_headers(&config.security);

        // Create App and save to variable
        let app = App::new()
            .wrap(cors)
            .wrap(security_headers)
            .wrap(Logger::default())
            .wrap(Compress::default())
            .wrap(RequestLogger::new(metrics_arc.clone()))
            .app_data(web::Data::new(app_state.clone()))
            .app_data(web::Data::new(auth_service.clone()))
            .app_data(metrics.clone())

            // Health check and metrics (no auth)
            .service(
                web::scope("/health")
                    .route("", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
                    .route("/metrics", web::get().to(monitoring::metrics_endpoint))
            )

            // Auth endpoints (no authentication required)
            .service(
                web::scope("/auth")
                    .route("/login", web::post().to(login))
                    .route("/register", web::post().to(register))
            )

            // Public file access (endpoints)
            .service(
                web::scope("/api/v1/public")
                    .route("/equipment/{id}/files/{file_id}", web::get().to(download_equipment_file))
            )

            // Protected API endpoints
            .service(
                web::scope("/api/v1")
                    .wrap(auth_middleware)
                    // Unit conversion
                    .service(
                        web::scope("/units")
                            .route("/convert", web::post().to(batch_handlers::convert_units))
                    )

                    // Auth management
                    .service(
                        web::scope("/auth")
                            .route("/profile", web::get().to(get_profile))
                            .route("/change-password", web::post().to(change_password))
                            .route("/logout", web::post().to(logout))
                            .route("/roles", web::get().to(get_roles))
                            .route("/users", web::get().to(get_users))
                            .route("/users", web::post().to(create_user))
                            .route("/users/{id}", web::get().to(get_user))
                            .route("/users/{id}", web::put().to(update_user))
                            .route("/users/{id}", web::delete().to(delete_user))
                            .route("/users/{id}/reset-password", web::put().to(change_user_password))
                            // User Permissions & Activity
                            .route("/users/{id}/permissions", web::get().to(auth_handlers::get_user_permissions))
                            .route("/users/{id}/permissions", web::put().to(auth_handlers::update_user_permissions))
                            .route("/users/{id}/activity", web::get().to(auth_handlers::get_user_activity))
                            .route("/jwt/status", web::get().to(get_jwt_rotation_status))
                            .route("/jwt/rotate", web::post().to(force_jwt_rotation))
                    )

                    // Dashboard
                    .service(
                        web::scope("/dashboard")
                            .route("/stats", web::get().to(get_dashboard_stats))
                            .route("/recent-activity", web::get().to(get_recent_activity))
                            .route("/trends", web::get().to(get_dashboard_trends))
                    )
                    // Admin (cache management)
                    .service(
                        web::scope("/admin")
                            .route("/cache/rebuild", web::post().to(rebuild_cache_protected))
                    )
                    // Batches
                    .service(
                        web::scope("/batches")
                            .route("/filter", web::post().to(filter_handlers::get_batches_filtered))
                            .route("/preset/{preset}", web::get().to(filter_handlers::get_batches_by_preset))
                            .route("", web::get().to(get_all_batches))
                            .route("/low-stock", web::get().to(get_low_stock_batches))
                            .route("/expiring", web::get().to(get_expiring_batches))
                            .route("/export", web::get().to(export_batches))
                            .route("/import", web::post().to(import_batches))
                            .route("/import/json", web::post().to(import_batches_json))
                            .route("/import/excel", web::post().to(import_batches_excel))
                            .route("/{batch_id}/placements", web::get().to(placement_handlers::get_batch_placements))
                            .route("/{batch_id}/placements", web::post().to(create_placement_protected))
                            .route("/{batch_id}/placements/move", web::post().to(move_placement_protected))
                            .route("/{batch_id}/placements/{placement_id}", web::put().to(update_placement_protected))
                            .route("/{batch_id}/placements/{placement_id}", web::delete().to(delete_placement_protected))
                    )

                    // Reagents
                    .service(
                        web::scope("/reagents")
                            .route("", web::post().to(create_reagent_protected))
                            .route("", web::get().to(get_reagents))
                            .route("/search", web::get().to(search_reagents))
                            .route("/export", web::get().to(export_reagents))
                            .route("/import", web::post().to(import_reagents))
                            .route("/import/json", web::post().to(import_reagents_json))
                            .route("/import/excel", web::post().to(import_reagents_excel))
                            .route("/{id}", web::get().to(get_reagent_by_id))
                            .route("/{id}", web::put().to(update_reagent_protected))
                            .route("/{id}", web::delete().to(delete_reagent_protected))
                            .route("/{id}/details", web::get().to(get_reagent_with_batches))
                            .route("/{id}/batches", web::get().to(get_batches_for_reagent))
                            .route("/{id}/batches", web::post().to(create_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}", web::get().to(get_batch))
                            .route("/{reagent_id}/batches/{batch_id}", web::put().to(update_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}", web::delete().to(delete_batch_protected))
                            .route("/{reagent_id}/batches/{batch_id}/use", web::post().to(use_reagent))
                            .route("/{reagent_id}/batches/{batch_id}/usage", web::get().to(get_usage_history))
                            .route("/{reagent_id}/batches/{batch_id}/dispense-units", web::post().to(dispense_units))
                            .route("/{reagent_id}/batches/{batch_id}/units-info", web::get().to(get_batch_units_info))
                    )

                    // Equipment
                    .service(
                        web::scope("/equipment")
                            .route("", web::post().to(create_equipment_protected))
                            .route("", web::get().to(get_equipment))
                            .route("/search", web::get().to(search_equipment))
                            .route("/export", web::get().to(export_equipment))
                            .route("/import", web::post().to(import_equipment))
                            .route("/import/json", web::post().to(import_equipment_json))
                            .route("/import/excel", web::post().to(import_equipment_excel))
                            .route("/{id}", web::get().to(get_equipment_by_id))
                            .route("/{id}", web::put().to(update_equipment_protected))
                            .route("/{id}", web::delete().to(delete_equipment_protected))
                            .route("/{id}/parts", web::get().to(get_equipment_parts_protected))
                            .route("/{id}/parts", web::post().to(add_equipment_part_protected))
                            .route("/{id}/parts/{part_id}", web::put().to(update_equipment_part_protected))
                            .route("/{id}/parts/{part_id}", web::delete().to(delete_equipment_part_protected))
                            .route("/{id}/parts/{part_id}/files", web::get().to(get_part_files_protected))
                            .route("/{id}/maintenance", web::get().to(get_equipment_maintenance_protected))
                            .route("/{id}/maintenance", web::post().to(create_maintenance_protected))
                            .route("/{id}/maintenance/{maintenance_id}", web::put().to(update_maintenance_protected))
                            .route("/{id}/maintenance/{maintenance_id}/complete", web::post().to(complete_maintenance_protected))
                            .route("/{id}/maintenance/{maintenance_id}", web::delete().to(delete_maintenance_protected))
                            .route("/{id}/files", web::get().to(get_equipment_files_protected))
                            .route("/{id}/files", web::post().to(upload_equipment_file_protected))
                            .route("/{id}/files/{file_id}", web::get().to(download_equipment_file_protected))
                            .route("/{id}/files/{file_id}", web::delete().to(delete_equipment_file_protected))
                    )

                    // Rooms
                    .service(
                        web::scope("/rooms")
                            .route("", web::get().to(get_all_rooms))
                            .route("", web::post().to(create_room_protected))
                            .route("/available", web::get().to(get_available_rooms))
                            .route("/{id}", web::get().to(get_room))
                            .route("/{id}", web::put().to(update_room_protected))
                            .route("/{id}", web::delete().to(delete_room_protected))
                            .route("/{id}/inventory", web::get().to(placement_handlers::get_room_inventory))
                            .route("/{id}/placements", web::get().to(placement_handlers::get_room_placements))
                    )

                    // Experiments
                    .service(
                        web::scope("/experiments")
                            .route("", web::post().to(create_experiment_protected))
                            .route("", web::get().to(get_all_experiments))
                            .route("/stats", web::get().to(get_experiment_stats))
                            .route("/filter", web::post().to(filter_handlers::get_experiments_filtered))
                            .route("/auto-update-statuses", web::post().to(auto_update_experiment_statuses_handler))
                            .route("/diagnose-dates", web::get().to(experiment_handlers::diagnose_experiment_dates))
                            .route("/{id}", web::get().to(get_experiment))
                            .route("/{id}", web::put().to(update_experiment_protected))
                            .route("/{id}", web::delete().to(delete_experiment_protected))
                            .route("/{id}/start", web::post().to(start_experiment_protected))
                            .route("/{id}/complete", web::post().to(complete_experiment_protected))
                            .route("/{id}/cancel", web::post().to(cancel_experiment_protected))
                            .route("/{id}/reagents", web::get().to(get_experiment_reagents))
                            .route("/{id}/reagents", web::post().to(add_experiment_reagent_protected))
                            .route("/{id}/reagents/{reagent_id}", web::delete().to(remove_experiment_reagent_protected))
                            .route("/{id}/reagents/{reagent_id}/consume", web::post().to(consume_experiment_reagent_protected))
                    )

                    // Reports
                    .service(
                        web::scope("/reports")
                            .route("/presets", web::get().to(report_handlers::get_report_presets))
                            .route("/fields", web::get().to(report_handlers::get_report_fields))
                            .route("/generate", web::post().to(report_handlers::generate_report))
                            .route("/export", web::post().to(report_handlers::export_report))
                    )
            ); // <-- End of chain, app contains everything

        // Add static files to the SAME app
        if env::var("LIMS_ENV").as_deref() == Ok("production") {
            let build_dir = env::var("FRONTEND_BUILD_DIR")
                .map(|s| PathBuf::from(s))
                .unwrap_or_else(|_| {
                    PathBuf::from("..")
                        .join("lims-frontend")
                        .join("build")
                });
            let build_dir_str = build_dir.to_string_lossy().to_string();
            app.service(Files::new("/static", format!("{}/static", build_dir_str)))
                .service(Files::new("/assets", format!("{}/assets", build_dir_str)))
                .default_service(web::route().to(serve_index))
        } else {
            app.route("/", web::get().to(serve_index))
        }
    })
        .bind(&bind_address)?
        .run()
        .await
        .context("Server failed to run")?;

    Ok(())
}

// ==================== HELPER FUNCTIONS ====================

pub fn setup_improved_cors(allowed_origins: &[String]) -> Cors {
    println!("=== CORS DEBUG ===");
    println!("Environment ALLOWED_ORIGINS: {:?}", std::env::var("ALLOWED_ORIGINS"));
    println!("Config allowed_origins: {:?}", allowed_origins);
    println!("LIMS_ENV: {:?}", std::env::var("LIMS_ENV"));

    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allowed_headers(vec![
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::USER_AGENT,
            header::REFERER,
        ])
        .expose_headers(vec![header::CONTENT_LENGTH])
        .max_age(3600);

    let is_production = std::env::var("LIMS_ENV").as_deref() == Ok("production");

    if allowed_origins.contains(&"*".to_string()) {
        if is_production {
            log::error!("âŒ FATAL: Wildcard CORS origin (*) is not allowed in production!");
            log::error!("âŒ Please specify exact allowed origins in ALLOWED_ORIGINS environment variable");
            panic!("Cannot start server with wildcard CORS in production");
        } else {
            log::warn!("âš ï¸  Using wildcard CORS (*) in development mode");
            println!("DEBUG: Using permissive CORS (allow_any_origin)");
            cors = cors.allow_any_origin().allow_any_header().allow_any_method();
        }
    } else if !is_production {
        println!("DEBUG: Development mode with specific origins");
        for origin in allowed_origins {
            println!("Adding CORS origin: {}", origin);
            cors = cors.allowed_origin(origin);
        }
    } else {
        println!("DEBUG: Production mode with strict CORS");
        for origin in allowed_origins {
            if origin.is_empty() {
                continue;
            }
            println!("Adding CORS origin: {}", origin);
            cors = cors.allowed_origin(origin);
        }
    }

    println!("=== END CORS DEBUG ===");
    cors
}

#[deprecated(note = "Use setup_improved_cors instead")]
pub fn setup_cors(allowed_origins: &[String]) -> Cors {
    setup_improved_cors(allowed_origins)
}

fn setup_logging(config: &Config) -> anyhow::Result<()> {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            let level = config.logging.level.as_str();
            tracing_subscriber::EnvFilter::new(level)
        });

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    Ok(())
}

fn validate_production_config(config: &Config) -> anyhow::Result<()> {
    if config.auth.jwt_secret == "your-secret-key-here" || config.auth.jwt_secret.len() < 32 {
        anyhow::bail!("Insecure JWT secret in production! Must be at least 32 characters.");
    }

    if config.security.allowed_origins.contains(&"*".to_string()) {
        anyhow::bail!("Wildcard CORS origins not allowed in production!");
    }

    Ok(())
}

async fn setup_database(database_url: &str) -> anyhow::Result<()> {
    if !Sqlite::database_exists(database_url).await.unwrap_or(false) {
        log::info!("Creating database: {}", database_url);
        Sqlite::create_database(database_url).await?;
    }
    Ok(())
}

async fn create_database_pool(db_config: &crate::config::DatabaseConfig) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(&db_config.url)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await?;
    Ok(pool)
}

fn setup_security_headers(config: &crate::config::SecurityConfig) -> DefaultHeaders {
    let mut headers = DefaultHeaders::new()
        .add(("X-Content-Type-Options", "nosniff"))
        .add(("X-Frame-Options", "DENY"))
        .add(("X-XSS-Protection", "1; mode=block"))
        .add(("Referrer-Policy", "strict-origin-when-cross-origin"));

    if config.require_https {
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
        use crate::auth::{RegisterRequest, UserRole};

        let password = env::var("DEFAULT_ADMIN_PASSWORD").unwrap_or_else(|_| {
            let mut rng = thread_rng();
            let digits: Vec<char> = "0123456789".chars().collect();
            let specials: Vec<char> = "!@#$%^&*()_+-=[]{}|;:,.<>?".chars().collect();
            let uppercase: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect();
            let lowercase: Vec<char> = "abcdefghijklmnopqrstuvwxyz".chars().collect();
            let alphanumeric = Alphanumeric;

            let mut pwd_chars: Vec<char> = Vec::new();

            pwd_chars.push(*digits.choose(&mut rng).unwrap());
            pwd_chars.push(*specials.choose(&mut rng).unwrap());
            pwd_chars.push(*uppercase.choose(&mut rng).unwrap());
            pwd_chars.push(*lowercase.choose(&mut rng).unwrap());

            for _ in 0..8 {
                if rng.gen_bool(0.5) {
                    if rng.gen_bool(0.5) {
                        let sample_u8 = alphanumeric.sample(&mut rng);
                        pwd_chars.push(char::from_u32(sample_u8 as u32).unwrap());
                    } else {
                        pwd_chars.push(*digits.choose(&mut rng).unwrap());
                    }
                } else {
                    pwd_chars.push(*specials.choose(&mut rng).unwrap());
                }
            }

            pwd_chars.shuffle(&mut rng);

            let pwd: String = pwd_chars.into_iter().collect();
            log::warn!("Generated admin password: {}", pwd);
            pwd
        });

        let admin_request = RegisterRequest {
            username: "admin".to_string(),
            email: "admin@lims.local".to_string(),
            password: password.clone(),
            role: None,
        };

        let mut user = crate::auth::User::create(pool, admin_request, UserRole::Viewer, auth_service)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create default admin user: {}", e))?;

        let update_result = sqlx::query(
            "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?"
        )
            .bind("admin")
            .bind(&user.id)
            .execute(pool)
            .await?;

        if update_result.rows_affected() == 0 {
            return Err(anyhow::anyhow!("Failed to promote default user to Admin"));
        }

        user.role = "admin".to_string();

        log::warn!("Default admin user created and promoted to Admin:");
        log::warn!("  Username: admin");
        log::warn!("  Password: {} (generated - CHANGE IMMEDIATELY!)", password);
        log::warn!("  âš ï¸  Login at http://127.0.0.1:8080 and update your password");
    }

    Ok(())
}

async fn serve_index() -> Result<NamedFile> {
    let path: PathBuf = match env::var("LIMS_ENV").as_deref() {
        Ok("production") => {
            let build_dir = env::var("FRONTEND_BUILD_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    PathBuf::from("..")
                        .join("lims-frontend")
                        .join("build")
                });
            build_dir.join("index.html")
        }
        _ => {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("web_interface.html")
        }
    };

    Ok(NamedFile::open(path)?)
}