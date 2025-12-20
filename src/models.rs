// src/models.rs
//! Модели данных для LIMS системы
//! 
//! Включает поддержку:
//! - Типов экспериментов (учебные/исследовательские)
//! - Валидации данных
//! - Сериализации/десериализации

use serde::{Serialize, Deserialize};
use validator::Validate;
use chrono::{DateTime, Utc};

// ==================== ТИПЫ ЭКСПЕРИМЕНТОВ ====================

/// Тип эксперимента
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ExperimentType {
    /// Учебный эксперимент - требует обязательное время начала и конца
    Educational,
    /// Исследовательский эксперимент - гибкое время
    Research,
}

impl Default for ExperimentType {
    fn default() -> Self {
        ExperimentType::Research
    }
}

impl ExperimentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExperimentType::Educational => "educational",
            ExperimentType::Research => "research",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "educational" | "учебный" => Some(ExperimentType::Educational),
            "research" | "исследовательский" => Some(ExperimentType::Research),
            _ => None,
        }
    }

    /// Требуется ли обязательное время начала и конца
    pub fn requires_time_bounds(&self) -> bool {
        matches!(self, ExperimentType::Educational)
    }

    /// Получить человекочитаемое название
    pub fn display_name(&self) -> &'static str {
        match self {
            ExperimentType::Educational => "Educational",
            ExperimentType::Research => "Research",
        }
    }

    /// Получить русское название
    pub fn display_name_ru(&self) -> &'static str {
        match self {
            ExperimentType::Educational => "Учебный",
            ExperimentType::Research => "Исследовательский",
        }
    }
}

impl std::fmt::Display for ExperimentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ==================== REAGENT ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Reagent {
    pub id: String,
    pub name: String,
    pub formula: Option<String>,
    pub cas_number: Option<String>,
    pub manufacturer: Option<String>,
    pub molecular_weight: Option<f64>,
    pub physical_state: Option<String>, 
    pub description: Option<String>,
    pub status: String,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateReagentRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: String,

    #[validate(length(max = 500, message = "Formula cannot exceed 500 characters"))]
    pub formula: Option<String>,

    #[validate(length(max = 50, message = "CAS number cannot exceed 50 characters"))]
    pub cas_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(range(min = 0.0001, message = "Molecular weight must be positive (>0)"))]
    pub molecular_weight: Option<f64>,

    #[validate(length(max = 50, message = "Physical state cannot exceed 50 characters"))]
    pub physical_state: Option<String>,

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
    pub cas_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(range(min = 0.0001, message = "Molecular weight must be positive (>0)"))]
    pub molecular_weight: Option<f64>,

    #[validate(length(max = 50, message = "Physical state cannot exceed 50 characters"))]
    pub physical_state: Option<String>,

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    pub status: Option<String>,
}

// ==================== BATCH ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Batch {
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
}

#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateBatchRequest {
    #[validate(length(min = 1, max = 100, message = "Batch number must be between 1 and 100 characters"))]
    pub batch_number: String,

    #[validate(length(max = 100, message = "Cat number cannot exceed 100 characters"))]
    pub cat_number: Option<String>,

    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: f64,

    #[validate(length(min = 1, max = 20, message = "Unit must be between 1 and 20 characters"))]
    pub unit: String,

    pub expiry_date: Option<DateTime<Utc>>,

    #[validate(length(max = 255, message = "Supplier cannot exceed 255 characters"))]
    pub supplier: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,

    pub received_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateBatchRequest {
    #[validate(length(min = 1, max = 100, message = "Batch number must be between 1 and 100 characters"))]
    pub batch_number: Option<String>,

    #[validate(length(max = 100, message = "Cat number cannot exceed 100 characters"))]
    pub cat_number: Option<String>,

    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: Option<f64>,

    #[validate(length(min = 1, max = 20, message = "Unit must be between 1 and 20 characters"))]
    pub unit: Option<String>,

    pub expiry_date: Option<DateTime<Utc>>,

    #[validate(length(max = 255, message = "Supplier name cannot exceed 255 characters"))]
    pub supplier: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,

    pub received_date: Option<DateTime<Utc>>,

    pub status: Option<String>,
}

