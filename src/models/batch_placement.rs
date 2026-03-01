// src/models/batch_placement.rs
//! Модель размещения батчей по локациям (rooms + shelves)
//! Один batch может быть распределён по нескольким room/shelf комбинациям
//! UNIQUE(batch_id, room_id, shelf)

use serde::{Deserialize, Serialize};
use validator::Validate;
use chrono::{DateTime, Utc};

// ==================== BATCH PLACEMENT ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct BatchPlacement {
    pub id: String,
    pub batch_id: String,
    pub room_id: String,
    pub shelf: Option<String>,
    pub position: Option<String>,
    pub quantity: f64,
    pub notes: Option<String>,
    pub placed_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Placement с данными комнаты (для отображения)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct PlacementWithRoom {
    pub id: String,
    pub batch_id: String,
    pub room_id: String,
    pub room_name: String,
    pub room_color: Option<String>,
    pub shelf: Option<String>,
    pub position: Option<String>,
    pub quantity: f64,
    pub notes: Option<String>,
    pub placed_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Элемент инвентаризации комнаты
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RoomInventoryItem {
    // Placement
    pub placement_id: String,
    pub placed_quantity: f64,
    pub shelf: Option<String>,
    pub position: Option<String>,
    // Batch
    pub batch_id: String,
    pub batch_number: String,
    pub lot_number: Option<String>,
    pub unit: String,
    pub total_quantity: f64,
    pub expiry_date: Option<DateTime<Utc>>,
    pub batch_status: String,
    // Reagent
    pub reagent_id: String,
    pub reagent_name: String,
    pub formula: Option<String>,
    pub cas_number: Option<String>,
    pub hazard_pictograms: Option<String>,
}

// ==================== REQUESTS ====================

#[derive(Debug, Deserialize, Validate)]
pub struct CreatePlacementRequest {
    pub room_id: String,

    #[validate(length(max = 100, message = "Shelf name cannot exceed 100 characters"))]
    pub shelf: Option<String>,

    #[validate(length(max = 100, message = "Position cannot exceed 100 characters"))]
    pub position: Option<String>,

    #[validate(range(min = 0.001, message = "Quantity must be positive"))]
    pub quantity: f64,

    #[validate(length(max = 500, message = "Notes cannot exceed 500 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdatePlacementRequest {
    pub room_id: Option<String>,

    #[validate(length(max = 100, message = "Shelf name cannot exceed 100 characters"))]
    pub shelf: Option<String>,

    #[validate(length(max = 100, message = "Position cannot exceed 100 characters"))]
    pub position: Option<String>,

    #[validate(range(min = 0.001, message = "Quantity must be positive"))]
    pub quantity: Option<f64>,

    #[validate(length(max = 500, message = "Notes cannot exceed 500 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct MovePlacementRequest {
    pub from_room_id: String,

    #[validate(length(max = 100))]
    pub from_shelf: Option<String>,

    pub to_room_id: String,

    #[validate(range(min = 0.001, message = "Quantity must be positive"))]
    pub quantity: f64,

    #[validate(length(max = 100, message = "Shelf name cannot exceed 100 characters"))]
    pub to_shelf: Option<String>,

    #[validate(length(max = 100, message = "Position cannot exceed 100 characters"))]
    pub to_position: Option<String>,
}
