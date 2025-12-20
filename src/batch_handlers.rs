// src/batch_handlers.rs
//! Обработчики для партий реагентов
//! ОБНОВЛЕНО: добавлена конвертация единиц и статус срока годности

use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::AppState;
use crate::models::*;
use crate::error::{ApiError, ApiResult, validate_quantity, validate_unit};
use crate::handlers::{ApiResponse, PaginatedResponse};
use crate::validator::{CustomValidate, UnitConverter};
use chrono::{Utc, DateTime};
use uuid::Uuid;
use validator::Validate;
use serde::Serialize;

// ==================== RESPONSE STRUCTURES ====================

/// Партия с расширенной информацией (статус срока годности, конвертация)
#[derive(Debug, Serialize)]
pub struct BatchResponse {
    pub id: String,
    pub reagent_id: String,
    pub batch_number: String,
    pub cat_number: Option<String>,
    pub quantity: f64,
    pub original_quantity: f64,
    pub reserved_quantity: f64,
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
    pub expiration_status: String,
    pub days_until_expiration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub converted_quantity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub converted_unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_unit: Option<String>,
}

/// Партия с именем реагента
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BatchWithReagent {
    pub id: String,
    pub reagent_id: String,
    pub batch_number: String,
    pub cat_number: Option<String>,
    pub quantity: f64,
    pub original_quantity: f64,
    pub reserved_quantity: f64,
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
    pub reagent_name: String,
}

/// Расширенный ответ партии с реагентом
#[derive(Debug, Serialize)]
pub struct BatchWithReagentResponse {
    pub id: String,
    pub reagent_id: String,
    pub reagent_name: String,
    pub batch_number: String,
    pub cat_number: Option<String>,
    pub quantity: f64,
    pub original_quantity: f64,
    pub reserved_quantity: f64,
    pub unit: String,
    pub expiry_date: Option<DateTime<Utc>>,
    pub supplier: Option<String>,
    pub manufacturer: Option<String>,
    pub received_date: DateTime<Utc>,
    pub status: String,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expiration_status: String,
    pub days_until_expiration: Option<i64>,
}

// ==================== EXPIRATION STATUS ====================

const EXPIRY_CRITICAL_DAYS: i64 = 7;
const EXPIRY_WARNING_DAYS: i64 = 30;

fn calculate_expiration_status(expiry_date: Option<DateTime<Utc>>) -> (String, Option<i64>) {
    match expiry_date {
        None => ("unknown".to_string(), None),
        Some(date) => {
            let now = Utc::now();
            let days = (date - now).num_days();
            let status = if days < 0 {
                "expired"
            } else if days <= EXPIRY_CRITICAL_DAYS {
                "expiring_critical"
            } else if days <= EXPIRY_WARNING_DAYS {
                "expiring_soon"
            } else {
                "ok"
            };
            (status.to_string(), Some(days))
        }
    }
}

// ==================== UNIT CONVERSION ====================

fn convert_quantity(quantity: f64, from_unit: &str, to_unit: &str) -> Result<f64, String> {
    if from_unit == to_unit {
        return Ok(quantity);
    }
    let converter = UnitConverter::new();
    converter.convert(quantity, from_unit, to_unit)
}

// ==================== BATCH QUERY ====================

#[derive(Debug, serde::Deserialize)]
pub struct BatchQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub search: Option<String>,
    pub status: Option<String>,
    pub unit: Option<String>,
}

impl BatchQuery {
    pub fn normalize(&self) -> (i64, i64, i64) {
        let page = self.page.unwrap_or(1).max(1);
        let per_page = self.per_page.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * per_page;
        (page, per_page, offset)
    }
}

// ==================== BATCH CRUD ====================

