// src/room_handlers.rs
//! Обработчики для управления комнатами/помещениями

use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::AppState;
use crate::models::{Room, CreateRoomRequest, UpdateRoomRequest, RoomStatus};
use crate::error::{ApiError, ApiResult};
use crate::handlers::ApiResponse;
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;
use log::info;

// ==================== GET ALL ROOMS ====================

pub async fn get_all_rooms(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    let rooms: Vec<Room> = sqlx::query_as(
        "SELECT * FROM rooms ORDER BY name ASC"
    )
    .fetch_all(&app_state.db_pool)
    .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(rooms)))
}

// ==================== GET ROOM BY ID ====================

pub async fn get_room(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let room_id = path.into_inner();
    
    let room: Option<Room> = sqlx::query_as(
        "SELECT * FROM rooms WHERE id = ?"
    )
    .bind(&room_id)
    .fetch_optional(&app_state.db_pool)
    .await?;

    match room {
        Some(r) => Ok(HttpResponse::Ok().json(ApiResponse::success(r))),
        None => Err(ApiError::not_found("Room")),
    }
}

// ==================== CREATE ROOM ====================

pub async fn create_room(
    app_state: web::Data<Arc<AppState>>,
    room: web::Json<CreateRoomRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    room.validate()?;

    // Проверяем уникальность имени
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM rooms WHERE LOWER(name) = LOWER(?)"
    )
    .bind(&room.name)
    .fetch_optional(&app_state.db_pool)
    .await?;

    if existing.is_some() {
        return Err(ApiError::bad_request("Room with this name already exists"));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let color = room.color.clone().unwrap_or_else(|| "#667eea".to_string());

    sqlx::query(
        r#"
        INSERT INTO rooms (id, name, description, capacity, color, status, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)
        "#
    )
    .bind(&id)
    .bind(&room.name)
    .bind(&room.description)
    .bind(&room.capacity)
    .bind(&color)
    .bind(&user_id)
    .bind(&user_id)
    .bind(&now)
    .bind(&now)
    .execute(&app_state.db_pool)
    .await?;

    let created: Room = sqlx::query_as("SELECT * FROM rooms WHERE id = ?")
        .bind(&id)
        .fetch_one(&app_state.db_pool)
        .await?;

    info!("🚪 Created room: {} ({})", room.name, id);
    Ok(HttpResponse::Created().json(ApiResponse::success(created)))
}

// ==================== UPDATE ROOM ====================

pub async fn update_room(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    update: web::Json<UpdateRoomRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    update.validate()?;
    let room_id = path.into_inner();

    // Проверяем существование
    let existing: Option<Room> = sqlx::query_as(
        "SELECT * FROM rooms WHERE id = ?"
    )
    .bind(&room_id)
    .fetch_optional(&app_state.db_pool)
    .await?;

    let existing = existing.ok_or_else(|| ApiError::not_found("Room"))?;

    // Проверяем уникальность имени если оно меняется
    if let Some(ref new_name) = update.name {
        if new_name.to_lowercase() != existing.name.to_lowercase() {
            let duplicate: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM rooms WHERE LOWER(name) = LOWER(?) AND id != ?"
            )
            .bind(new_name)
            .bind(&room_id)
            .fetch_optional(&app_state.db_pool)
            .await?;

            if duplicate.is_some() {
                return Err(ApiError::bad_request("Room with this name already exists"));
            }
        }
    }

    // Валидация статуса
    if let Some(ref status) = update.status {
        if !RoomStatus::is_valid(status) {
            return Err(ApiError::bad_request(
                "Invalid status. Must be: available, occupied, maintenance, or unavailable"
            ));
        }
    }

    let now = Utc::now();
    let name = update.name.as_ref().unwrap_or(&existing.name);
    let description = update.description.clone().or(existing.description);
    let capacity = update.capacity.or(existing.capacity);
    let color = update.color.clone().or(existing.color);
    let status = update.status.as_ref().unwrap_or(&existing.status);

    sqlx::query(
        r#"
        UPDATE rooms 
        SET name = ?, description = ?, capacity = ?, color = ?, status = ?, 
            updated_by = ?, updated_at = ?
        WHERE id = ?
        "#
    )
    .bind(name)
    .bind(&description)
    .bind(&capacity)
    .bind(&color)
    .bind(status)
    .bind(&user_id)
    .bind(&now)
    .bind(&room_id)
    .execute(&app_state.db_pool)
    .await?;

    let updated: Room = sqlx::query_as("SELECT * FROM rooms WHERE id = ?")
        .bind(&room_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    info!("🚪 Updated room: {} ({})", updated.name, room_id);
    Ok(HttpResponse::Ok().json(ApiResponse::success(updated)))
}

// ==================== DELETE ROOM ====================

pub async fn delete_room(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let room_id = path.into_inner();

    // Проверяем, есть ли эксперименты в этой комнате
    let experiments_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM experiments WHERE room_id = ? OR location = (SELECT name FROM rooms WHERE id = ?)"
    )
    .bind(&room_id)
    .bind(&room_id)
    .fetch_one(&app_state.db_pool)
    .await?;

    if experiments_count.0 > 0 {
        return Err(ApiError::bad_request(
            &format!("Cannot delete room: {} experiments are assigned to it", experiments_count.0)
        ));
    }

    let result = sqlx::query("DELETE FROM rooms WHERE id = ?")
        .bind(&room_id)
        .execute(&app_state.db_pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Room"));
    }

    info!("🚪 Deleted room: {}", room_id);
    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Room deleted successfully".to_string()
    )))
}

// ==================== GET AVAILABLE ROOMS ====================

pub async fn get_available_rooms(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    let rooms: Vec<Room> = sqlx::query_as(
        "SELECT * FROM rooms WHERE status = 'available' ORDER BY name ASC"
    )
    .fetch_all(&app_state.db_pool)
    .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(rooms)))
}

// ==================== ROUTES CONFIGURATION ====================
// Добавь в main.rs или в configure_routes:
/*
    .service(
        web::scope("/api/rooms")
            .route("", web::get().to(room_handlers::get_all_rooms))
            .route("", web::post().to(room_handlers::create_room))
            .route("/available", web::get().to(room_handlers::get_available_rooms))
            .route("/{id}", web::get().to(room_handlers::get_room))
            .route("/{id}", web::put().to(room_handlers::update_room))
            .route("/{id}", web::delete().to(room_handlers::delete_room))
    )
*/