// ==================== EQUIPMENT ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Equipment {
    pub id: String,
    pub name: String,
    #[sqlx(rename = "type_")]
    #[serde(rename = "type_")]
    pub type_: String,
    pub quantity: i32,
    pub unit: Option<String>,
    pub status: String,
    pub location: Option<String>,
    pub description: Option<String>,
    // Дополнительные поля (добавлены миграцией)
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub purchase_date: Option<String>,
    pub warranty_until: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct EquipmentPart {
    pub id: String,
    pub equipment_id: String,
    pub name: String,
    pub part_number: Option<String>,
    pub manufacturer: Option<String>,
    pub quantity: i32,
    pub min_quantity: i32,
    pub status: String,
    pub last_replaced: Option<String>,
    pub next_replacement: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateEquipmentPartRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: String,

    #[validate(length(max = 100, message = "Part number cannot exceed 100 characters"))]
    pub part_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    pub quantity: Option<i32>,
    pub min_quantity: Option<i32>,

    #[validate(length(max = 50, message = "Status cannot exceed 50 characters"))]
    pub status: Option<String>,

    pub last_replaced: Option<String>,
    pub next_replacement: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateEquipmentPartRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: Option<String>,

    #[validate(length(max = 100, message = "Part number cannot exceed 100 characters"))]
    pub part_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    pub quantity: Option<i32>,
    pub min_quantity: Option<i32>,

    #[validate(length(max = 50, message = "Status cannot exceed 50 characters"))]
    pub status: Option<String>,

    pub last_replaced: Option<String>,
    pub next_replacement: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

// ==================== EQUIPMENT MAINTENANCE (ОБСЛУЖИВАНИЕ) ====================

/// Запись об обслуживании оборудования
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct EquipmentMaintenance {
    pub id: String,
    pub equipment_id: String,
    pub maintenance_type: String,
    pub status: String,
    pub scheduled_date: String,
    pub completed_date: Option<String>,
    pub performed_by: Option<String>,
    pub description: Option<String>,
    pub cost: Option<f64>,
    pub parts_replaced: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Обслуживание с информацией об оборудовании
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct EquipmentMaintenanceWithEquipment {
    pub id: String,
    pub equipment_id: String,
    pub maintenance_type: String,
    pub status: String,
    pub scheduled_date: String,
    pub completed_date: Option<String>,
    pub performed_by: Option<String>,
    pub description: Option<String>,
    pub cost: Option<f64>,
    pub parts_replaced: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Поля из equipment
    pub equipment_name: String,
    pub equipment_location: Option<String>,
}

/// Запрос на создание обслуживания
#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateMaintenanceRequest {
    #[validate(length(min = 1, max = 50, message = "Maintenance type is required"))]
    pub maintenance_type: String,

    #[validate(length(max = 50, message = "Status cannot exceed 50 characters"))]
    pub status: Option<String>,

    pub scheduled_date: String,
    pub completed_date: Option<String>,

    #[validate(length(max = 255, message = "Performed by cannot exceed 255 characters"))]
    pub performed_by: Option<String>,

    #[validate(length(max = 2000, message = "Description cannot exceed 2000 characters"))]
    pub description: Option<String>,

    pub cost: Option<f64>,

    #[validate(length(max = 1000, message = "Parts replaced cannot exceed 1000 characters"))]
    pub parts_replaced: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

/// Запрос на обновление обслуживания
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateMaintenanceRequest {
    #[validate(length(max = 50, message = "Status cannot exceed 50 characters"))]
    pub status: Option<String>,

    pub completed_date: Option<String>,

    #[validate(length(max = 255, message = "Performed by cannot exceed 255 characters"))]
    pub performed_by: Option<String>,

    #[validate(length(max = 2000, message = "Description cannot exceed 2000 characters"))]
    pub description: Option<String>,

    pub cost: Option<f64>,

    #[validate(length(max = 1000, message = "Parts replaced cannot exceed 1000 characters"))]
    pub parts_replaced: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

/// Запрос на завершение обслуживания
#[derive(Debug, Deserialize)]
pub struct CompleteMaintenanceRequest {
    pub completed_date: Option<String>,
    pub performed_by: Option<String>,
    pub notes: Option<String>,
}

/// Параметры запроса предстоящего обслуживания
#[derive(Debug, Deserialize)]
pub struct UpcomingMaintenanceQuery {
    pub days: Option<i32>,
    pub limit: Option<i32>,
}

// ==================== EQUIPMENT FILE (ФАЙЛЫ) ====================

/// Файл оборудования (мануал, изображение и т.д.)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct EquipmentFile {
    pub id: String,
    pub equipment_id: String,
    pub part_id: Option<String>,
    pub file_type: String,
    pub original_filename: String,
    pub stored_filename: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub description: Option<String>,
    pub uploaded_by: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Запрос на загрузку файла (метаданные)
#[derive(Debug, Deserialize, Validate)]
pub struct UploadFileRequest {
    #[validate(length(max = 50, message = "File type cannot exceed 50 characters"))]
    pub file_type: Option<String>,

    #[validate(length(max = 500, message = "Description cannot exceed 500 characters"))]
    pub description: Option<String>,
}

// ==================== EQUIPMENT DETAIL RESPONSE ====================

/// Детальный ответ с оборудованием и связанными данными
#[derive(Debug, Serialize)]
pub struct EquipmentDetailResponse {
    #[serde(flatten)]
    pub equipment: Equipment,
    pub parts: Vec<EquipmentPart>,
    pub recent_maintenance: Vec<EquipmentMaintenance>,
    pub files: Vec<EquipmentFile>,
}

// ==================== SEARCH QUERY ====================

/// Параметры поискового запроса
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<i32>,
}

// ==================== РАСШИРЕНИЕ CreateEquipmentRequest ====================

/// Расширенный запрос на создание оборудования
#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateEquipmentRequestExtended {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: String,

    #[validate(length(min = 1, max = 50, message = "Type must be 'equipment', 'labware', 'instrument', or 'consumable'"))]
    #[serde(rename = "type_")]
    pub type_: String,

    #[validate(range(min = 1, message = "Quantity must be at least 1"))]
    pub quantity: i32,

    #[validate(length(max = 20, message = "Unit cannot exceed 20 characters"))]
    pub unit: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    // Новые поля
    #[validate(length(max = 100, message = "Serial number cannot exceed 100 characters"))]
    pub serial_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Model cannot exceed 255 characters"))]
    pub model: Option<String>,

    pub purchase_date: Option<String>,
    pub warranty_until: Option<String>,
}

/// Расширенный запрос на обновление оборудования
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateEquipmentRequestExtended {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: Option<String>,

    #[validate(length(max = 20, message = "Unit cannot exceed 20 characters"))]
    pub unit: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    pub status: Option<String>,
    pub quantity: Option<i32>,

    // Новые поля
    #[validate(length(max = 100, message = "Serial number cannot exceed 100 characters"))]
    pub serial_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Model cannot exceed 255 characters"))]
    pub model: Option<String>,

    pub purchase_date: Option<String>,
    pub warranty_until: Option<String>,
}



#[derive(Debug, Deserialize, Validate, Clone)]
pub struct CreateEquipmentRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: String,

    #[validate(length(min = 1, max = 50, message = "Type must be 'equipment' or 'labware'"))]
    #[serde(rename = "type_")]
    pub type_: String,

    #[validate(range(min = 1, message = "Quantity must be at least 1"))]
    pub quantity: i32,

    #[validate(length(max = 20, message = "Unit cannot exceed 20 characters"))]
    pub unit: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    // Дополнительные поля
    #[validate(length(max = 100, message = "Serial number cannot exceed 100 characters"))]
    pub serial_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Model cannot exceed 255 characters"))]
    pub model: Option<String>,

    pub purchase_date: Option<String>,
    pub warranty_until: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateEquipmentRequest {
    #[validate(length(min = 1, max = 255, message = "Name must be between 1 and 255 characters"))]
    pub name: Option<String>,

    #[validate(length(max = 20, message = "Unit cannot exceed 20 characters"))]
    pub unit: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 1000, message = "Description cannot exceed 1000 characters"))]
    pub description: Option<String>,

    pub status: Option<String>,

    pub quantity: Option<i32>,

    // Дополнительные поля
    #[validate(length(max = 100, message = "Serial number cannot exceed 100 characters"))]
    pub serial_number: Option<String>,

    #[validate(length(max = 255, message = "Manufacturer cannot exceed 255 characters"))]
    pub manufacturer: Option<String>,

    #[validate(length(max = 255, message = "Model cannot exceed 255 characters"))]
    pub model: Option<String>,

    pub purchase_date: Option<String>,
    pub warranty_until: Option<String>,
}