/// Получить все партии с пагинацией
pub async fn get_all_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<BatchQuery>,
) -> ApiResult<HttpResponse> {
    let (page, per_page, offset) = query.normalize();

    let mut conditions: Vec<String> = vec!["1=1".to_string()];
    let mut params: Vec<String> = Vec::new();

    if let Some(ref search) = query.search {
        if !search.trim().is_empty() {
            let pattern = format!("%{}%", search.trim());
            conditions.push("(b.batch_number LIKE ? OR r.name LIKE ? OR b.cat_number LIKE ? OR b.supplier LIKE ?)".to_string());
            params.push(pattern.clone());
            params.push(pattern.clone());
            params.push(pattern.clone());
            params.push(pattern);
        }
    }

    if let Some(ref status) = query.status {
        conditions.push("b.status = ?".to_string());
        params.push(status.clone());
    }

    let where_clause = conditions.join(" AND ");

    // Count
    let count_sql = format!(
        "SELECT COUNT(*) FROM batches b JOIN reagents r ON b.reagent_id = r.id WHERE {}",
        where_clause
    );
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for p in &params {
        count_query = count_query.bind(p);
    }
    let total: i64 = count_query.fetch_one(&app_state.db_pool).await?;

    // Select
    let sql = format!(
        "SELECT b.*, r.name as reagent_name FROM batches b JOIN reagents r ON b.reagent_id = r.id WHERE {} ORDER BY b.created_at DESC LIMIT ? OFFSET ?",
        where_clause
    );
    let mut select_query = sqlx::query_as::<_, BatchWithReagent>(&sql);
    for p in &params {
        select_query = select_query.bind(p);
    }
    select_query = select_query.bind(per_page).bind(offset);
    let batches: Vec<BatchWithReagent> = select_query.fetch_all(&app_state.db_pool).await?;

    // Transform to response with expiration status
    let response_batches: Vec<BatchWithReagentResponse> = batches
        .into_iter()
        .map(|b| {
            let (expiration_status, days_until_expiration) = calculate_expiration_status(b.expiry_date);
            BatchWithReagentResponse {
                id: b.id,
                reagent_id: b.reagent_id,
                reagent_name: b.reagent_name,
                batch_number: b.batch_number,
                cat_number: b.cat_number,
                quantity: b.quantity,
                original_quantity: b.original_quantity,
                reserved_quantity: b.reserved_quantity,
                unit: b.unit,
                expiry_date: b.expiry_date,
                supplier: b.supplier,
                manufacturer: b.manufacturer,
                received_date: b.received_date,
                status: b.status,
                location: b.location,
                notes: b.notes,
                created_at: b.created_at,
                updated_at: b.updated_at,
                expiration_status,
                days_until_expiration,
            }
        })
        .collect();

    let total_pages = (total + per_page - 1) / per_page;

    Ok(HttpResponse::Ok().json(ApiResponse::success(PaginatedResponse {
        data: response_batches,
        total,
        page,
        per_page,
        total_pages,
    })))
}

