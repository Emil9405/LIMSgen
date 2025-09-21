use actix_web::{web, HttpResponse, HttpRequest};
use uuid::Uuid;
use validator::Validate;
use std::sync::Arc;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

// Import from models module instead of redefining
use crate::models::{
    Reagent, Batch, CreateReagentRequest, UpdateReagentRequest,
    CreateBatchRequest, UpdateBatchRequest
};
use crate::error::{ApiError, ApiResult, validate_cas_number, validate_quantity, validate_unit};
use crate::auth::get_current_user;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    pub fn success_with_message(data: T, message: String) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: Some(message),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub search: Option<String>,
    pub status: Option<String>,
}

impl PaginationQuery {
    pub fn normalize(&self) -> (i64, i64, i64) {
        let page = self.page.unwrap_or(1).max(1);
        let per_page = self.per_page.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * per_page;
        (page, per_page, offset)
    }
}

#[derive(Debug, Serialize)]
pub struct ReagentWithBatches {
    #[serde(flatten)]
    pub reagent: Reagent,
    pub batches: Vec<Batch>,
}

// ==================== REAGENT HANDLERS ====================

pub async fn create_reagent_with_user(
    app_state: web::Data<Arc<AppState>>,
    reagent: web::Json<CreateReagentRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    reagent.validate()?;

    if let Some(ref cas) = reagent.cas_number {
        validate_cas_number(cas)?;
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let existing_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reagents WHERE name = ?"
    )
        .bind(&reagent.name)
        .fetch_one(&app_state.db_pool)
        .await?;

    if existing_count.0 > 0 {
        return Err(ApiError::reagent_already_exists(&reagent.name));
    }

    sqlx::query(
        r#"INSERT INTO reagents
           (id, name, formula, cas_number, manufacturer, description, status, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)"#
    )
        .bind(&id)
        .bind(&reagent.name)
        .bind(&reagent.formula)
        .bind(&reagent.cas_number)
        .bind(&reagent.manufacturer)
        .bind(&reagent.description)
        .bind(&user_id)
        .bind(&user_id)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await?;

    log::info!("Reagent created: {} ({}) by user {}", reagent.name, id, user_id);

    Ok(HttpResponse::Created().json(ApiResponse::success_with_message(
        serde_json::json!({"id": id}),
        "Reagent created successfully".to_string(),
    )))
}

pub async fn get_reagents(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let (page, per_page, offset) = query.normalize();

    let mut where_clause = "WHERE 1=1".to_string();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(status) = &query.status {
        where_clause.push_str(" AND status = ?");
        bind_values.push(status.clone());
    }

    if let Some(search) = &query.search {
        where_clause.push_str(" AND (name LIKE ? OR formula LIKE ? OR cas_number LIKE ?)");
        let search_pattern = format!("%{}%", search);
        bind_values.push(search_pattern.clone());
        bind_values.push(search_pattern.clone());
        bind_values.push(search_pattern);
    }

    let count_query = format!("SELECT COUNT(*) FROM reagents {}", where_clause);
    let mut count_query_builder = sqlx::query_as::<_, (i64,)>(&count_query);
    for value in &bind_values {
        count_query_builder = count_query_builder.bind(value);
    }
    let total: i64 = count_query_builder.fetch_one(&app_state.db_pool).await?.0;

    let data_query = format!(
        "SELECT * FROM reagents {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        where_clause
    );
    let mut data_query_builder = sqlx::query_as::<_, Reagent>(&data_query);
    for value in &bind_values {
        data_query_builder = data_query_builder.bind(value);
    }
    data_query_builder = data_query_builder.bind(per_page).bind(offset);

    let reagents = data_query_builder.fetch_all(&app_state.db_pool).await?;

    let total_pages = (total + per_page - 1) / per_page;

    let response = PaginatedResponse {
        data: reagents,
        total,
        page,
        per_page,
        total_pages,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

pub async fn get_reagent_by_id(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    let reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(reagent)))
}

