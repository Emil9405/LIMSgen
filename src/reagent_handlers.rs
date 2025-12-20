// src/reagent_handlers.rs
//! Обработчики для реагентов с поддержкой FTS поиска
//! ✅ ИСПРАВЛЕНО: 
//!   - Конфликт алиасов SQL (bs вместо b)
//!   - FTS использует rowid вместо id (FTS5 не имеет колонки id)
//!   - Валидация CAS через FieldValidator
//!   - Валидация в update_reagent

use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::AppState;
use crate::models::*;
use crate::error::{ApiError, ApiResult};
use crate::handlers::{ApiResponse, PaginatedResponse, PaginationQuery};
use crate::validator::FieldValidator;
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;
use serde::Serialize;
use log::{debug, info, warn};

// ==================== RESPONSE STRUCTURES ====================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ReagentListItem {
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
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub total_quantity: f64,
    pub reserved_quantity: f64,
    pub available_quantity: f64,
    pub batches_count: i64,
    #[sqlx(default)]
    pub total_display: String,
}

#[derive(Debug, Serialize)]
pub struct ReagentWithStockResponse {
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
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub total_quantity: f64,
    pub total_unit: String,
    pub batches_count: i64,
    pub available_batches: i64,
    pub reserved_quantity: f64,
    pub low_stock: bool,
    pub expiring_soon_count: i64,
    pub expired_count: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct ReagentStockAggregation {
    pub total_quantity: Option<f64>,
    pub reserved_quantity: Option<f64>,
    pub original_quantity: Option<f64>,
    pub batches_count: i64,
    pub available_batches: i64,
    pub expiring_soon_count: i64,
    pub expired_count: i64,
    pub primary_unit: Option<String>,
}

// ==================== FTS HELPERS ====================

/// Проверить доступность FTS таблицы
async fn is_fts_available(pool: &sqlx::SqlitePool) -> bool {
    let result: Result<(i64,), _> = sqlx::query_as(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reagents_fts'"
    ).fetch_one(pool).await;
    
    matches!(result, Ok((count,)) if count > 0)
}

/// Экранировать FTS запрос
fn escape_fts_query(query: &str) -> String {
    query
        .chars()
        .filter(|c| !matches!(c, '(' | ')' | '*' | '"' | ':' | '^' | '-' | '+' | '~' | '&' | '|'))
        .collect::<String>()
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Построить условие поиска с учётом FTS
/// ✅ ИСПРАВЛЕНО: 
///   - Используем rowid вместо id для FTS (FTS5 не имеет колонки id!)
///   - Используем алиас `bs` вместо `b` для подзапроса батчей
fn build_search_condition(search: &str, use_fts: bool, table_alias: &str) -> (String, Vec<String>) {
    let search_trimmed = search.trim();
    if search_trimmed.is_empty() {
        return (String::new(), Vec::new());
    }

    if use_fts {
        let escaped = escape_fts_query(search_trimmed);
        
        // Добавляем * к каждому слову для prefix matching
        let fts_query = escaped
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|word| format!("{}*", word))
            .collect::<Vec<_>>()
            .join(" ");
        
        if fts_query.is_empty() {
            return (String::new(), Vec::new());
        }
        
        // ✅ ИСПРАВЛЕНО: Используем rowid вместо id!
        // FTS5 таблица reagents_fts НЕ имеет колонки id, только rowid
        let pattern = format!("%{}%", search_trimmed);
        let condition = format!(
            "({}.rowid IN (SELECT rowid FROM reagents_fts WHERE reagents_fts MATCH ?) \
             OR EXISTS (SELECT 1 FROM batches bs WHERE bs.reagent_id = {}.id AND \
             (bs.batch_number LIKE ? OR bs.cat_number LIKE ? OR bs.supplier LIKE ?)))",
            table_alias, table_alias
        );
        
        (condition, vec![fts_query, pattern.clone(), pattern.clone(), pattern])
    } else {
        // Fallback на LIKE
        let pattern = format!("%{}%", search_trimmed);
        let condition = format!(
            "({}.name LIKE ? OR {}.formula LIKE ? OR {}.cas_number LIKE ? OR {}.manufacturer LIKE ? \
             OR EXISTS (SELECT 1 FROM batches bs WHERE bs.reagent_id = {}.id AND \
             (bs.batch_number LIKE ? OR bs.cat_number LIKE ? OR bs.supplier LIKE ?)))",
            table_alias, table_alias, table_alias, table_alias, table_alias
        );
        (condition, vec![
            pattern.clone(), pattern.clone(), pattern.clone(), pattern.clone(),
            pattern.clone(), pattern.clone(), pattern
        ])
    }
}

// ==================== REAGENT CRUD ====================

/// Получить список реагентов с пагинацией и агрегированным количеством
pub async fn get_reagents(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<PaginationQuery>,
) -> ApiResult<HttpResponse> {
    let (page, per_page, offset) = query.normalize();
    
    let fts_available = is_fts_available(&app_state.db_pool).await;
    debug!("FTS available: {}", fts_available);

    // Count query
    let mut count_sql = "SELECT COUNT(DISTINCT r.id) FROM reagents r WHERE 1=1".to_string();
    let mut count_params: Vec<String> = Vec::new();

    if let Some(ref search) = query.search {
        let (condition, params) = build_search_condition(search, fts_available, "r");
        if !condition.is_empty() {
            count_sql.push_str(" AND ");
            count_sql.push_str(&condition);
            count_params.extend(params);
        }
    }
    if let Some(ref status) = query.status {
        count_sql.push_str(" AND r.status = ?");
        count_params.push(status.clone());
    }

    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for param in &count_params {
        count_query = count_query.bind(param);
    }
    
    let total: i64 = count_query
        .fetch_one(&app_state.db_pool)
        .await?;

    // Main query с агрегацией
    let base_query = r#"
        SELECT 
            r.id, r.name, r.formula, r.cas_number, r.manufacturer,
            r.molecular_weight, r.physical_state, r.description, r.status,
            r.created_by, r.updated_by, r.created_at, r.updated_at,
            CAST(COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.quantity ELSE 0.0 END), 0.0) AS REAL) as total_quantity,
            CAST(COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.reserved_quantity ELSE 0.0 END), 0.0) AS REAL) as reserved_quantity,
            CAST(COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.quantity - b.reserved_quantity ELSE 0.0 END), 0.0) AS REAL) as available_quantity,
            COUNT(b.id) as batches_count,
            CASE 
                WHEN COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.quantity ELSE 0.0 END), 0.0) > 0 
                THEN CAST(ROUND(COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.quantity ELSE 0.0 END), 0.0), 2) AS TEXT) 
                     || ' ' || COALESCE((SELECT bu.unit FROM batches bu WHERE bu.reagent_id = r.id AND bu.status = 'available' LIMIT 1), '')
                ELSE 'No stock'
            END as total_display
        FROM reagents r
        LEFT JOIN batches b ON r.id = b.reagent_id
        WHERE 1=1
    "#;

    let mut sql = base_query.to_string();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(ref search) = query.search {
        let (condition, params) = build_search_condition(search, fts_available, "r");
        if !condition.is_empty() {
            sql.push_str(" AND ");
            sql.push_str(&condition);
            bind_values.extend(params);
            
            if fts_available {
                info!("Using FTS5 search for: {}", search);
            } else {
                debug!("Using LIKE fallback for: {}", search);
            }
        }
    }

    if let Some(ref status) = query.status {
        sql.push_str(" AND r.status = ?");
        bind_values.push(status.clone());
    }

    sql.push_str(" GROUP BY r.id ORDER BY r.created_at DESC LIMIT ? OFFSET ?");

    debug!("Executing SQL: {}", sql);

    let mut query_builder = sqlx::query_as::<_, ReagentListItem>(&sql);
    for value in bind_values {
        query_builder = query_builder.bind(value);
    }
    query_builder = query_builder.bind(per_page).bind(offset);

    let reagents: Vec<ReagentListItem> = query_builder
        .fetch_all(&app_state.db_pool)
        .await?;

    let total_pages = (total + per_page - 1) / per_page;

    Ok(HttpResponse::Ok().json(ApiResponse::success(PaginatedResponse {
        data: reagents,
        total,
        page,
        per_page,
        total_pages,
    })))
}