/// Получить партию по ID
pub async fn get_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    query: web::Query<BatchQuery>,
) -> ApiResult<HttpResponse> {
    let (_, batch_id) = path.into_inner();

    let batch: Option<Batch> = sqlx::query_as("SELECT * FROM batches WHERE id = ?")
        .bind(&batch_id)
        .fetch_optional(&app_state.db_pool)
        .await?;

    let batch = match batch {
        Some(b) => b,
        None => return Err(ApiError::not_found("Batch")),
    };

    let (expiration_status, days_until_expiration) = calculate_expiration_status(batch.expiry_date);

    // Unit conversion if requested
    let (converted_quantity, converted_unit, original_unit) = 
        if let Some(ref target_unit) = query.unit {
            match convert_quantity(batch.quantity, &batch.unit, target_unit) {
                Ok(converted) => (Some(converted), Some(target_unit.clone()), Some(batch.unit.clone())),
                Err(e) => {
                    log::warn!("Unit conversion failed: {}", e);
                    (None, None, None)
                }
            }
        } else {
            (None, None, None)
        };

    let response = BatchResponse {
        id: batch.id,
        reagent_id: batch.reagent_id,
        batch_number: batch.batch_number,
        cat_number: batch.cat_number,
        quantity: converted_quantity.unwrap_or(batch.quantity),
        original_quantity: batch.original_quantity,
        reserved_quantity: batch.reserved_quantity,
        unit: converted_unit.clone().unwrap_or(batch.unit.clone()),
        expiry_date: batch.expiry_date,
        supplier: batch.supplier,
        manufacturer: batch.manufacturer,
        received_date: batch.received_date,
        status: batch.status,
        location: batch.location,
        notes: batch.notes,
        created_by: batch.created_by,
        updated_by: batch.updated_by,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
        expiration_status,
        days_until_expiration,
        converted_quantity,
        converted_unit,
        original_unit,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

/// Создать партию
pub async fn create_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    batch: web::Json<CreateBatchRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    batch.validate()?;

    let validation_result = batch.custom_validate();
    if !validation_result.is_valid() {
        return Err(validation_result.to_api_error());
    }

    validate_unit(&batch.unit)?;
    validate_quantity(batch.quantity)?;

    let reagent_id = path.into_inner();

    let reagent: Option<Reagent> = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_optional(&app_state.db_pool)
        .await?;

    if reagent.is_none() {
        return Err(ApiError::not_found("Reagent"));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let received_date = batch.received_date.unwrap_or(now);

    sqlx::query(r#"
        INSERT INTO batches
        (id, reagent_id, batch_number, cat_number, quantity, original_quantity, reserved_quantity, unit,
         expiry_date, supplier, manufacturer, received_date, status, location, notes,
         created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)
    "#)
        .bind(&id)
        .bind(&reagent_id)
        .bind(&batch.batch_number)
        .bind(&batch.cat_number)
        .bind(batch.quantity)
        .bind(batch.quantity)
        .bind(&batch.unit)
        .bind(&batch.expiry_date)
        .bind(&batch.supplier)
        .bind(&batch.manufacturer)
        .bind(&received_date)
        .bind(&batch.location)
        .bind(&batch.notes)
        .bind(&user_id)
        .bind(&user_id)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await?;

    let created: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ?")
        .bind(&id)
        .fetch_one(&app_state.db_pool)
        .await?;

    let (expiration_status, days_until_expiration) = calculate_expiration_status(created.expiry_date);
    
    let response = BatchResponse {
        id: created.id,
        reagent_id: created.reagent_id,
        batch_number: created.batch_number,
        cat_number: created.cat_number,
        quantity: created.quantity,
        original_quantity: created.original_quantity,
        reserved_quantity: created.reserved_quantity,
        unit: created.unit,
        expiry_date: created.expiry_date,
        supplier: created.supplier,
        manufacturer: created.manufacturer,
        received_date: created.received_date,
        status: created.status,
        location: created.location,
        notes: created.notes,
        created_by: created.created_by,
        updated_by: created.updated_by,
        created_at: created.created_at,
        updated_at: created.updated_at,
        expiration_status,
        days_until_expiration,
        converted_quantity: None,
        converted_unit: None,
        original_unit: None,
    };

    Ok(HttpResponse::Created().json(ApiResponse::success(response)))
}

/// Обновить партию
pub async fn update_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    update: web::Json<UpdateBatchRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    update.validate()?;
    let (_, batch_id) = path.into_inner();

    let existing: Option<Batch> = sqlx::query_as("SELECT * FROM batches WHERE id = ?")
        .bind(&batch_id)
        .fetch_optional(&app_state.db_pool)
        .await?;

    if existing.is_none() {
        return Err(ApiError::not_found("Batch"));
    }
    let existing = existing.unwrap();

    if existing.status == "depleted" {
        return Err(ApiError::cannot_modify_depleted_batch());
    }

    let now = Utc::now();

    sqlx::query(r#"
        UPDATE batches SET
            batch_number = COALESCE(?, batch_number),
            cat_number = COALESCE(?, cat_number),
            quantity = COALESCE(?, quantity),
            unit = COALESCE(?, unit),
            expiry_date = COALESCE(?, expiry_date),
            supplier = COALESCE(?, supplier),
            manufacturer = COALESCE(?, manufacturer),
            status = COALESCE(?, status),
            location = COALESCE(?, location),
            notes = COALESCE(?, notes),
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
    "#)
        .bind(&update.batch_number)
        .bind(&update.cat_number)
        .bind(update.quantity)
        .bind(&update.unit)
        .bind(&update.expiry_date)
        .bind(&update.supplier)
        .bind(&update.manufacturer)
        .bind(&update.status)
        .bind(&update.location)
        .bind(&update.notes)
        .bind(&user_id)
        .bind(&now)
        .bind(&batch_id)
        .execute(&app_state.db_pool)
        .await?;

    let updated: Batch = sqlx::query_as("SELECT * FROM batches WHERE id = ?")
        .bind(&batch_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    let (expiration_status, days_until_expiration) = calculate_expiration_status(updated.expiry_date);
    
    let response = BatchResponse {
        id: updated.id,
        reagent_id: updated.reagent_id,
        batch_number: updated.batch_number,
        cat_number: updated.cat_number,
        quantity: updated.quantity,
        original_quantity: updated.original_quantity,
        reserved_quantity: updated.reserved_quantity,
        unit: updated.unit,
        expiry_date: updated.expiry_date,
        supplier: updated.supplier,
        manufacturer: updated.manufacturer,
        received_date: updated.received_date,
        status: updated.status,
        location: updated.location,
        notes: updated.notes,
        created_by: updated.created_by,
        updated_by: updated.updated_by,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        expiration_status,
        days_until_expiration,
        converted_quantity: None,
        converted_unit: None,
        original_unit: None,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

/// Удалить партию
pub async fn delete_batch(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    _user_id: String,
) -> ApiResult<HttpResponse> {
    let (_, batch_id) = path.into_inner();

    let result = sqlx::query("DELETE FROM batches WHERE id = ?")
        .bind(&batch_id)
        .execute(&app_state.db_pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Batch"));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Batch deleted successfully"
    }))))
}

// ==================== SPECIALIZED QUERIES ====================

#[derive(Debug, serde::Deserialize)]
pub struct ExpiringBatchesQuery {
    pub days: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LowStockQuery {
    pub threshold: Option<f64>,
}

/// Получить истекающие партии
pub async fn get_expiring_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<ExpiringBatchesQuery>,
) -> ApiResult<HttpResponse> {
    let days = query.days.unwrap_or(30);
    let expiry_threshold = Utc::now() + chrono::Duration::days(days);

    let batches: Vec<BatchWithReagent> = sqlx::query_as(r#"
        SELECT b.*, r.name as reagent_name
        FROM batches b
        JOIN reagents r ON b.reagent_id = r.id
        WHERE b.expiry_date IS NOT NULL
          AND b.expiry_date <= ?
          AND b.status = 'available'
        ORDER BY b.expiry_date ASC
    "#)
        .bind(&expiry_threshold)
        .fetch_all(&app_state.db_pool)
        .await?;

    let response: Vec<BatchWithReagentResponse> = batches
        .into_iter()
        .map(|b| {
            let (expiration_status, days_until_expiration) = calculate_expiration_status(b.expiry_date);
            BatchWithReagentResponse {
                id: b.id,
                reagent_id: b.reagent_id,
                reagent_name: b.reagent_name,
                batch_number: b.batch_number,
                cat_number: b.cat_number,
                quantity: b.quantity,
                original_quantity: b.original_quantity,
                reserved_quantity: b.reserved_quantity,
                unit: b.unit,
                expiry_date: b.expiry_date,
                supplier: b.supplier,
                manufacturer: b.manufacturer,
                received_date: b.received_date,
                status: b.status,
                location: b.location,
                notes: b.notes,
                created_at: b.created_at,
                updated_at: b.updated_at,
                expiration_status,
                days_until_expiration,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

/// Получить партии с низким остатком
pub async fn get_low_stock_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<LowStockQuery>,
) -> ApiResult<HttpResponse> {
    let threshold_percentage = query.threshold.unwrap_or(20.0);

    let batches: Vec<BatchWithReagent> = sqlx::query_as(r#"
        SELECT b.*, r.name as reagent_name
        FROM batches b
        JOIN reagents r ON b.reagent_id = r.id
        WHERE b.status = 'available'
          AND (b.quantity / b.original_quantity * 100) <= ?
        ORDER BY (b.quantity / b.original_quantity) ASC
    "#)
        .bind(threshold_percentage)
        .fetch_all(&app_state.db_pool)
        .await?;

    let response: Vec<BatchWithReagentResponse> = batches
        .into_iter()
        .map(|b| {
            let (expiration_status, days_until_expiration) = calculate_expiration_status(b.expiry_date);
            BatchWithReagentResponse {
                id: b.id,
                reagent_id: b.reagent_id,
                reagent_name: b.reagent_name,
                batch_number: b.batch_number,
                cat_number: b.cat_number,
                quantity: b.quantity,
                original_quantity: b.original_quantity,
                reserved_quantity: b.reserved_quantity,
                unit: b.unit,
                expiry_date: b.expiry_date,
                supplier: b.supplier,
                manufacturer: b.manufacturer,
                received_date: b.received_date,
                status: b.status,
                location: b.location,
                notes: b.notes,
                created_at: b.created_at,
                updated_at: b.updated_at,
                expiration_status,
                days_until_expiration,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

// ==================== UNIT CONVERSION ENDPOINT ====================

#[derive(Debug, serde::Deserialize)]
pub struct ConvertUnitRequest {
    pub quantity: f64,
    pub from_unit: String,
    pub to_unit: String,
}

#[derive(Debug, Serialize)]
pub struct ConvertUnitResponse {
    pub original_quantity: f64,
    pub original_unit: String,
    pub converted_quantity: f64,
    pub converted_unit: String,
}

pub async fn convert_units(
    request: web::Json<ConvertUnitRequest>,
) -> ApiResult<HttpResponse> {
    let converter = UnitConverter::new();
    
    let converted = converter
        .convert(request.quantity, &request.from_unit, &request.to_unit)
        .map_err(|e| ApiError::bad_request(&e))?;

    let response = ConvertUnitResponse {
        original_quantity: request.quantity,
        original_unit: request.from_unit.clone(),
        converted_quantity: converted,
        converted_unit: request.to_unit.clone(),
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

// ==================== BATCHES FOR REAGENT ====================

pub async fn get_batches_for_reagent(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    query: web::Query<BatchQuery>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();
    let (page, per_page, offset) = query.normalize();

    // Check reagent exists
    let _: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await
        .map_err(|_| ApiError::not_found("Reagent"))?;

    let mut conditions: Vec<String> = vec!["b.reagent_id = ?".to_string()];
    let mut params: Vec<String> = vec![reagent_id.clone()];

    if let Some(ref status) = query.status {
        conditions.push("b.status = ?".to_string());
        params.push(status.clone());
    }

    let where_clause = conditions.join(" AND ");

    // Count
    let count_sql = format!("SELECT COUNT(*) FROM batches b WHERE {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for p in &params {
        count_query = count_query.bind(p);
    }
    let total: i64 = count_query.fetch_one(&app_state.db_pool).await?;

    // Select
    let sql = format!(
        "SELECT * FROM batches b WHERE {} ORDER BY b.received_date DESC LIMIT ? OFFSET ?",
        where_clause
    );
    let mut select_query = sqlx::query_as::<_, Batch>(&sql);
    for p in &params {
        select_query = select_query.bind(p);
    }
    select_query = select_query.bind(per_page).bind(offset);
    let batches: Vec<Batch> = select_query.fetch_all(&app_state.db_pool).await?;

    // Transform
    let response_batches: Vec<BatchResponse> = batches
        .into_iter()
        .map(|b| {
            let (expiration_status, days_until_expiration) = calculate_expiration_status(b.expiry_date);
            BatchResponse {
                id: b.id,
                reagent_id: b.reagent_id,
                batch_number: b.batch_number,
                cat_number: b.cat_number,
                quantity: b.quantity,
                original_quantity: b.original_quantity,
                reserved_quantity: b.reserved_quantity,
                unit: b.unit,
                expiry_date: b.expiry_date,
                supplier: b.supplier,
                manufacturer: b.manufacturer,
                received_date: b.received_date,
                status: b.status,
                location: b.location,
                notes: b.notes,
                created_by: b.created_by,
                updated_by: b.updated_by,
                created_at: b.created_at,
                updated_at: b.updated_at,
                expiration_status,
                days_until_expiration,
                converted_quantity: None,
                converted_unit: None,
                original_unit: None,
            }
        })
        .collect();

    let total_pages = (total + per_page - 1) / per_page;

    Ok(HttpResponse::Ok().json(ApiResponse::success(PaginatedResponse {
        data: response_batches,
        total,
        page,
        per_page,
        total_pages,
    })))
}
