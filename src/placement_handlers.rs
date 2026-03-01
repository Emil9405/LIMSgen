// src/placement_handlers.rs
//! Обработчики для размещения батчей по локациям
//! 
//! Endpoints:
//!   GET    /api/batches/{batch_id}/placements        — все placements батча
//!   POST   /api/batches/{batch_id}/placements        — разместить часть батча
//!   PUT    /api/batches/{batch_id}/placements/{id}   — обновить размещение
//!   DELETE /api/batches/{batch_id}/placements/{id}   — убрать размещение
//!   POST   /api/batches/{batch_id}/placements/move   — переместить между локациями
//!   GET    /api/rooms/{room_id}/inventory             — инвентаризация комнаты

use actix_web::{web, HttpResponse, HttpRequest};
use std::sync::Arc;
use crate::AppState;
use crate::models::*;
use crate::error::{ApiError, ApiResult};
use crate::handlers::ApiResponse;
use crate::auth::get_current_user;
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;
use serde::Serialize;
use log::info;

// ==================== HELPERS ====================

/// Проверка: сумма размещений не превышает quantity батча
async fn validate_placement_total(
    pool: &sqlx::SqlitePool,
    batch_id: &str,
    exclude_placement_id: Option<&str>,
    new_quantity: f64,
) -> ApiResult<Batch> {
    let batch: Batch = sqlx::query_as(
        "SELECT * FROM batches WHERE id = ? AND deleted_at IS NULL"
    )
    .bind(batch_id)
    .fetch_one(pool)
    .await
    .map_err(|_| ApiError::batch_not_found(batch_id))?;

    let existing_sum: (f64,) = match exclude_placement_id {
        Some(pid) => {
            sqlx::query_as(
                "SELECT COALESCE(SUM(quantity), 0.0) FROM batch_placements WHERE batch_id = ? AND id != ?"
            )
            .bind(batch_id)
            .bind(pid)
            .fetch_one(pool)
            .await?
        }
        None => {
            sqlx::query_as(
                "SELECT COALESCE(SUM(quantity), 0.0) FROM batch_placements WHERE batch_id = ?"
            )
            .bind(batch_id)
            .fetch_one(pool)
            .await?
        }
    };

    let total_placed = existing_sum.0 + new_quantity;
    if total_placed > batch.quantity + 0.001 {
        // +0.001 для floating point tolerance
        return Err(ApiError::bad_request(&format!(
            "Cannot place {:.2} {unit}. Already placed: {:.2}, batch total: {:.2}, available to place: {:.2}",
            new_quantity, existing_sum.0, batch.quantity,
            (batch.quantity - existing_sum.0).max(0.0),
            unit = batch.unit
        )));
    }

    Ok(batch)
}

/// Проверка существования комнаты
async fn validate_room_exists(pool: &sqlx::SqlitePool, room_id: &str) -> ApiResult<Room> {
    sqlx::query_as::<_, Room>("SELECT * FROM rooms WHERE id = ?")
        .bind(room_id)
        .fetch_one(pool)
        .await
        .map_err(|_| ApiError::not_found("Room"))
}

/// Суммарный ответ по размещениям батча
#[derive(Debug, Serialize)]
pub struct BatchPlacementsResponse {
    pub batch_id: String,
    pub total_quantity: f64,
    pub placed_quantity: f64,
    pub unplaced_quantity: f64,
    pub unit: String,
    pub placements: Vec<PlacementWithRoom>,
}

// ==================== GET PLACEMENTS FOR BATCH ====================

