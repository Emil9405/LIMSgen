use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::AppState;
use crate::models::*;
use crate::error::{ApiError, ApiResult};
use crate::handlers::{ApiResponse, PaginationQuery};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use calamine::{open_workbook, Reader, Range, Xlsx};
use uuid::Uuid;
use std::io::Read;
use actix_multipart::Multipart;
use futures_util::stream::StreamExt;
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;


// ==================== IMPORT/EXPORT MODELS ====================

#[derive(Debug, Deserialize)]
pub struct ImportReagent {
    pub name: String,
    pub formula: Option<String>,
    pub cas_number: Option<String>,
    pub manufacturer: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportBatch {
    pub reagent_name: String,
    pub batch_number: String,
    pub cat_number: Option<String>,
    pub quantity: f64,
    pub unit: String,
    pub expiry_date: Option<String>,
    pub supplier: Option<String>,
    pub manufacturer: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportEquipment {
    pub name: String,
    pub type_: String,
    pub quantity: i32,
    pub unit: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
}

// ==================== REAGENT IMPORT/EXPORT ====================

pub async fn import_reagents(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportReagent>>,
) -> ApiResult<HttpResponse> {
    let mut imported = 0;
    let mut errors = Vec::new();
    
    for (idx, item) in data.iter().enumerate() {
        if item.name.trim().is_empty() {
            errors.push(format!("Row {}: Name is required", idx + 1));
            continue;
        }

        let existing: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM reagents WHERE name = ? AND status = 'active'"
        )
        .bind(&item.name)
        .fetch_one(&app_state.db_pool)
        .await
        .unwrap_or((0,));

        if existing.0 > 0 {
            errors.push(format!("Row {}: Reagent '{}' already exists", idx + 1, item.name));
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let result = sqlx::query(
            r#"INSERT INTO reagents
               (id, name, formula, cas_number, manufacturer, description, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)"#
        )
        .bind(&id)
        .bind(&item.name)
        .bind(&item.formula)
        .bind(&item.cas_number)
        .bind(&item.manufacturer)
        .bind(&item.description)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await;

        if result.is_ok() {
            imported += 1;
        } else {
            errors.push(format!("Row {}: Database error", idx + 1));
        }
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "imported": imported,
        "total": data.len(),
        "errors": errors
    }))))
}

pub async fn export_reagents(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let mut sql = "SELECT * FROM reagents WHERE status = 'active'".to_string();
    
    if let Some(ref search) = query.search {
        if !search.trim().is_empty() {
            sql.push_str(&format!(
                " AND (name LIKE '%{}%' OR formula LIKE '%{}%' OR cas_number LIKE '%{}%')",
                search, search, search
            ));
        }
    }
    
    sql.push_str(" ORDER BY name");

    let reagents: Vec<Reagent> = sqlx::query_as(&sql)
        .fetch_all(&app_state.db_pool)
        .await?;

    let mut csv_data = Vec::new();
    {
        let mut writer = csv::Writer::from_writer(&mut csv_data);
        
        writer.write_record(&[
            "Name", "Formula", "CAS Number", "Manufacturer", "Description"
        ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        
        for reagent in reagents {
            writer.write_record(&[
                reagent.name,
                reagent.formula.unwrap_or_default(),
                reagent.cas_number.unwrap_or_default(),
                reagent.manufacturer.unwrap_or_default(),
                reagent.description.unwrap_or_default(),
            ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        }
        
        writer.flush().map_err(|e| ApiError::InternalServerError(e.to_string()))?;
    }

    Ok(HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header(("Content-Disposition", "attachment; filename=\"reagents.csv\""))
        .body(csv_data))
}

// ==================== BATCH IMPORT/EXPORT ====================

pub async fn import_batches(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportBatch>>,
) -> ApiResult<HttpResponse> {
    let mut imported = 0;
    let mut errors = Vec::new();
    
    for (idx, item) in data.iter().enumerate() {
        if item.reagent_name.trim().is_empty() || item.batch_number.trim().is_empty() {
            errors.push(format!("Row {}: Reagent name and batch number are required", idx + 1));
            continue;
        }

        let reagent: Option<Reagent> = sqlx::query_as(
            "SELECT * FROM reagents WHERE name = ? AND status = 'active' LIMIT 1"
        )
        .bind(&item.reagent_name)
        .fetch_optional(&app_state.db_pool)
        .await
        .unwrap_or(None);

        let reagent = match reagent {
            Some(r) => r,
            None => {
                errors.push(format!("Row {}: Reagent '{}' not found", idx + 1, item.reagent_name));
                continue;
            }
        };

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let result = sqlx::query(
            r#"INSERT INTO batches
               (id, reagent_id, batch_number, cat_number, quantity, original_quantity, reserved_quantity, unit, 
                expiry_date, supplier, manufacturer, received_date, status, location, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)"#
        )
        .bind(&id)
        .bind(&reagent.id)
        .bind(&item.batch_number)
        .bind(&item.cat_number)
        .bind(item.quantity)
        .bind(item.quantity)
        .bind(&item.unit)
        .bind(&item.expiry_date)
        .bind(&item.supplier)
        .bind(&item.manufacturer)
        .bind(&now)
        .bind(&item.location)
        .bind(&item.notes)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await;

        if result.is_ok() {
            imported += 1;
        } else {
            errors.push(format!("Row {}: Database error", idx + 1));
        }
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "imported": imported,
        "total": data.len(),
        "errors": errors
    }))))
}

