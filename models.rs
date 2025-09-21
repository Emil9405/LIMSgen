use serde::Serialize;
use serde::Deserialize;
use validator::Validate;
use chrono::{DateTime, Utc};
use sqlx::types::chrono;
// Обновленная структура Reagent
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]

pub struct Reagent {
    pub id: String,
    pub name: String,
    pub formula: Option<String>,
    pub cas_number: Option<String>,        // ДОБАВИТЬ
    pub manufacturer: Option<String>,      // ДОБАВИТЬ
    pub description: Option<String>,
    pub status: String,
    pub created_by: Option<String>,        // ДОБАВИТЬ
    pub updated_by: Option<String>,        // ДОБАВИТЬ
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Обновленная структура Batch
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Batch {
    pub id: String,
    pub reagent_id: String,
    pub batch_number: String,
    pub quantity: f64,
    pub original_quantity: f64,            // ДОБАВИТЬ
    pub unit: String,
    pub expiry_date: Option<DateTime<Utc>>,
    pub supplier: Option<String>,
    pub manufacturer: Option<String>,      // ДОБАВИТЬ
    pub received_date: DateTime<Utc>,
    pub status: String,
    pub location: Option<String>,          // ДОБАВИТЬ
    pub notes: Option<String>,             // ДОБАВИТЬ
    pub created_by: Option<String>,        // ДОБАВИТЬ
    pub updated_by: Option<String>,        // ДОБАВИТЬ
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Обновленные request структуры
#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateReagentRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: String,

    #[validate(length(max = 500, message = "Formula cannot exceed 500 characters"))]
    pub formula: Option<String>,

    #[validate(length(max = 50, message = "CAS number cannot exceed 50 characters"))]
    pub cas_number: Option<String>,        // ДОБАВИТЬ

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,      // ДОБАВИТЬ

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateReagentRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: Option<String>,

    #[validate(length(max = 500, message = "Formula cannot exceed 500 characters"))]
    pub formula: Option<String>,

    #[validate(length(max = 50, message = "CAS number cannot exceed 50 characters"))]
    pub cas_number: Option<String>,        // ДОБАВИТЬ

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,      // ДОБАВИТЬ

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    pub status: Option<String>,
}

#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateBatchRequest {
    #[validate(length(min = 1, max = 100, message = "Batch number must be between 1 and 100 characters"))]
    pub batch_number: String,

    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: f64,

    #[validate(length(min = 1, max = 20, message = "Unit must be between 1 and 20 characters"))]
    pub unit: String,

    pub expiry_date: Option<DateTime<Utc>>,

    #[validate(length(max = 255, message = "Supplier name cannot exceed 255 characters"))]
    pub supplier: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,      // ДОБАВИТЬ

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,          // ДОБАВИТЬ

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,             // ДОБАВИТЬ

    pub received_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateBatchRequest {
    #[validate(length(min = 1, max = 100, message = "Batch number must be between 1 and 100 characters"))]
    pub batch_number: Option<String>,

    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: Option<f64>,

    #[validate(length(min = 1, max = 20, message = "Unit must be between 1 and 20 characters"))]
    pub unit: Option<String>,

    pub expiry_date: Option<DateTime<Utc>>,

    #[validate(length(max = 255, message = "Supplier name cannot exceed 255 characters"))]
    pub supplier: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,      // ДОБАВИТЬ

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,          // ДОБАВИТЬ

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,             // ДОБАВИТЬ

    pub received_date: Option<DateTime<Utc>>,

    pub status: Option<String>,
}