pub async fn get_batch_placements(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let batch_id = path.into_inner();

    let batch: Batch = sqlx::query_as(
        "SELECT * FROM batches WHERE id = ? AND deleted_at IS NULL"
    )
    .bind(&batch_id)
    .fetch_one(&app_state.db_pool)
    .await
    .map_err(|_| ApiError::batch_not_found(&batch_id))?;

    let placements: Vec<PlacementWithRoom> = sqlx::query_as(
        r#"SELECT 
            bp.id, bp.batch_id, bp.room_id,
            r.name as room_name, r.color as room_color,
            bp.shelf, bp.position, bp.quantity,
            bp.notes, bp.placed_by,
            bp.created_at, bp.updated_at
        FROM batch_placements bp
        JOIN rooms r ON bp.room_id = r.id
        WHERE bp.batch_id = ?
        ORDER BY r.name, bp.shelf"#
    )
    .bind(&batch_id)
    .fetch_all(&app_state.db_pool)
    .await?;

    let placed_qty: f64 = placements.iter().map(|p| p.quantity).sum();

    Ok(HttpResponse::Ok().json(ApiResponse::success(BatchPlacementsResponse {
        batch_id: batch.id,
        total_quantity: batch.quantity,
        placed_quantity: placed_qty,
        unplaced_quantity: (batch.quantity - placed_qty).max(0.0),
        unit: batch.unit,
        placements,
    })))
}

// ==================== CREATE PLACEMENT ====================

pub async fn create_placement(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    request: web::Json<CreatePlacementRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    request.validate()?;
    let batch_id = path.into_inner();
    let claims = get_current_user(&http_request)?;
    let now = Utc::now();

    // Валидация
    let batch = validate_placement_total(&app_state.db_pool, &batch_id, None, request.quantity).await?;
    let room = validate_room_exists(&app_state.db_pool, &request.room_id).await?;

    // Проверка дубликата (batch + room + shelf)
    let shelf_val = request.shelf.as_deref().unwrap_or("");
    let existing: Option<BatchPlacement> = sqlx::query_as(
        "SELECT * FROM batch_placements WHERE batch_id = ? AND room_id = ? AND COALESCE(shelf, '') = ?"
    )
    .bind(&batch_id)
    .bind(&request.room_id)
    .bind(shelf_val)
    .fetch_optional(&app_state.db_pool)
    .await?;

    if existing.is_some() {
        return Err(ApiError::bad_request(&format!(
            "Placement already exists for this batch in {} / {}. Use update to change quantity.",
            room.name, request.shelf.as_deref().unwrap_or("(no shelf)")
        )));
    }

    let id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"INSERT INTO batch_placements 
            (id, batch_id, room_id, shelf, position, quantity, notes, placed_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
    )
    .bind(&id)
    .bind(&batch_id)
    .bind(&request.room_id)
    .bind(&request.shelf)
    .bind(&request.position)
    .bind(request.quantity)
    .bind(&request.notes)
    .bind(&claims.sub)
    .bind(&now)
    .bind(&now)
    .execute(&app_state.db_pool)
    .await?;

    let created: PlacementWithRoom = sqlx::query_as(
        r#"SELECT 
            bp.id, bp.batch_id, bp.room_id,
            r.name as room_name, r.color as room_color,
            bp.shelf, bp.position, bp.quantity,
            bp.notes, bp.placed_by,
            bp.created_at, bp.updated_at
        FROM batch_placements bp
        JOIN rooms r ON bp.room_id = r.id
        WHERE bp.id = ?"#
    )
    .bind(&id)
    .fetch_one(&app_state.db_pool)
    .await?;

    info!(
        "📍 Placement created: batch {} → {} / {} ({:.2} {})",
        batch.batch_number, room.name,
        request.shelf.as_deref().unwrap_or("—"),
        request.quantity, batch.unit
    );

    Ok(HttpResponse::Created().json(ApiResponse::success(created)))
}

// ==================== UPDATE PLACEMENT ====================