pub async fn export_batches(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let mut sql = r#"
        SELECT b.*, r.name as reagent_name
        FROM batches b
        JOIN reagents r ON b.reagent_id = r.id
        WHERE 1=1
    "#.to_string();
    
    if let Some(ref status) = query.status {
        sql.push_str(&format!(" AND b.status = '{}'", status));
    }
    
    sql.push_str(" ORDER BY b.created_at DESC");

    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct BatchExport {
        reagent_name: String,
        batch_number: String,
        cat_number: Option<String>,
        quantity: f64,
        unit: String,
        expiry_date: Option<String>,
        supplier: Option<String>,
        manufacturer: Option<String>,
        location: Option<String>,
        status: String,
    }

    let batches: Vec<BatchExport> = sqlx::query_as(&sql)
        .fetch_all(&app_state.db_pool)
        .await?;

    let mut csv_data = Vec::new();
    {
        let mut writer = csv::Writer::from_writer(&mut csv_data);
        
        writer.write_record(&[
            "Reagent", "Batch Number", "Cat Number", "Quantity", "Unit", 
            "Expiry Date", "Supplier", "Manufacturer", "Location", "Status"
        ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        
        for batch in batches {
            writer.write_record(&[
                batch.reagent_name,
                batch.batch_number,
                batch.cat_number.unwrap_or_default(),
                batch.quantity.to_string(),
                batch.unit,
                batch.expiry_date.unwrap_or_default(),
                batch.supplier.unwrap_or_default(),
                batch.manufacturer.unwrap_or_default(),
                batch.location.unwrap_or_default(),
                batch.status,
            ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        }
        
        writer.flush().map_err(|e| ApiError::InternalServerError(e.to_string()))?;
    }

    Ok(HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header(("Content-Disposition", "attachment; filename=\"batches.csv\""))
        .body(csv_data))
}

// ==================== EQUIPMENT IMPORT/EXPORT ====================

pub async fn import_equipment(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportEquipment>>,
) -> ApiResult<HttpResponse> {
    let mut imported = 0;
    let mut errors = Vec::new();
    
    for (idx, item) in data.iter().enumerate() {
        if item.name.trim().is_empty() {
            errors.push(format!("Row {}: Name is required", idx + 1));
            continue;
        }

        if item.type_ != "equipment" && item.type_ != "labware" {
            errors.push(format!("Row {}: Type must be 'equipment' or 'labware'", idx + 1));
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let result = sqlx::query(
            r#"INSERT INTO equipment
               (id, name, type_, quantity, unit, status, location, description, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)"#
        )
        .bind(&id)
        .bind(&item.name)
        .bind(&item.type_)
        .bind(item.quantity)
        .bind(&item.unit)
        .bind(&item.location)
        .bind(&item.description)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await;

        if result.is_ok() {
            imported += 1;
        } else {
            errors.push(format!("Row {}: Database error", idx + 1));
        }
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "imported": imported,
        "total": data.len(),
        "errors": errors
    }))))
}

pub async fn export_equipment(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let mut sql = "SELECT * FROM equipment WHERE 1=1".to_string();
    
    if let Some(ref status) = query.status {
        sql.push_str(&format!(" AND status = '{}'", status));
    }
    
    sql.push_str(" ORDER BY name");

    let equipment: Vec<Equipment> = sqlx::query_as(&sql)
        .fetch_all(&app_state.db_pool)
        .await?;

    let mut csv_data = Vec::new();
    {
        let mut writer = csv::Writer::from_writer(&mut csv_data);
        
        writer.write_record(&[
            "Name", "Type", "Quantity", "Unit", "Location", "Status", "Description"
        ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        
        for item in equipment {
            writer.write_record(&[
                item.name,
                item.type_,
                item.quantity.to_string(),
                item.unit.unwrap_or_default(),
                item.location.unwrap_or_default(),
                item.status,
                item.description.unwrap_or_default(),
            ]).map_err(|e| ApiError::InternalServerError(e.to_string()))?;
        }
        
        writer.flush().map_err(|e| ApiError::InternalServerError(e.to_string()))?;
    }

    Ok(HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header(("Content-Disposition", "attachment; filename=\"equipment.csv\""))
        .body(csv_data))
}

// ==================== JSON IMPORT ====================

pub async fn import_reagents_json(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportReagent>>,
) -> ApiResult<HttpResponse> {
    import_reagents(app_state, data).await
}

pub async fn import_batches_json(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportBatch>>,
) -> ApiResult<HttpResponse> {
    import_batches(app_state, data).await
}

pub async fn import_equipment_json(
    app_state: web::Data<Arc<AppState>>,
    data: web::Json<Vec<ImportEquipment>>,
) -> ApiResult<HttpResponse> {
    import_equipment(app_state, data).await
}

// ==================== EXCEL IMPORT ====================

#[derive(Debug, Deserialize)]
pub struct ExcelUpload {
    pub file_data: Vec<u8>,
    pub sheet_name: Option<String>,
}

pub async fn import_reagents_excel(
    app_state: web::Data<Arc<AppState>>,
    bytes: web::Bytes,
) -> ApiResult<HttpResponse> {
    let reader = std::io::Cursor::new(bytes.as_ref());
    
    // Try to parse as Excel file using calamine
    let mut workbook = calamine::open_workbook_auto_from_rs(reader)
        .map_err(|e| ApiError::bad_request(&format!("Failed to read Excel file: {}", e)))?;
    
    let sheet_name = workbook.sheet_names().get(0)
        .ok_or_else(|| ApiError::bad_request("Excel file has no sheets"))?
        .clone();
    
    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| ApiError::bad_request(&format!("Failed to read sheet: {}", e)))?;
    
    let mut reagents = Vec::new();
    let mut rows = range.rows();
    
    // Skip header row
    rows.next();
    
    for row in rows {
        if row.len() < 5 {
            continue;
        }
        
        let reagent = ImportReagent {
            name: row[0].to_string(),
            formula: if row[1].to_string().is_empty() { None } else { Some(row[1].to_string()) },
            cas_number: if row[2].to_string().is_empty() { None } else { Some(row[2].to_string()) },
            manufacturer: if row[3].to_string().is_empty() { None } else { Some(row[3].to_string()) },
            description: if row[4].to_string().is_empty() { None } else { Some(row[4].to_string()) },
        };
        
        reagents.push(reagent);
    }
    
    import_reagents(app_state, web::Json(reagents)).await
}

pub async fn import_batches_excel(
    app_state: web::Data<Arc<AppState>>,
    bytes: web::Bytes,
) -> ApiResult<HttpResponse> {
    let reader = std::io::Cursor::new(bytes.as_ref());
    
    let mut workbook = calamine::open_workbook_auto_from_rs(reader)
        .map_err(|e| ApiError::bad_request(&format!("Failed to read Excel file: {}", e)))?;
    
    let sheet_name = workbook.sheet_names().get(0)
        .ok_or_else(|| ApiError::bad_request("Excel file has no sheets"))?
        .clone();
    
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|_| ApiError::bad_request(&format!("Sheet '{}' not found", sheet_name)))?;

    let mut batches = Vec::new();
    let mut rows = range.rows();
    
    // Skip header row
    rows.next();
    
    for row in rows {
        if row.len() < 10 {
            continue;
        }
        
        let quantity: f64 = row[3].to_string().parse().unwrap_or(0.0);
        
        let batch = ImportBatch {
            reagent_name: row[0].to_string(),
            batch_number: row[1].to_string(),
            cat_number: if row[2].to_string().is_empty() { None } else { Some(row[2].to_string()) },
            quantity,
            unit: row[4].to_string(),
            expiry_date: if row[5].to_string().is_empty() { None } else { Some(row[5].to_string()) },
            supplier: if row[6].to_string().is_empty() { None } else { Some(row[6].to_string()) },
            manufacturer: if row[7].to_string().is_empty() { None } else { Some(row[7].to_string()) },
            location: if row[8].to_string().is_empty() { None } else { Some(row[8].to_string()) },
            notes: if row[9].to_string().is_empty() { None } else { Some(row[9].to_string()) },
        };
        
        batches.push(batch);
    }
    
    import_batches(app_state, web::Json(batches)).await
}

pub async fn import_equipment_excel(
    app_state: web::Data<Arc<AppState>>,
    bytes: web::Bytes,
) -> ApiResult<HttpResponse> {
    let reader = std::io::Cursor::new(bytes.as_ref());
    
    let mut workbook = calamine::open_workbook_auto_from_rs(reader)
        .map_err(|e| ApiError::bad_request(&format!("Failed to read Excel file: {}", e)))?;
    
    let sheet_name = workbook.sheet_names().get(0)
        .ok_or_else(|| ApiError::bad_request("Excel file has no sheets"))?
        .clone();
    
    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| ApiError::bad_request(&format!("Failed to read sheet: {}", e)))?;
    
    let mut equipment_list = Vec::new();
    let mut rows = range.rows();
    
    // Skip header row
    rows.next();
    
    for row in rows {
        if row.len() < 7 {
            continue;
        }
        
        let quantity: i32 = row[2].to_string().parse().unwrap_or(1);
        
        let equipment = ImportEquipment {
            name: row[0].to_string(),
            type_: row[1].to_string(),
            quantity,
            unit: if row[3].to_string().is_empty() { None } else { Some(row[3].to_string()) },
            location: if row[4].to_string().is_empty() { None } else { Some(row[4].to_string()) },
            description: if row[6].to_string().is_empty() { None } else { Some(row[6].to_string()) },
        };
        
        equipment_list.push(equipment);
    }
    
    import_equipment(app_state, web::Json(equipment_list)).await
}
// ==================== DOCUMENT UPLOAD ====================

