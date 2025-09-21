use actix_web::{HttpResponse, ResponseError};
use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    InternalServerError(String),
    ValidationError(String),
    DatabaseError(sqlx::Error),
    AuthError(String),
}

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ApiError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            ApiError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            ApiError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            ApiError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            ApiError::InternalServerError(msg) => write!(f, "Internal Server Error: {}", msg),
            ApiError::ValidationError(msg) => write!(f, "Validation Error: {}", msg),
            ApiError::DatabaseError(err) => write!(f, "Database Error: {}", err),
            ApiError::AuthError(msg) => write!(f, "Auth Error: {}", msg),
        }
    }
}

impl ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        let error_response = ErrorResponse {
            success: false,
            message: self.to_string(),
        };

        match self {
            ApiError::BadRequest(_) => HttpResponse::BadRequest().json(error_response),
            ApiError::NotFound(_) => HttpResponse::NotFound().json(error_response),
            ApiError::Unauthorized(_) => HttpResponse::Unauthorized().json(error_response),
            ApiError::Forbidden(_) => HttpResponse::Forbidden().json(error_response),
            ApiError::ValidationError(_) => HttpResponse::UnprocessableEntity().json(error_response),
            ApiError::DatabaseError(_) => HttpResponse::InternalServerError().json(error_response),
            ApiError::AuthError(_) => HttpResponse::Unauthorized().json(error_response),
            ApiError::InternalServerError(_) => HttpResponse::InternalServerError().json(error_response),
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        ApiError::DatabaseError(err)
    }
}

impl From<validator::ValidationErrors> for ApiError {
    fn from(err: validator::ValidationErrors) -> Self {
        ApiError::ValidationError(err.to_string())
    }
}

// Специфичные ошибки для LIMS
impl ApiError {
    pub fn reagent_not_found(id: &str) -> Self {
        ApiError::NotFound(format!("Reagent with ID '{}' not found", id))
    }

    pub fn batch_not_found(id: &str) -> Self {
        ApiError::NotFound(format!("Batch with ID '{}' not found", id))
    }

    pub fn reagent_already_exists(name: &str) -> Self {
        ApiError::BadRequest(format!("Reagent '{}' already exists", name))
    }

    pub fn batch_already_exists(reagent_name: &str, batch_number: &str) -> Self {
        ApiError::BadRequest(format!("Batch '{}' already exists for reagent '{}'", batch_number, reagent_name))
    }

    pub fn invalid_reagent_id() -> Self {
        ApiError::BadRequest("Invalid reagent ID format".to_string())
    }

    pub fn invalid_batch_id() -> Self {
        ApiError::BadRequest("Invalid batch ID format".to_string())
    }

    pub fn insufficient_quantity(available: f64, requested: f64) -> Self {
        ApiError::BadRequest(format!("Insufficient quantity. Available: {}, Requested: {}", available, requested))
    }

    pub fn batch_expiry_date_invalid() -> Self {
        ApiError::BadRequest("Expiry date cannot be in the past".to_string())
    }

    pub fn cannot_modify_depleted_batch() -> Self {
        ApiError::BadRequest("Cannot modify depleted batch".to_string())
    }

    pub fn validation_failed(field: &str) -> Self {
        ApiError::ValidationError(format!("Validation failed for field: {}", field))
    }
}

// Функции валидации
pub fn validate_cas_number(cas: &str) -> Result<(), ApiError> {
    if cas.is_empty() {
        return Ok(());
    }

    // Простая валидация CAS номера (формат: XXXXX-XX-X)
    let parts: Vec<&str> = cas.split('-').collect();
    if parts.len() != 3 {
        return Err(ApiError::ValidationError("Invalid CAS number format".to_string()));
    }

    Ok(())
}

pub fn validate_quantity(quantity: f64) -> Result<(), ApiError> {
    if quantity < 0.0 {
        return Err(ApiError::ValidationError("Quantity cannot be negative".to_string()));
    }
    if quantity > 1e9 {
        return Err(ApiError::ValidationError("Quantity too large".to_string()));
    }
    Ok(())
}

pub fn validate_unit(unit: &str) -> Result<(), ApiError> {
    let valid_units = ["g", "kg", "mg", "μg", "L", "mL", "μL", "mol", "mmol", "μmol", "pieces", "pcs"];
    if !valid_units.contains(&unit) {
        return Err(ApiError::ValidationError(format!(
            "Invalid unit '{}'. Valid units: {}",
            unit,
            valid_units.join(", ")
        )));
    }
    Ok(())

}