pub async fn update_placement(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    request: web::Json<UpdatePlacementRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    request.validate()?;
    let (batch_id, placement_id) = path.into_inner();
    let _claims = get_current_user(&http_request)?;
    let now = Utc::now();

    let existing: BatchPlacement = sqlx::query_as(
        "SELECT * FROM batch_placements WHERE id = ? AND batch_id = ?"
    )
    .bind(&placement_id)
    .bind(&batch_id)
    .fetch_one(&app_state.db_pool)
    .await
    .map_err(|_| ApiError::not_found("Placement"))?;

    // Валидация нового количества
    let new_qty = request.quantity.unwrap_or(existing.quantity);
    validate_placement_total(&app_state.db_pool, &batch_id, Some(&placement_id), new_qty).await?;

    // Валидация новой комнаты если меняется
    if let Some(ref new_room_id) = request.room_id {
        validate_room_exists(&app_state.db_pool, new_room_id).await?;
    }

    let room_id = request.room_id.as_deref().unwrap_or(&existing.room_id);
    let shelf = request.shelf.clone().or(existing.shelf.clone());
    let position = request.position.clone().or(existing.position.clone());
    let notes = request.notes.clone().or(existing.notes.clone());

    sqlx::query(
        r#"UPDATE batch_placements 
           SET room_id = ?, shelf = ?, position = ?, quantity = ?, notes = ?, updated_at = ?
           WHERE id = ?"#
    )
    .bind(room_id)
    .bind(&shelf)
    .bind(&position)
    .bind(new_qty)
    .bind(&notes)
    .bind(&now)
    .bind(&placement_id)
    .execute(&app_state.db_pool)
    .await?;

    let updated: PlacementWithRoom = sqlx::query_as(
        r#"SELECT 
            bp.id, bp.batch_id, bp.room_id,
            r.name as room_name, r.color as room_color,
            bp.shelf, bp.position, bp.quantity,
            bp.notes, bp.placed_by,
            bp.created_at, bp.updated_at
        FROM batch_placements bp
        JOIN rooms r ON bp.room_id = r.id
        WHERE bp.id = ?"#
    )
    .bind(&placement_id)
    .fetch_one(&app_state.db_pool)
    .await?;

    info!("📍 Placement updated: {}", placement_id);
    Ok(HttpResponse::Ok().json(ApiResponse::success(updated)))
}

// ==================== DELETE PLACEMENT ====================

pub async fn delete_placement(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<(String, String)>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let (batch_id, placement_id) = path.into_inner();
    let _claims = get_current_user(&http_request)?;

    let result = sqlx::query(
        "DELETE FROM batch_placements WHERE id = ? AND batch_id = ?"
    )
    .bind(&placement_id)
    .bind(&batch_id)
    .execute(&app_state.db_pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Placement"));
    }

    info!("📍 Placement deleted: {}", placement_id);
    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Placement removed".to_string(),
    )))
}

// ==================== MOVE BETWEEN LOCATIONS ====================