pub async fn update_reagent_with_user(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update_data: web::Json<UpdateReagentRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();
    update_data.validate()?;

    if let Some(ref cas) = update_data.cas_number {
        validate_cas_number(cas)?;
    }

    let existing_reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    if let Some(ref new_name) = update_data.name {
        if new_name != &existing_reagent.name {
            let name_count: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM reagents WHERE name = ? AND id != ?"
            )
                .bind(new_name)
                .bind(&reagent_id)
                .fetch_one(&app_state.db_pool)
                .await?;

            if name_count.0 > 0 {
                return Err(ApiError::reagent_already_exists(new_name));
            }
        }
    }

    let now = Utc::now();
    let mut updated_fields = vec![];

    if let Some(ref name) = update_data.name {
        sqlx::query("UPDATE reagents SET name = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(name)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("name");
    }

    if let Some(ref formula) = update_data.formula {
        sqlx::query("UPDATE reagents SET formula = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(formula)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("formula");
    }

    if let Some(ref cas_number) = update_data.cas_number {
        sqlx::query("UPDATE reagents SET cas_number = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(cas_number)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("cas_number");
    }

    if let Some(ref manufacturer) = update_data.manufacturer {
        sqlx::query("UPDATE reagents SET manufacturer = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(manufacturer)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("manufacturer");
    }

    if let Some(ref description) = update_data.description {
        sqlx::query("UPDATE reagents SET description = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(description)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("description");
    }

    if let Some(ref status) = update_data.status {
        if !matches!(status.as_str(), "active" | "inactive" | "discontinued") {
            return Err(ApiError::ValidationError("Invalid status value".to_string()));
        }
        sqlx::query("UPDATE reagents SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(&user_id)
            .bind(&reagent_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("status");
    }

    if updated_fields.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".to_string()));
    }

    log::info!("Reagent {} updated by user {}: {:?}", reagent_id, user_id, updated_fields);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Reagent updated successfully".to_string(),
    )))
}

pub async fn delete_reagent(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let batch_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM batches WHERE reagent_id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    if batch_count.0 > 0 {
        return Err(ApiError::BadRequest(
            "Cannot delete reagent with existing batches".to_string()
        ));
    }

    sqlx::query("DELETE FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await?;

    log::info!("Reagent {} deleted", reagent_id);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Reagent deleted successfully".to_string(),
    )))
}

pub async fn get_reagent_with_batches(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    let reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let batches: Vec<Batch> = sqlx::query_as(
        "SELECT * FROM batches WHERE reagent_id = ? ORDER BY received_date DESC"
    )
        .bind(&reagent_id)
        .fetch_all(&app_state.db_pool)
        .await?;

    let response = ReagentWithBatches { reagent, batches };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

// ==================== BATCH HANDLERS ====================

pub async fn create_batch_with_user(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    batch: web::Json<CreateBatchRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();
    batch.validate()?;

    validate_quantity(batch.quantity)?;
    validate_unit(&batch.unit)?;

    let reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let existing_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM batches WHERE reagent_id = ? AND batch_number = ?"
    )
        .bind(&reagent_id)
        .bind(&batch.batch_number)
        .fetch_one(&app_state.db_pool)
        .await?;

    if existing_count.0 > 0 {
        return Err(ApiError::batch_already_exists(&reagent.name, &batch.batch_number));
    }

    if let Some(expiry_date) = batch.expiry_date {
        if expiry_date < Utc::now() {
            return Err(ApiError::batch_expiry_date_invalid());
        }
    }

    let batch_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let received_date = batch.received_date.unwrap_or(now);

    sqlx::query(
        r#"INSERT INTO batches
           (id, reagent_id, batch_number, quantity, original_quantity, unit, expiry_date,
            supplier, manufacturer, received_date, status, location, notes,
            created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)"#
    )
        .bind(&batch_id)
        .bind(&reagent_id)
        .bind(&batch.batch_number)
        .bind(batch.quantity)
        .bind(batch.quantity)
        .bind(&batch.unit)
        .bind(batch.expiry_date)
        .bind(&batch.supplier)
        .bind(&batch.manufacturer)
        .bind(received_date)
        .bind(&batch.location)
        .bind(&batch.notes)
        .bind(&user_id)
        .bind(&user_id)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await?;

    log::info!("Batch created: {} for reagent {} by user {}",
               batch.batch_number, reagent.name, user_id);

    Ok(HttpResponse::Created().json(ApiResponse::success_with_message(
        serde_json::json!({"id": batch_id}),
        "Batch created successfully".to_string(),
    )))
}

pub async fn get_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
) -> ApiResult<HttpResponse> {
    let (reagent_id, batch_id) = path.into_inner();

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let batch: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(batch)))
}