/// Получить реагент по ID с агрегацией остатков
pub async fn get_reagent_by_id(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    let reagent: Option<Reagent> = sqlx::query_as(
        "SELECT * FROM reagents WHERE id = ?"
    )
        .bind(&reagent_id)
        .fetch_optional(&app_state.db_pool)
        .await?;

    let reagent = match reagent {
        Some(r) => r,
        None => return Err(ApiError::not_found("Reagent")),
    };

    let aggregation: ReagentStockAggregation = sqlx::query_as(
        r#"SELECT 
            COALESCE(SUM(CASE WHEN status = 'available' THEN quantity ELSE 0 END), 0) as total_quantity,
            COALESCE(SUM(CASE WHEN status = 'available' THEN reserved_quantity ELSE 0 END), 0) as reserved_quantity,
            COALESCE(SUM(CASE WHEN status = 'available' THEN original_quantity ELSE 0 END), 0) as original_quantity,
            COUNT(*) as batches_count,
            SUM(CASE WHEN status = 'available' AND quantity > 0 THEN 1 ELSE 0 END) as available_batches,
            SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= datetime('now', '+30 days') AND expiry_date > datetime('now') AND status = 'available' THEN 1 ELSE 0 END) as expiring_soon_count,
            SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= datetime('now') THEN 1 ELSE 0 END) as expired_count,
            (SELECT unit FROM batches WHERE reagent_id = ? AND status = 'available' LIMIT 1) as primary_unit
           FROM batches 
           WHERE reagent_id = ?"#
    )
        .bind(&reagent_id)
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    let total_qty = aggregation.total_quantity.unwrap_or(0.0);
    let original_qty = aggregation.original_quantity.unwrap_or(0.0);
    let low_stock = if original_qty > 0.0 {
        (total_qty / original_qty) < 0.2
    } else {
        false
    };

    let response = ReagentWithStockResponse {
        id: reagent.id,
        name: reagent.name,
        formula: reagent.formula,
        cas_number: reagent.cas_number,
        manufacturer: reagent.manufacturer,
        molecular_weight: reagent.molecular_weight,
        physical_state: reagent.physical_state,
        description: reagent.description,
        status: reagent.status,
        created_by: reagent.created_by,
        updated_by: reagent.updated_by,
        created_at: reagent.created_at,
        updated_at: reagent.updated_at,
        total_quantity: total_qty,
        total_unit: aggregation.primary_unit.unwrap_or_else(|| "N/A".to_string()),
        batches_count: aggregation.batches_count,
        available_batches: aggregation.available_batches,
        reserved_quantity: aggregation.reserved_quantity.unwrap_or(0.0),
        low_stock,
        expiring_soon_count: aggregation.expiring_soon_count,
        expired_count: aggregation.expired_count,
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
}