pub async fn move_placement(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    request: web::Json<MovePlacementRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    request.validate()?;
    let batch_id = path.into_inner();
    let claims = get_current_user(&http_request)?;
    let now = Utc::now();

    // Валидация комнат
    let from_room = validate_room_exists(&app_state.db_pool, &request.from_room_id).await?;
    let to_room = validate_room_exists(&app_state.db_pool, &request.to_room_id).await?;

    let mut tx = app_state.db_pool.begin().await?;

    // 1. Найти source placement (batch + room + shelf)
    let from_shelf_val = request.from_shelf.as_deref().unwrap_or("");
    let from: BatchPlacement = sqlx::query_as(
        "SELECT * FROM batch_placements WHERE batch_id = ? AND room_id = ? AND COALESCE(shelf, '') = ?"
    )
    .bind(&batch_id)
    .bind(&request.from_room_id)
    .bind(from_shelf_val)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::bad_request(&format!(
        "Source placement not found: {} / {}",
        from_room.name, request.from_shelf.as_deref().unwrap_or("(no shelf)")
    )))?;

    if from.quantity < request.quantity - 0.001 {
        return Err(ApiError::bad_request(&format!(
            "Insufficient quantity in source. Available: {:.2}, requested: {:.2}",
            from.quantity, request.quantity
        )));
    }

    // 2. Уменьшить/удалить source
    let remaining = from.quantity - request.quantity;
    if remaining <= 0.001 {
        sqlx::query("DELETE FROM batch_placements WHERE id = ?")
            .bind(&from.id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE batch_placements SET quantity = ?, updated_at = ? WHERE id = ?")
            .bind(remaining)
            .bind(&now)
            .bind(&from.id)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Увеличить/создать target (UPSERT по batch + room + shelf)
    let to_shelf_val = request.to_shelf.as_deref().unwrap_or("");
    let existing_to: Option<BatchPlacement> = sqlx::query_as(
        "SELECT * FROM batch_placements WHERE batch_id = ? AND room_id = ? AND COALESCE(shelf, '') = ?"
    )
    .bind(&batch_id)
    .bind(&request.to_room_id)
    .bind(to_shelf_val)
    .fetch_optional(&mut *tx)
    .await?;

    match existing_to {
        Some(tp) => {
            sqlx::query(
                "UPDATE batch_placements SET quantity = quantity + ?, updated_at = ? WHERE id = ?"
            )
            .bind(request.quantity)
            .bind(&now)
            .bind(&tp.id)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            sqlx::query(
                r#"INSERT INTO batch_placements 
                    (id, batch_id, room_id, shelf, position, quantity, placed_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#
            )
            .bind(&new_id)
            .bind(&batch_id)
            .bind(&request.to_room_id)
            .bind(&request.to_shelf)
            .bind(&request.to_position)
            .bind(request.quantity)
            .bind(&claims.sub)
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    info!(
        "📍 Moved {:.2} from {} / {} → {} / {}",
        request.quantity,
        from_room.name, request.from_shelf.as_deref().unwrap_or("—"),
        to_room.name, request.to_shelf.as_deref().unwrap_or("—"),
    );

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        format!(
            "Moved {:.2} from {} to {}",
            request.quantity, from_room.name, to_room.name
        ),
    )))
}

// ==================== ROOM INVENTORY ====================

pub async fn get_room_inventory(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let room_id = path.into_inner();

    // Проверка существования
    validate_room_exists(&app_state.db_pool, &room_id).await?;

    let inventory: Vec<RoomInventoryItem> = sqlx::query_as(
        r#"SELECT
            bp.id as placement_id,
            bp.quantity as placed_quantity,
            bp.shelf,
            bp.position,
            b.id as batch_id,
            b.batch_number,
            b.lot_number,
            b.unit,
            b.quantity as total_quantity,
            b.expiry_date,
            b.status as batch_status,
            rg.id as reagent_id,
            rg.name as reagent_name,
            rg.formula,
            rg.cas_number,
            rg.hazard_pictograms
        FROM batch_placements bp
        JOIN batches b ON bp.batch_id = b.id
        JOIN reagents rg ON b.reagent_id = rg.id
        WHERE bp.room_id = ? AND b.deleted_at IS NULL
        ORDER BY rg.name, b.batch_number"#
    )
    .bind(&room_id)
    .fetch_all(&app_state.db_pool)
    .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(inventory)))
}

// ==================== GET PLACEMENTS FOR ROOM (all batches) ====================

pub async fn get_room_placements(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let room_id = path.into_inner();
    validate_room_exists(&app_state.db_pool, &room_id).await?;

    let placements: Vec<PlacementWithRoom> = sqlx::query_as(
        r#"SELECT 
            bp.id, bp.batch_id, bp.room_id,
            r.name as room_name, r.color as room_color,
            bp.shelf, bp.position, bp.quantity,
            bp.notes, bp.placed_by,
            bp.created_at, bp.updated_at
        FROM batch_placements bp
        JOIN rooms r ON bp.room_id = r.id
        WHERE bp.room_id = ?
        ORDER BY bp.shelf, bp.created_at"#
    )
    .bind(&room_id)
    .fetch_all(&app_state.db_pool)
    .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(placements)))
}
