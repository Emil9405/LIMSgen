// src/validator.rs - Centralized validation module
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use regex::Regex;
use lazy_static::lazy_static;
use chrono::{DateTime, Utc};
use crate::error::ApiError;
use crate::models::*;

lazy_static! {
    static ref CAS_REGEX: Regex = Regex::new(r"^\d{2,7}-\d{2}-\d$").unwrap();
    static ref EMAIL_REGEX: Regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    static ref FORMULA_REGEX: Regex = Regex::new(r"^[A-Za-z0-9()\[\]·+-]+$").unwrap();
}

// ==================== VALIDATION RESULT ====================

#[derive(Debug, Default, Serialize)]
pub struct ValidationResult {
    pub errors: HashMap<String, Vec<String>>,
    pub warnings: HashMap<String, Vec<String>>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    pub fn add_error(&mut self, field: impl Into<String>, message: impl Into<String>) {
        self.errors
            .entry(field.into())
            .or_default()
            .push(message.into());
    }

    pub fn add_warning(&mut self, field: impl Into<String>, message: impl Into<String>) {
        self.warnings
            .entry(field.into())
            .or_default()
            .push(message.into());
    }

    pub fn merge(&mut self, other: ValidationResult) {
        for (field, errors) in other.errors {
            self.errors.entry(field).or_default().extend(errors);
        }
        for (field, warnings) in other.warnings {
            self.warnings.entry(field).or_default().extend(warnings);
        }
    }

    pub fn to_api_error(&self) -> ApiError {
        let message = self.errors
            .iter()
            .map(|(field, errors)| format!("{}: {}", field, errors.join(", ")))
            .collect::<Vec<_>>()
            .join("; ");

        ApiError::ValidationError(message)
    }
}

// ==================== FIELD VALIDATORS ====================

pub struct FieldValidator;

impl FieldValidator {
    pub fn not_empty(value: &str, field: &str) -> Result<(), String> {
        if value.trim().is_empty() {
            Err(format!("{} cannot be empty", field))
        } else {
            Ok(())
        }
    }

    pub fn length(value: &str, field: &str, min: Option<usize>, max: Option<usize>) -> Result<(), String> {
        let len = value.len();

        if let Some(min_len) = min {
            if len < min_len {
                return Err(format!("{} must be at least {} characters", field, min_len));
            }
        }

        if let Some(max_len) = max {
            if len > max_len {
                return Err(format!("{} must not exceed {} characters", field, max_len));
            }
        }

        Ok(())
    }

    pub fn range<T: PartialOrd + std::fmt::Display>(
        value: T,
        field: &str,
        min: Option<T>,
        max: Option<T>
    ) -> Result<(), String> {
        if let Some(min_val) = min {
            if value < min_val {
                return Err(format!("{} must be at least {}", field, min_val));
            }
        }

        if let Some(max_val) = max {
            if value > max_val {
                return Err(format!("{} must not exceed {}", field, max_val));
            }
        }

        Ok(())
    }

    pub fn cas_number(value: &str) -> Result<(), String> {
        if value.is_empty() {
            return Ok(());
        }

        if !CAS_REGEX.is_match(value) {
            return Err("Invalid CAS number format (expected: XXXXX-XX-X)".to_string());
        }

        let parts: Vec<&str> = value.split('-').collect();
        if parts.len() == 3 {
            let check_digit: u8 = parts[2].parse()
                .map_err(|_| "Invalid CAS check digit".to_string())?;

            let full_number = format!("{}{}", parts[0], parts[1]);
            let mut sum = 0;

            for (i, c) in full_number.chars().rev().enumerate() {
                if let Some(digit) = c.to_digit(10) {
                    sum += digit * (i as u32 + 1);
                }
            }

            if (sum % 10) as u8 != check_digit {
                return Err("Invalid CAS number (check digit mismatch)".to_string());
            }
        }

        Ok(())
    }

    pub fn chemical_formula(value: &str) -> Result<(), String> {
        if value.is_empty() {
            return Ok(());
        }

        if !FORMULA_REGEX.is_match(value) {
            return Err("Invalid chemical formula format".to_string());
        }

        let mut balance = 0;
        for ch in value.chars() {
            match ch {
                '(' | '[' => balance += 1,
                ')' | ']' => balance -= 1,
                _ => {}
            }
            if balance < 0 {
                return Err("Unbalanced brackets in formula".to_string());
            }
        }

        if balance != 0 {
            return Err("Unbalanced brackets in formula".to_string());
        }

        Ok(())
    }