/// Создать новый реагент
pub async fn create_reagent(
    app_state: web::Data<Arc<AppState>>,
    body: web::Json<CreateReagentRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    // Валидация
    body.validate()
        .map_err(|e| ApiError::bad_request(&format!("Validation failed: {}", e)))?;

    // Проверка CAS
    if let Some(ref cas) = body.cas_number {
        let cas_trimmed = cas.trim();
        if !cas_trimmed.is_empty() {
            FieldValidator::cas_number(cas_trimmed)
                .map_err(|e| ApiError::bad_request(&e))?;
        }
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO reagents (id, name, formula, cas_number, manufacturer, molecular_weight, physical_state, description, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        "#,
    )
        .bind(&id)
        .bind(&body.name)
        .bind(&body.formula)
        .bind(&body.cas_number)
        .bind(&body.manufacturer)
        .bind(&body.molecular_weight)
        .bind(&body.physical_state)
        .bind(&body.description)
        .bind(&user_id)
        .bind(&now)
        .bind(&now)
        .execute(&app_state.db_pool)
        .await?;

    // ✅ Обновляем FTS индекс
    let _ = sqlx::query(
        "INSERT INTO reagents_fts(rowid, name, formula, cas_number, manufacturer, description) \
         SELECT rowid, name, formula, cas_number, manufacturer, description FROM reagents WHERE id = ?"
    )
        .bind(&id)
        .execute(&app_state.db_pool)
        .await;

    let reagent: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&id)
        .fetch_one(&app_state.db_pool)
        .await?;

    info!("Created reagent: {} ({})", reagent.name, reagent.id);

    Ok(HttpResponse::Created().json(ApiResponse::success_with_message(
        reagent,
        "Reagent created successfully".to_string(),
    )))
}