// ==================== EXPERIMENT ====================

/// Основная структура эксперимента
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Experiment {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub experiment_date: DateTime<Utc>,
    /// Тип эксперимента: educational или research
    #[sqlx(default)]
    pub experiment_type: Option<String>,
    pub instructor: Option<String>,
    pub student_group: Option<String>,
    /// Место проведения эксперимента
    pub location: Option<String>,
    pub status: String, 
    pub protocol: Option<String>,  
    /// Время начала (обязательно для учебных)
    pub start_date: DateTime<Utc>, 
    /// Время окончания (обязательно для учебных)
    pub end_date: Option<DateTime<Utc>>, 
    pub results: Option<String>, 
    pub notes: Option<String>, 
    pub created_by: String,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Experiment {
    /// Получить тип эксперимента
    pub fn get_experiment_type(&self) -> ExperimentType {
        self.experiment_type
            .as_ref()
            .and_then(|t| ExperimentType::from_str(t))
            .unwrap_or_default()
    }

    /// Проверить, является ли эксперимент учебным
    pub fn is_educational(&self) -> bool {
        self.get_experiment_type() == ExperimentType::Educational
    }

    /// Проверить валидность временных границ для учебного эксперимента
    pub fn validate_time_bounds(&self) -> Result<(), String> {
        if self.is_educational() {
            if self.end_date.is_none() {
                return Err("Educational experiments require end_date".to_string());
            }
            
            let end = self.end_date.unwrap();
            if end <= self.start_date {
                return Err("End time must be after start time".to_string());
            }
            
            let duration = end - self.start_date;
            if duration.num_minutes() < 15 {
                return Err("Educational experiment must be at least 15 minutes".to_string());
            }
            if duration.num_hours() > 8 {
                return Err("Educational experiment cannot exceed 8 hours".to_string());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExperimentDocument {
    pub id: String,
    pub experiment_id: String,
    pub filename: String,
    pub original_filename: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub uploaded_by: String,
    pub uploaded_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExperimentReagent {
    pub id: String,
    pub experiment_id: String,
    pub batch_id: String,
    pub quantity_used: f64,
    pub is_consumed: bool,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExperimentEquipment {
    pub id: String,
    pub experiment_id: String,
    pub equipment_id: String,
    pub quantity_used: i32,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Запрос на создание эксперимента
#[derive(Debug, Deserialize, Validate)]
pub struct CreateExperimentRequest {
    #[validate(length(min = 1, max = 255, message = "Title must be between 1 and 255 characters"))]
    pub title: String,

    #[validate(length(max = 2000, message = "Description cannot exceed 2000 characters"))]
    pub description: Option<String>,

    pub experiment_date: Option<DateTime<Utc>>,

    /// Тип эксперимента: educational или research
    #[validate(custom(function = "validate_experiment_type"))]
    pub experiment_type: Option<String>,

    #[validate(length(max = 255, message = "Instructor name cannot exceed 255 characters"))]
    pub instructor: Option<String>,

    #[validate(length(max = 100, message = "Student group cannot exceed 100 characters"))]
    pub student_group: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    #[validate(length(max = 2000, message = "Protocol cannot exceed 2000 characters"))]
    pub protocol: Option<String>,

    /// Время начала (обязательно для учебных экспериментов)
    pub start_date: Option<DateTime<Utc>>,

    /// Время окончания (обязательно для учебных экспериментов)
    pub end_date: Option<DateTime<Utc>>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

impl CreateExperimentRequest {
    /// Валидация для учебного эксперимента
    pub fn validate_educational(&self) -> Result<(), String> {
        let exp_type = self.experiment_type
            .as_ref()
            .and_then(|t| ExperimentType::from_str(t))
            .unwrap_or_default();

        if exp_type == ExperimentType::Educational {
            let start = self.start_date
                .ok_or("Educational experiments require start_date")?;
            let end = self.end_date
                .ok_or("Educational experiments require end_date")?;

            if end <= start {
                return Err("End time must be after start time".to_string());
            }

            let duration = end - start;
            if duration.num_minutes() < 15 {
                return Err("Educational experiment must be at least 15 minutes".to_string());
            }
            if duration.num_hours() > 8 {
                return Err("Educational experiment cannot exceed 8 hours".to_string());
            }
        }

        Ok(())
    }
}

/// Запрос на обновление эксперимента
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateExperimentRequest {
    #[validate(length(min = 1, max = 255, message = "Title must be between 1 and 255 characters"))]
    pub title: Option<String>,

    #[validate(length(max = 2000, message = "Description cannot exceed 2000 characters"))]
    pub description: Option<String>,

    pub experiment_date: Option<DateTime<Utc>>,

    /// Тип эксперимента: educational или research
    #[validate(custom(function = "validate_experiment_type_option"))]
    pub experiment_type: Option<String>,

    #[validate(length(max = 255, message = "Instructor name cannot exceed 255 characters"))]
    pub instructor: Option<String>,

    #[validate(length(max = 100, message = "Student group cannot exceed 100 characters"))]
    pub student_group: Option<String>,

    #[validate(length(max = 255, message = "Location cannot exceed 255 characters"))]
    pub location: Option<String>,

    pub status: Option<String>,

    #[validate(length(max = 2000, message = "Protocol cannot exceed 2000 characters"))]
    pub protocol: Option<String>,

    pub start_date: Option<DateTime<Utc>>,

    pub end_date: Option<DateTime<Utc>>,

    #[validate(length(max = 5000, message = "Results cannot exceed 5000 characters"))]
    pub results: Option<String>,

    #[validate(length(max = 1000, message = "Notes cannot exceed 1000 characters"))]
    pub notes: Option<String>,
}

/// Валидация типа эксперимента
fn validate_experiment_type(value: &str) -> Result<(), validator::ValidationError> {
    if ExperimentType::from_str(value).is_some() {
        Ok(())
    } else {
        let mut error = validator::ValidationError::new("invalid_experiment_type");
        error.message = Some("Experiment type must be 'educational' or 'research'".into());
        Err(error)
    }
}

/// Валидация опционального типа эксперимента
fn validate_experiment_type_option(value: &str) -> Result<(), validator::ValidationError> {
    if value.is_empty() || ExperimentType::from_str(value).is_some() {
        Ok(())
    } else {
        let mut error = validator::ValidationError::new("invalid_experiment_type");
        error.message = Some("Experiment type must be 'educational' or 'research'".into());
        Err(error)
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddExperimentReagentRequest {
    pub batch_id: String,

    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity_used: f64,

    pub is_consumed: Option<bool>,

    #[validate(length(max = 500, message = "Notes cannot exceed 500 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddExperimentEquipmentRequest {
    pub equipment_id: String,

    #[validate(range(min = 1, message = "Quantity must be at least 1"))]
    pub quantity_used: i32,

    #[validate(length(max = 500, message = "Notes cannot exceed 500 characters"))]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExperimentWithDetails {
    #[serde(flatten)]
    pub experiment: Experiment,
    pub documents: Vec<ExperimentDocument>,
    pub reagents: Vec<ExperimentReagentDetail>,
    pub equipment: Vec<ExperimentEquipmentDetail>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExperimentReagentDetail {
    pub id: String,
    pub batch_id: String,
    pub reagent_id: String,
    pub reagent_name: String,
    pub batch_number: String,
    pub quantity_used: f64,
    pub is_consumed: bool,
    pub unit: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExperimentEquipmentDetail {
    pub id: String,
    pub equipment_id: String,
    pub equipment_name: String,
    pub quantity_used: i32,
    pub unit: Option<String>,
    pub notes: Option<String>,
}

// ==================== REAGENT WITH STOCK ====================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ReagentWithStock {
    #[serde(flatten)]
    pub reagent: Reagent,
    pub total_quantity: Option<f64>,
    pub reserved_quantity: Option<f64>,
    pub available_quantity: Option<f64>,
    pub batches_count: i64,
    #[sqlx(default)]
    pub total_display: String,
}

// ==================== BATCH WITH REAGENT INFO ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct BatchWithReagentInfo {
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
}

// ==================== СТАТИСТИКА ====================

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_reagents: i64,
    pub total_batches: i64,
    pub total_equipment: i64,
    pub total_experiments: i64,
    pub active_experiments: i64,
    pub low_stock_batches: i64,
    pub expiring_soon_batches: i64,
    pub educational_experiments: i64,
    pub research_experiments: i64,
}

#[derive(Debug, Serialize)]
pub struct ExperimentStats {
    pub total: i64,
    pub planned: i64,
    pub in_progress: i64,
    pub completed: i64,
    pub cancelled: i64,
    pub educational: i64,
    pub research: i64,
}
// ==================== ROOM MODELS ====================

/// Комната/помещение для проведения экспериментов
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    pub color: Option<String>,
    pub status: String,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Запрос на создание комнаты
#[derive(Debug, Deserialize, Validate)]
pub struct CreateRoomRequest {
    #[validate(length(min = 1, max = 100, message = "Room name must be between 1 and 100 characters"))]
    pub name: String,

    #[validate(length(max = 500, message = "Description cannot exceed 500 characters"))]
    pub description: Option<String>,

    #[validate(range(min = 1, max = 1000, message = "Capacity must be between 1 and 1000"))]
    pub capacity: Option<i32>,

    #[validate(length(max = 20, message = "Color code cannot exceed 20 characters"))]
    pub color: Option<String>,
}

/// Запрос на обновление комнаты
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateRoomRequest {
    #[validate(length(min = 1, max = 100, message = "Room name must be between 1 and 100 characters"))]
    pub name: Option<String>,

    #[validate(length(max = 500, message = "Description cannot exceed 500 characters"))]
    pub description: Option<String>,

    #[validate(range(min = 1, max = 1000, message = "Capacity must be between 1 and 1000"))]
    pub capacity: Option<i32>,

    #[validate(length(max = 20, message = "Color code cannot exceed 20 characters"))]
    pub color: Option<String>,

    pub status: Option<String>,
}

/// Статус комнаты
/// 
/// Жизненный цикл:
/// - Available: свободна, можно бронировать
/// - Reserved: забронирована на будущее
/// - Occupied: идёт эксперимент
/// - Maintenance: плановое обслуживание
/// - Unavailable: недоступна (закрыта, санитарный день и т.д.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomStatus {
    Available,
    Reserved,
    Occupied,
    Maintenance,
    Unavailable,
}

impl RoomStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            RoomStatus::Available => "available",
            RoomStatus::Reserved => "reserved",
            RoomStatus::Occupied => "occupied",
            RoomStatus::Maintenance => "maintenance",
            RoomStatus::Unavailable => "unavailable",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "available" => Some(RoomStatus::Available),
            "reserved" => Some(RoomStatus::Reserved),
            "occupied" => Some(RoomStatus::Occupied),
            "maintenance" => Some(RoomStatus::Maintenance),
            "unavailable" => Some(RoomStatus::Unavailable),
            _ => None,
        }
    }

    pub fn is_valid(s: &str) -> bool {
        Self::from_str(s).is_some()
    }
    
    /// Все допустимые значения
    pub const fn all_values() -> &'static [&'static str] {
        &["available", "reserved", "occupied", "maintenance", "unavailable"]
    }
}

impl Default for RoomStatus {
    fn default() -> Self {
        RoomStatus::Available
    }
}

/// Валидация статуса комнаты
pub fn validate_room_status(value: &str) -> Result<(), validator::ValidationError> {
    if RoomStatus::is_valid(value) {
        Ok(())
    } else {
        let mut error = validator::ValidationError::new("invalid_room_status");
        error.message = Some("Room status must be 'available', 'reserved', 'occupied', 'maintenance', or 'unavailable'".into());
        Err(error)
    }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_experiment_type_from_str() {
        assert_eq!(ExperimentType::from_str("educational"), Some(ExperimentType::Educational));
        assert_eq!(ExperimentType::from_str("EDUCATIONAL"), Some(ExperimentType::Educational));
        assert_eq!(ExperimentType::from_str("research"), Some(ExperimentType::Research));
        assert_eq!(ExperimentType::from_str("учебный"), Some(ExperimentType::Educational));
        assert_eq!(ExperimentType::from_str("invalid"), None);
    }

    #[test]
    fn test_experiment_type_requires_time_bounds() {
        assert!(ExperimentType::Educational.requires_time_bounds());
        assert!(!ExperimentType::Research.requires_time_bounds());
    }

    #[test]
    fn test_experiment_type_display() {
        assert_eq!(ExperimentType::Educational.as_str(), "educational");
        assert_eq!(ExperimentType::Research.as_str(), "research");
        assert_eq!(ExperimentType::Educational.display_name(), "Educational");
        assert_eq!(ExperimentType::Educational.display_name_ru(), "Учебный");
    }

    #[test]
    fn test_create_experiment_request_validation() {
        let request = CreateExperimentRequest {
            title: "Test Experiment".to_string(),
            description: None,
            experiment_date: Some(Utc::now()),
            experiment_type: Some("educational".to_string()),
            instructor: Some("Dr. Smith".to_string()),
            student_group: Some("Group 101".to_string()),
            location: Some("Lab 101".to_string()),
            protocol: None,
            start_date: Some(Utc::now()),
            end_date: Some(Utc::now() + chrono::Duration::hours(2)),
            notes: None,
        };

        assert!(request.validate_educational().is_ok());
    }

    #[test]
    fn test_educational_experiment_without_end_time() {
        let request = CreateExperimentRequest {
            title: "Test".to_string(),
            description: None,
            experiment_date: Some(Utc::now()),
            experiment_type: Some("educational".to_string()),
            instructor: None,
            student_group: None,
            location: None,
            protocol: None,
            start_date: Some(Utc::now()),
            end_date: None, // Missing!
            notes: None,
        };

        assert!(request.validate_educational().is_err());
    }
}