    pub fn email(value: &str) -> Result<(), String> {
        if EMAIL_REGEX.is_match(value) {
            Ok(())
        } else {
            Err("Invalid email format".to_string())
        }
    }

    pub fn quantity(value: f64) -> Result<(), String> {
        if value < 0.0 {
            Err("Quantity cannot be negative".to_string())
        } else if value > 1e9 {
            Err("Quantity too large".to_string())
        } else {
            Ok(())
        }
    }

    pub fn expiry_date(value: Option<&DateTime<Utc>>, warn_days: i64) -> ValidationResult {
        let mut result = ValidationResult::new();

        if let Some(date) = value {
            let now = Utc::now();
            let days_until = (*date - now).num_days();

            if days_until < 0 {
                result.add_error("expiry_date", "Product has already expired");
            } else if days_until <= warn_days {
                result.add_warning("expiry_date", format!("Expires in {} days", days_until));
            }
        }

        result
    }
}

// ==================== UNIT VALIDATION ====================

pub const VALID_UNITS: &[&str] = &[
    // Масса
    "g", "kg", "mg", "μg", "ug", "t",
    // Объем
    "L", "mL", "μL", "uL", "l", "ml", "μl", "ul",
    // Количество вещества
    "mol", "mmol", "μmol", "umol", "kmol",
    // Штуки
    "pieces", "pcs", "шт", "units",
    // Проценты
    "%", "ppm", "ppb",
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UnitType {
    Mass,
    Volume,
    Amount,
    Count,
    Percentage,
}

pub struct UnitValidator;

impl UnitValidator {
    pub fn validate_unit(unit: &str) -> Result<(), String> {
        if VALID_UNITS.contains(&unit) {
            Ok(())
        } else {
            Err(format!("Invalid unit '{}'. Valid units: {}", unit, VALID_UNITS.join(", ")))
        }
    }

    pub fn get_unit_type(unit: &str) -> Option<UnitType> {
        match unit {
            "g" | "kg" | "mg" | "μg" | "ug" | "t" => Some(UnitType::Mass),
            "L" | "mL" | "μL" | "uL" | "l" | "ml" | "μl" | "ul" => Some(UnitType::Volume),
            "mol" | "mmol" | "μmol" | "umol" | "kmol" => Some(UnitType::Amount),
            "pieces" | "pcs" | "шт" | "units" => Some(UnitType::Count),
            "%" | "ppm" | "ppb" => Some(UnitType::Percentage),
            _ => None,
        }
    }
}

pub struct UnitConverter {
    conversions: HashMap<String, ConversionFactor>,
}

struct ConversionFactor {
    to_base: f64,
    base_unit: &'static str,
    unit_type: UnitType,
}

impl UnitConverter {
    pub fn new() -> Self {
        let mut conversions = HashMap::new();

        // Масса (база - граммы)
        conversions.insert("kg".to_string(), ConversionFactor {
            to_base: 1000.0,
            base_unit: "g",
            unit_type: UnitType::Mass,
        });
        conversions.insert("g".to_string(), ConversionFactor {
            to_base: 1.0,
            base_unit: "g",
            unit_type: UnitType::Mass,
        });
        conversions.insert("mg".to_string(), ConversionFactor {
            to_base: 0.001,
            base_unit: "g",
            unit_type: UnitType::Mass,
        });
        conversions.insert("μg".to_string(), ConversionFactor {
            to_base: 0.000001,
            base_unit: "g",
            unit_type: UnitType::Mass,
        });
        conversions.insert("ug".to_string(), ConversionFactor {
            to_base: 0.000001,
            base_unit: "g",
            unit_type: UnitType::Mass,
        });

        // Объем (база - миллилитры)
        conversions.insert("L".to_string(), ConversionFactor {
            to_base: 1000.0,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });
        conversions.insert("l".to_string(), ConversionFactor {
            to_base: 1000.0,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });
        conversions.insert("mL".to_string(), ConversionFactor {
            to_base: 1.0,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });
        conversions.insert("ml".to_string(), ConversionFactor {
            to_base: 1.0,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });
        conversions.insert("μL".to_string(), ConversionFactor {
            to_base: 0.001,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });
        conversions.insert("uL".to_string(), ConversionFactor {
            to_base: 0.001,
            base_unit: "mL",
            unit_type: UnitType::Volume,
        });

        Self { conversions }
    }

    pub fn convert(&self, quantity: f64, from: &str, to: &str) -> Result<f64, String> {
        let from_factor = self.conversions.get(from)
            .ok_or_else(|| format!("Unknown unit: {}", from))?;
        let to_factor = self.conversions.get(to)
            .ok_or_else(|| format!("Unknown unit: {}", to))?;

        if from_factor.unit_type != to_factor.unit_type {
            return Err(format!("Cannot convert {} to {} (different types)", from, to));
        }

        let base_quantity = quantity * from_factor.to_base;
        let result = base_quantity / to_factor.to_base;

        Ok(result)
    }
}

// ==================== CUSTOM VALIDATION ====================

pub trait CustomValidate {
    fn custom_validate(&self) -> ValidationResult;
}

impl CustomValidate for CreateReagentRequest {
    fn custom_validate(&self) -> ValidationResult {
        let mut result = ValidationResult::new();

        if let Some(ref cas) = self.cas_number {
            if let Err(e) = FieldValidator::cas_number(cas) {
                result.add_error("cas_number", e);
            }
        }

        if let Some(ref formula) = self.formula {
            if let Err(e) = FieldValidator::chemical_formula(formula) {
                result.add_error("formula", e);
            }
        }

        result
    }
}

impl CustomValidate for CreateBatchRequest {
    fn custom_validate(&self) -> ValidationResult {
        let mut result = ValidationResult::new();

        // Проверка срока годности
        result.merge(FieldValidator::expiry_date(self.expiry_date.as_ref(), 30));

        result
    }
}

impl CustomValidate for UseReagentRequest {
    fn custom_validate(&self) -> ValidationResult {
        let mut result = ValidationResult::new();

        if let Err(e) = FieldValidator::quantity(self.quantity_used) {
            result.add_error("quantity_used", e);
        }

        result
    }
}

// ==================== BUSINESS VALIDATORS ====================

pub struct BusinessValidator;

impl BusinessValidator {
    pub fn validate_reagent_usage(
        available: f64,
        requested: f64,
        status: &str,
    ) -> ValidationResult {
        let mut result = ValidationResult::new();

        if status != "available" {
            result.add_error("status", format!("Batch not available (status: {})", status));
        }

        if requested <= 0.0 {
            result.add_error("quantity", "Requested quantity must be positive");
        }

        if requested > available {
            result.add_error("quantity",
                             format!("Insufficient quantity. Available: {}, Requested: {}", available, requested)
            );
        }

        if requested > available * 0.8 && requested <= available {
            result.add_warning("quantity", "Using more than 80% of available quantity");
        }

        if requested < 0.001 {
            result.add_warning("quantity", "Very small quantity requested");
        }

        result
    }

    pub fn validate_reservation(
        available: f64,
        requested: f64,
        current_reserved: f64,
    ) -> ValidationResult {
        let mut result = ValidationResult::new();

        let total_reserved = current_reserved + requested;

        if total_reserved > available {
            result.add_error("quantity",
                             format!("Cannot reserve {}. Available: {}, Already reserved: {}",
                                     requested, available, current_reserved)
            );
        }

        if total_reserved > available * 0.9 {
            result.add_warning("quantity", "More than 90% will be reserved");
        }

        result
    }
}

// ==================== USE REAGENT REQUEST ====================

#[derive(Debug, Deserialize, validator::Validate)]
pub struct UseReagentRequest {
    #[validate(range(min = 0.0, message = "Quantity must be positive"))]
    pub quantity_used: f64,

    #[validate(length(max = 500, message = "Purpose cannot exceed 500 characters"))]
    pub purpose: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

// ==================== IMPORT BATCH ====================

#[derive(Debug, Deserialize, Clone)]
pub struct ImportBatch {
    pub reagent_name: String,
    pub batch_number: String,
    pub quantity: f64,
    pub unit: String,
    pub cat_number: Option<String>,
    pub expiry_date: Option<String>,
    pub supplier: Option<String>,
    pub manufacturer: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
}