/// Обновить реагент
pub async fn update_reagent(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    body: web::Json<UpdateReagentRequest>,
    user_id: String,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    // ✅ Валидация
    body.validate()
        .map_err(|e| {
            warn!("Validation failed for reagent update {}: {}", reagent_id, e);
            ApiError::bad_request(&format!("Validation failed: {}", e))
        })?;

    let existing: Option<Reagent> = sqlx::query_as(
        "SELECT * FROM reagents WHERE id = ?"
    )
        .bind(&reagent_id)
        .fetch_optional(&app_state.db_pool)
        .await?;

    if existing.is_none() {
        return Err(ApiError::not_found("Reagent"));
    }

    // Проверка CAS
    if let Some(ref cas) = body.cas_number {
        let cas_trimmed = cas.trim();
        if !cas_trimmed.is_empty() {
            FieldValidator::cas_number(cas_trimmed)
                .map_err(|e| ApiError::bad_request(&e))?;
        }
    }

    let mut updates = Vec::new();
    let mut values: Vec<String> = Vec::new();

    if let Some(name) = &body.name {
        updates.push("name = ?");
        values.push(name.clone());
    }
    if let Some(formula) = &body.formula {
        updates.push("formula = ?");
        values.push(formula.clone());
    }
    if let Some(cas) = &body.cas_number {
        updates.push("cas_number = ?");
        values.push(cas.clone());
    }
    if let Some(manufacturer) = &body.manufacturer {
        updates.push("manufacturer = ?");
        values.push(manufacturer.clone());
    }
    if let Some(physical_state) = &body.physical_state {
        updates.push("physical_state = ?");
        values.push(physical_state.clone());
    }
    if let Some(description) = &body.description {
        updates.push("description = ?");
        values.push(description.clone());
    }
    if let Some(status) = &body.status {
        let valid_statuses = ["active", "inactive", "discontinued"];
        if !valid_statuses.contains(&status.as_str()) {
            return Err(ApiError::bad_request(&format!(
                "Invalid status '{}'. Must be one of: {}",
                status,
                valid_statuses.join(", ")
            )));
        }
        updates.push("status = ?");
        values.push(status.clone());
    }

    if updates.is_empty() {
        return Err(ApiError::bad_request("No fields to update"));
    }

    updates.push("updated_by = ?");
    updates.push("updated_at = ?");
    values.push(user_id);
    values.push(Utc::now().to_rfc3339());

    let sql = format!(
        "UPDATE reagents SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut query = sqlx::query(&sql);
    for value in values {
        query = query.bind(value);
    }
    query = query.bind(&reagent_id);

    query.execute(&app_state.db_pool).await?;

    // ✅ Обновляем FTS индекс
    let _ = sqlx::query("DELETE FROM reagents_fts WHERE rowid = (SELECT rowid FROM reagents WHERE id = ?)")
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await;
    
    let _ = sqlx::query(
        "INSERT INTO reagents_fts(rowid, name, formula, cas_number, manufacturer, description) \
         SELECT rowid, name, formula, cas_number, manufacturer, description FROM reagents WHERE id = ?"
    )
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await;

    let updated: Reagent = sqlx::query_as("SELECT * FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    info!("Updated reagent: {} ({})", updated.name, updated.id);

    Ok(HttpResponse::Ok().json(ApiResponse::success(updated)))
}

/// Удалить реагент
pub async fn delete_reagent(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let reagent_id = path.into_inner();

    let batches: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM batches WHERE reagent_id = ?"
    )
        .bind(&reagent_id)
        .fetch_one(&app_state.db_pool)
        .await?;

    if batches.0 > 0 {
        return Err(ApiError::bad_request(&format!(
            "Cannot delete reagent with {} existing batches",
            batches.0
        )));
    }

    // ✅ Удаляем из FTS перед удалением реагента
    let _ = sqlx::query("DELETE FROM reagents_fts WHERE rowid = (SELECT rowid FROM reagents WHERE id = ?)")
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await;

    let result = sqlx::query("DELETE FROM reagents WHERE id = ?")
        .bind(&reagent_id)
        .execute(&app_state.db_pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Reagent"));
    }

    info!("Deleted reagent: {}", reagent_id);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Reagent deleted successfully".to_string(),
    )))
}