pub async fn update_batch_with_user(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update_data: web::Json<UpdateBatchRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    let (reagent_id, batch_id) = path.into_inner();
    update_data.validate()?;

    if let Some(quantity) = update_data.quantity {
        validate_quantity(quantity)?;
    }
    if let Some(ref unit) = update_data.unit {
        validate_unit(unit)?;
    }

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let existing_batch: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    if existing_batch.status == "depleted" {
        return Err(ApiError::cannot_modify_depleted_batch());
    }

    if let Some(ref new_batch_number) = update_data.batch_number {
        if new_batch_number != &existing_batch.batch_number {
            let batch_count: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM batches WHERE reagent_id = ? AND batch_number = ? AND id != ?"
            )
                .bind(&reagent_id)
                .bind(new_batch_number)
                .bind(&batch_id)
                .fetch_one(&app_state.db_pool)
                .await?;

            if batch_count.0 > 0 {
                return Err(ApiError::BadRequest(
                    format!("Batch number '{}' already exists for this reagent", new_batch_number)
                ));
            }
        }
    }

    if let Some(expiry_date) = update_data.expiry_date {
        if expiry_date < Utc::now() {
            return Err(ApiError::batch_expiry_date_invalid());
        }
    }

    let now = Utc::now();
    let mut updated_fields = vec![];

    if let Some(ref batch_number) = update_data.batch_number {
        sqlx::query("UPDATE batches SET batch_number = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(batch_number)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("batch_number");
    }

    if let Some(quantity) = update_data.quantity {
        sqlx::query("UPDATE batches SET quantity = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(quantity)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("quantity");
    }

    if let Some(ref unit) = update_data.unit {
        sqlx::query("UPDATE batches SET unit = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(unit)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("unit");
    }

    if let Some(expiry_date) = update_data.expiry_date {
        sqlx::query("UPDATE batches SET expiry_date = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(expiry_date)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("expiry_date");
    }

    if let Some(ref supplier) = update_data.supplier {
        sqlx::query("UPDATE batches SET supplier = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(supplier)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("supplier");
    }

    if let Some(ref manufacturer) = update_data.manufacturer {
        sqlx::query("UPDATE batches SET manufacturer = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(manufacturer)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("manufacturer");
    }

    if let Some(ref location) = update_data.location {
        sqlx::query("UPDATE batches SET location = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(location)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("location");
    }

    if let Some(ref notes) = update_data.notes {
        sqlx::query("UPDATE batches SET notes = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(notes)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("notes");
    }

    if let Some(received_date) = update_data.received_date {
        sqlx::query("UPDATE batches SET received_date = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(received_date)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("received_date");
    }

    if let Some(ref status) = update_data.status {
        if !matches!(status.as_str(), "available" | "in_use" | "expired" | "depleted") {
            return Err(ApiError::ValidationError("Invalid status value".to_string()));
        }
        sqlx::query("UPDATE batches SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(&user_id)
            .bind(&batch_id)
            .execute(&app_state.db_pool)
            .await?;
        updated_fields.push("status");
    }

    if updated_fields.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".to_string()));
    }

    log::info!("Batch {} updated by user {}: {:?}", batch_id, user_id, updated_fields);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Batch updated successfully".to_string(),
    )))
}

pub async fn delete_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
) -> ApiResult<HttpResponse> {
    let (reagent_id, batch_id) = path.into_inner();

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let _batch: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    let usage_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage_logs WHERE batch_id = ?")
        .bind(&batch_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    if usage_count.0 > 0 {
        return Err(ApiError::BadRequest(
            "Cannot delete batch with existing usage records".to_string()
        ));
    }

    sqlx::query("DELETE FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await?;

    log::info!("Batch {} deleted", batch_id);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Batch deleted successfully".to_string(),
    )))
}

// ==================== USAGE TRACKING ====================

#[derive(Debug, Deserialize, Validate)]
pub struct UseReagentRequest {
    #[validate(range(min = 0.0, message = "Quantity must be positive"))]
    pub quantity_used: f64,

    #[validate(length(max = 500, message = "Purpose cannot exceed 500 characters"))]
    pub purpose: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct UsageLog {
    pub id: String,
    pub batch_id: String,
    pub user_id: Option<String>,
    pub quantity_used: f64,
    pub purpose: Option<String>,
    pub notes: Option<String>,
    pub used_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub async fn use_reagent(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    request: web::Json<UseReagentRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let (reagent_id, batch_id) = path.into_inner();
    request.validate()?;

    let claims = get_current_user(&http_request)?;
    validate_quantity(request.quantity_used)?;

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let batch: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    if batch.status != "available" {
        return Err(ApiError::BadRequest("Batch is not available for use".to_string()));
    }

    if request.quantity_used > batch.quantity {
        return Err(ApiError::insufficient_quantity(batch.quantity, request.quantity_used));
    }

    let now = Utc::now();
    let usage_id = Uuid::new_v4().to_string();

    let mut tx = app_state.db_pool.begin().await?;

    sqlx::query(
        r#"INSERT INTO usage_logs (id, batch_id, user_id, quantity_used, purpose, notes, used_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#
    )
        .bind(&usage_id)
        .bind(&batch_id)
        .bind(&claims.sub)
        .bind(request.quantity_used)
        .bind(&request.purpose)
        .bind(&request.notes)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

    let new_quantity = batch.quantity - request.quantity_used;
    let new_status = if new_quantity <= 0.0 { "depleted" } else { "available" };

    sqlx::query("UPDATE batches SET quantity = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(new_quantity.max(0.0))
        .bind(new_status)
        .bind(&now)
        .bind(&batch_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    log::info!(
        "User {} used {} {} from batch {} (reagent {})",
        claims.username, request.quantity_used, batch.unit, batch_id, reagent_id
    );

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        serde_json::json!({
            "usage_id": usage_id,
            "remaining_quantity": new_quantity.max(0.0),
            "status": new_status
        }),
        "Reagent usage recorded successfully".to_string(),
    )))
}

pub async fn get_usage_history(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let (reagent_id, batch_id) = path.into_inner();
    let (page, per_page, offset) = query.normalize();

    let _reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::reagent_not_found(&reagent_id))?;

    let _batch: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ? AND reagent_id = ?")
        .bind(&batch_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage_logs WHERE batch_id = ?")
        .bind(&batch_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    let usage_logs: Vec<UsageLog> = sqlx::query_as(
        "SELECT * FROM usage_logs WHERE batch_id = ? ORDER BY used_at DESC LIMIT ? OFFSET ?"
    )
        .bind(&batch_id)
        .bind(per_page)
        .bind(offset)
        .fetch_all(&app_state.db_pool)
        .await?;

    let total_pages = (total.0 + per_page - 1) / per_page;

    let response = PaginatedResponse {
        data: usage_logs,
        total: total.0,
        page,
        per_page,
        total_pages,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

// ==================== SEARCH & REPORTING ====================

pub async fn search_reagents(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<SearchQuery>,
) -> ApiResult<HttpResponse> {
    let search_term = query.q.as_deref().unwrap_or("");
    let limit = query.limit.unwrap_or(20).min(100);

    if search_term.is_empty() {
        return Ok(HttpResponse::Ok().json(ApiResponse::success(Vec::<Reagent>::new())));
    }

    let search_pattern = format!("%{}%", search_term);

    let reagents: Vec<Reagent> = sqlx::query_as(
        r#"SELECT * FROM reagents
           WHERE (name LIKE ? OR formula LIKE ? OR cas_number LIKE ? OR manufacturer LIKE ?)
           AND status = 'active'
           ORDER BY name ASC
           LIMIT ?"#
    )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(limit)
        .fetch_all(&app_state.db_pool)
        .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(reagents)))
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

pub async fn get_low_stock_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let threshold: f64 = query.search.clone().unwrap_or("10".to_string()).parse().unwrap_or(10.0);

    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct LowStockBatch {
        batch_id: String,
        reagent_name: String,
        batch_number: String,
        quantity: f64,
        unit: String,
        expiry_date: Option<DateTime<Utc>>,
        status: String,
    }

    let low_stock_batches: Vec<LowStockBatch> = sqlx::query_as(
        r#"SELECT
               b.id as batch_id,
               r.name as reagent_name,
               b.batch_number,
               b.quantity,
               b.unit,
               b.expiry_date,
               b.status
           FROM batches b
           JOIN reagents r ON b.reagent_id = r.id
           WHERE b.quantity <= ?
             AND b.status = 'available'
           ORDER BY b.quantity ASC"#
    )
        .bind(threshold)
        .fetch_all(&app_state.db_pool)
        .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(low_stock_batches)))
}

#[derive(Debug, Deserialize)]
pub struct LowStockQuery {
    pub threshold: Option<f64>,
}

pub async fn get_expiring_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<ExpiringQuery>,
) -> ApiResult<HttpResponse> {
    let days = query.days.unwrap_or(30);

    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct ExpiringBatch {
        batch_id: String,
        reagent_name: String,
        batch_number: String,
        quantity: f64,
        unit: String,
        expiry_date: DateTime<Utc>,
        days_until_expiry: i64,
    }

    let expiring_batches: Vec<ExpiringBatch> = sqlx::query_as(
        r#"SELECT
               b.id as batch_id,
               r.name as reagent_name,
               b.batch_number,
               b.quantity,
               b.unit,
               b.expiry_date,
               CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_until_expiry
           FROM batches b
           JOIN reagents r ON b.reagent_id = r.id
           WHERE b.expiry_date IS NOT NULL
             AND b.expiry_date <= datetime('now', '+' || ? || ' days')
             AND b.status = 'available'
           ORDER BY b.expiry_date ASC"#
    )
        .bind(days)
        .fetch_all(&app_state.db_pool)
        .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(expiring_batches)))
}
// Добавить в handlers.rs в конец файла:

// Dashboard statistics
pub async fn get_dashboard_stats(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    #[derive(Debug, Serialize)]
    struct DashboardStats {
        total_reagents: i64,
        total_batches: i64,
        low_stock: i64,
        expiring_soon: i64,
    }

    let total_reagents: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM reagents WHERE status = 'active'")
        .fetch_one(&app_state.db_pool)
        .await?;

    let total_batches: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM batches")
        .fetch_one(&app_state.db_pool)
        .await?;

    let low_stock: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM batches WHERE quantity <= 10 AND status = 'available'")
        .fetch_one(&app_state.db_pool)
        .await?;

    let expiring_soon: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM batches WHERE expiry_date IS NOT NULL AND expiry_date <= datetime('now', '+30 days') AND status = 'available'"
    )
        .fetch_one(&app_state.db_pool)
        .await?;

    let stats = DashboardStats {
        total_reagents: total_reagents.0,
        total_batches: total_batches.0,
        low_stock: low_stock.0,
        expiring_soon: expiring_soon.0,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(stats)))
}

// Get all batches (for statistics)
pub async fn get_all_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let (page, per_page, offset) = query.normalize();

    let mut where_clause = "WHERE 1=1".to_string();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(status) = &query.status {
        where_clause.push_str(" AND status = ?");
        bind_values.push(status.clone());
    }

    let count_query = format!("SELECT COUNT(*) FROM batches {}", where_clause);
    let mut count_query_builder = sqlx::query_as::<_, (i64,)>(&count_query);
    for value in &bind_values {
        count_query_builder = count_query_builder.bind(value);
    }
    let total: i64 = count_query_builder.fetch_one(&app_state.db_pool).await?.0;

    let data_query = format!(
        r#"SELECT b.*, r.name as reagent_name
           FROM batches b
           JOIN reagents r ON b.reagent_id = r.id
           {} ORDER BY b.created_at DESC LIMIT ? OFFSET ?"#,
        where_clause
    );
    pub async fn get_low_stock_batches(
        app_state: web::Data<Arc<AppState>>,
        query: web::Query<PaginationQuery>,
    ) -> ApiResult<HttpResponse> {
        let threshold: f64 = query.search.clone().unwrap_or("10".to_string()).parse().unwrap_or(10.0);

        #[derive(Debug, Serialize, sqlx::FromRow)]
        struct LowStockBatch {
            batch_id: String,
            reagent_name: String,
            batch_number: String,
            quantity: f64,
            unit: String,
            expiry_date: Option<DateTime<Utc>>,
            status: String,
        }

        let low_stock_batches: Vec<LowStockBatch> = sqlx::query_as(
            r#"SELECT
               b.id as batch_id,
               r.name as reagent_name,
               b.batch_number,
               b.quantity,
               b.unit,
               b.expiry_date,
               b.status
           FROM batches b
           JOIN reagents r ON b.reagent_id = r.id
           WHERE b.quantity <= ?
             AND b.status = ['available', 'in_use']
           ORDER BY b.quantity ASC"#
        )
            .bind(threshold)
            .fetch_all(&app_state.db_pool)
            .await?;

        Ok(HttpResponse::Ok().json(ApiResponse::success(low_stock_batches)))
    }
    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct BatchWithReagent {
        pub id: String,  // Поле из Batch
        pub reagent_id: String,
        pub batch_number: String,
        pub quantity: f64,
        pub original_quantity: f64,
        pub unit: String,
        pub expiry_date: Option<DateTime<Utc>>,
        pub supplier: Option<String>,
        pub manufacturer: Option<String>,
        pub received_date: DateTime<Utc>,
        pub status: String,
        pub location: Option<String>,
        pub notes: Option<String>,
        pub created_by: Option<String>,
        pub updated_by: Option<String>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
        pub reagent_name: String,  // Поле из Reagents
    }

    let mut data_query_builder = sqlx::query_as::<_, BatchWithReagent>(&data_query);
    for value in &bind_values {
        data_query_builder = data_query_builder.bind(value);
    }
    data_query_builder = data_query_builder.bind(per_page).bind(offset);

    let batches = data_query_builder.fetch_all(&app_state.db_pool).await?;

    let total_pages = (total + per_page - 1) / per_page;

    let response = PaginatedResponse {
        data: batches,
        total,
        page,
        per_page,
        total_pages,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

#[derive(Debug, Deserialize)]
pub struct ExpiringQuery {
    pub days: Option<i64>,
}