pub async fn upload_experiment_document(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    mut payload: Multipart,
    user_id: String,  // Добавить параметр
) -> ApiResult<HttpResponse> {
    let experiment_id = path.into_inner();

    let exp_check: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM experiments WHERE id = ?")
        .bind(&experiment_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    if exp_check.0 == 0 {
        return Err(ApiError::not_found("Experiment"));
    }

    let upload_dir = PathBuf::from("uploads/experiments");
    std::fs::create_dir_all(&upload_dir)?;

    while let Some(field) = payload.next().await {
        let mut field = field?;
        
        let filename = field
            .content_disposition()
            .get_filename()
            .map(|s| s.to_string())
            .ok_or_else(|| ApiError::bad_request("Filename not found"))?;

        let id = Uuid::new_v4().to_string();
        let file_path = upload_dir.join(&id);
        
        let mut file = tokio::fs::File::create(&file_path).await?;
        let mut size = 0i64;

        while let Some(chunk) = field.next().await {
            let data = chunk?;
            size += data.len() as i64;
            file.write_all(&data).await?;
        }

        sqlx::query(
            r#"INSERT INTO experiment_documents
               (id, experiment_id, filename, original_filename, file_path, file_size, mime_type, uploaded_by, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, 'application/octet-stream', ?, ?)"#
        )
            .bind(&id)
            .bind(&experiment_id)
            .bind(&id)
            .bind(&filename)
            .bind(file_path.to_str().unwrap())
            .bind(size)
            .bind(&user_id)  // Изменить: реальный user_id
            .bind(Utc::now())
            .execute(&app_state.db_pool)
            .await?;
    }

    Ok(HttpResponse::Created().json(ApiResponse::success_with_message(
        (),
        "Documents uploaded successfully".to_string(),
    )))
}