/// Поиск реагентов с поддержкой FTS
pub async fn search_reagents(
    app_state: web::Data<Arc<AppState>>,
    query: web::Query<SearchQuery>,
) -> ApiResult<HttpResponse> {
    let search_term = query.q.as_ref().map(|s| s.trim()).unwrap_or("");
    let limit = query.limit.unwrap_or(10).clamp(1, 50);

    if search_term.is_empty() {
        return Ok(HttpResponse::Ok().json(ApiResponse::success(Vec::<Reagent>::new())));
    }

    let fts_available = is_fts_available(&app_state.db_pool).await;

    let reagents: Vec<Reagent> = if fts_available {
        let fts_query = escape_fts_query(search_term)
            .split_whitespace()
            .map(|word| format!("{}*", word))
            .collect::<Vec<_>>()
            .join(" ");

        if fts_query.is_empty() {
            return Ok(HttpResponse::Ok().json(ApiResponse::success(Vec::<Reagent>::new())));
        }

        info!("FTS search query: {}", fts_query);

        // ✅ ИСПРАВЛЕНО: Используем rowid вместо id
        sqlx::query_as(
            r#"SELECT r.* FROM reagents r
               WHERE r.rowid IN (
                   SELECT rowid FROM reagents_fts WHERE reagents_fts MATCH ?
               )
               AND r.status = 'active'
               ORDER BY r.name
               LIMIT ?"#
        )
            .bind(&fts_query)
            .bind(limit)
            .fetch_all(&app_state.db_pool)
            .await?
    } else {
        let search_pattern = format!("%{}%", search_term);

        sqlx::query_as(
            r#"SELECT * FROM reagents
               WHERE (name LIKE ? OR formula LIKE ? OR cas_number LIKE ? OR manufacturer LIKE ?)
                 AND status = 'active'
               ORDER BY name
               LIMIT ?"#
        )
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(limit)
            .fetch_all(&app_state.db_pool)
            .await?
    };

    debug!("Search returned {} results", reagents.len());

    Ok(HttpResponse::Ok().json(ApiResponse::success(reagents)))
}

// ==================== REAGENT STOCK SUMMARY ====================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ReagentStockSummary {
    pub reagent_id: String,
    pub reagent_name: String,
    pub total_quantity: f64,
    pub unit: String,
    pub batches_count: i64,
    pub low_stock: bool,
    pub has_expiring: bool,
}

pub async fn get_reagents_stock_summary(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    let summary: Vec<ReagentStockSummary> = sqlx::query_as(
        r#"SELECT 
            r.id as reagent_id,
            r.name as reagent_name,
            COALESCE(SUM(CASE WHEN b.status = 'available' THEN b.quantity ELSE 0 END), 0) as total_quantity,
            COALESCE((SELECT bu.unit FROM batches bu WHERE bu.reagent_id = r.id LIMIT 1), 'N/A') as unit,
            COUNT(b.id) as batches_count,
            CASE 
                WHEN COALESCE(SUM(b.original_quantity), 0) > 0 
                     AND (COALESCE(SUM(b.quantity), 0) / COALESCE(SUM(b.original_quantity), 1)) < 0.2 
                THEN 1 ELSE 0 
            END as low_stock,
            CASE 
                WHEN SUM(CASE WHEN b.expiry_date <= datetime('now', '+30 days') AND b.status = 'available' THEN 1 ELSE 0 END) > 0 
                THEN 1 ELSE 0 
            END as has_expiring
           FROM reagents r
           LEFT JOIN batches b ON r.id = b.reagent_id
           WHERE r.status = 'active'
           GROUP BY r.id, r.name
           ORDER BY r.name"#
    )
        .fetch_all(&app_state.db_pool)
        .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(summary)))
}

/// Перестроить FTS индекс
pub async fn rebuild_fts_index(
    app_state: web::Data<Arc<AppState>>,
) -> ApiResult<HttpResponse> {
    info!("Rebuilding FTS index for reagents");

    // Очищаем FTS таблицу
    sqlx::query("DELETE FROM reagents_fts")
        .execute(&app_state.db_pool)
        .await?;

    // ✅ ИСПРАВЛЕНО: Заполняем БЕЗ колонки id (её нет в FTS таблице)
    let result = sqlx::query(
        r#"
        INSERT INTO reagents_fts(rowid, name, formula, cas_number, manufacturer, description)
        SELECT rowid, name, formula, cas_number, manufacturer, description
        FROM reagents
        "#,
    )
        .execute(&app_state.db_pool)
        .await?;

    info!("FTS index rebuilt with {} reagents", result.rows_affected());

    // Оптимизируем
    sqlx::query("INSERT INTO reagents_fts(reagents_fts) VALUES('optimize')")
        .execute(&app_state.db_pool)
        .await?;

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        result.rows_affected(),
        format!("FTS index rebuilt with {} reagents", result.rows_affected()),
    )))
}

// ==================== TYPES ====================

#[derive(Debug, serde::Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_fts_query() {
        assert_eq!(escape_fts_query("test"), "test");
        assert_eq!(escape_fts_query("sodium chloride"), "sodium chloride");
        assert_eq!(escape_fts_query("test*"), "test");
        assert_eq!(escape_fts_query("(test)"), "test");
        assert_eq!(escape_fts_query("a+b-c"), "abc");
    }

    #[test]
    fn test_build_search_condition_fts() {
        let (condition, params) = build_search_condition("sodium", true, "r");
        // Должен использовать rowid, НЕ id
        assert!(condition.contains("r.rowid IN"));
        assert!(condition.contains("SELECT rowid FROM reagents_fts"));
        // НЕ должен содержать reagents_fts.id
        assert!(!condition.contains("reagents_fts.id"));
        // Должен использовать алиас bs для батчей
        assert!(condition.contains("bs.reagent_id"));
        assert!(!params.is_empty());
    }

    #[test]
    fn test_build_search_condition_like() {
        let (condition, params) = build_search_condition("sodium", false, "r");
        assert!(condition.contains("r.name LIKE"));
        assert!(condition.contains("bs.reagent_id"));
        assert_eq!(params.len(), 7);
    }

    #[test]
    fn test_build_search_condition_empty() {
        let (condition, params) = build_search_condition("", true, "r");
        assert!(condition.is_empty());
        assert!(params.is_empty());
    }
}