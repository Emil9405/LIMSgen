// src/query_builders/sql/select.rs
//! Безопасный построитель SELECT-запросов

use std::borrow::Cow;
use crate::query_builders::filters::FieldWhitelist;
use crate::query_builders::utils::{
    escape_like_value, is_safe_field_name, is_safe_table_name, normalize_sort_order,
};

/// Безопасный построитель SELECT-запросов
/// 
/// Все значения передаются через параметры (?),
/// имена таблиц и колонок валидируются через whitelist
pub struct SafeQueryBuilder<'a> {
    table: Cow<'a, str>,
    whitelist: Option<&'a FieldWhitelist>,
    conditions: Vec<String>,
    params: Vec<String>,
    order_by: Option<(String, &'static str)>,
    limit: Option<u32>,
    offset: Option<u32>,
}

impl<'a> SafeQueryBuilder<'a> {
    /// Создание нового построителя
    /// 
    /// Возвращает ошибку если имя таблицы невалидно
    pub fn new(table: impl Into<Cow<'a, str>>) -> Result<Self, String> {
        let table = table.into();
        if !is_safe_table_name(&table) {
            return Err(format!("Invalid table name: '{}'", table));
        }
        Ok(Self {
            table,
            whitelist: None,
            conditions: Vec::new(),
            params: Vec::new(),
            order_by: None,
            limit: None,
            offset: None,
        })
    }

    /// Установка whitelist для валидации полей
    pub fn with_whitelist(mut self, whitelist: &'a FieldWhitelist) -> Self {
        self.whitelist = Some(whitelist);
        self
    }

    // ==================== ДОБАВЛЕНИЕ УСЛОВИЙ ====================

    /// Точное совпадение: field = ?
    pub fn add_exact_match(&mut self, field: &str, value: impl Into<String>) -> &mut Self {
        if self.is_field_allowed(field) {
            self.conditions.push(format!("{} = ?", field));
            self.params.push(value.into());
        }
        self
    }

    /// LIKE поиск: field LIKE %value%
    pub fn add_like(&mut self, field: &str, pattern: impl Into<String>) -> &mut Self {
        if self.is_field_allowed(field) {
            let escaped = escape_like_value(&pattern.into());
            self.conditions.push(format!("{} LIKE ?", field));
            self.params.push(format!("%{}%", escaped));
        }
        self
    }

    /// LIKE поиск с началом: field LIKE value%
    pub fn add_starts_with(&mut self, field: &str, prefix: impl Into<String>) -> &mut Self {
        if self.is_field_allowed(field) {
            let escaped = escape_like_value(&prefix.into());
            self.conditions.push(format!("{} LIKE ?", field));
            self.params.push(format!("{}%", escaped));
        }
        self
    }

    /// Сравнение: field op value
    pub fn add_comparison(&mut self, field: &str, operator: &str, value: impl ToString) -> &mut Self {
        if self.is_field_allowed(field) && is_valid_comparison_operator(operator) {
            self.conditions.push(format!("{} {} ?", field, operator));
            self.params.push(value.to_string());
        }
        self
    }

    /// IS NULL
    pub fn add_is_null(&mut self, field: &str) -> &mut Self {
        if self.is_field_allowed(field) {
            self.conditions.push(format!("{} IS NULL", field));
        }
        self
    }

    /// IS NOT NULL
    pub fn add_is_not_null(&mut self, field: &str) -> &mut Self {
        if self.is_field_allowed(field) {
            self.conditions.push(format!("{} IS NOT NULL", field));
        }
        self
    }

    /// IN clause: field IN (?, ?, ...)
    pub fn add_in_clause(&mut self, field: &str, values: &[impl ToString]) -> &mut Self {
        if self.is_field_allowed(field) && !values.is_empty() {
            let placeholders: Vec<&str> = (0..values.len()).map(|_| "?").collect();
            self.conditions.push(format!("{} IN ({})", field, placeholders.join(", ")));
            self.params.extend(values.iter().map(|v| v.to_string()));
        }
        self
    }

    /// NOT IN clause
    pub fn add_not_in_clause(&mut self, field: &str, values: &[impl ToString]) -> &mut Self {
        if self.is_field_allowed(field) && !values.is_empty() {
            let placeholders: Vec<&str> = (0..values.len()).map(|_| "?").collect();
            self.conditions.push(format!("{} NOT IN ({})", field, placeholders.join(", ")));
            self.params.extend(values.iter().map(|v| v.to_string()));
        }
        self
    }

    /// BETWEEN: field BETWEEN ? AND ?
    pub fn add_between(&mut self, field: &str, from: impl ToString, to: impl ToString) -> &mut Self {
        if self.is_field_allowed(field) {
            self.conditions.push(format!("{} BETWEEN ? AND ?", field));
            self.params.push(from.to_string());
            self.params.push(to.to_string());
        }
        self
    }

    /// Добавление сырого условия (для уже валидированных условий)
    /// 
    /// ВНИМАНИЕ: использовать только для условий, которые уже проверены!
    pub fn add_raw_condition(&mut self, condition: &str, params: Vec<String>) -> &mut Self {
        self.conditions.push(condition.to_string());
        self.params.extend(params);
        self
    }

    // ==================== СОРТИРОВКА И ПАГИНАЦИЯ ====================

    /// ORDER BY (поле валидируется через whitelist)
    pub fn order_by(&mut self, field: &str, order: &str) -> &mut Self {
        if self.is_field_allowed(field) {
            self.order_by = Some((field.to_string(), normalize_sort_order(order)));
        }
        self
    }

    /// LIMIT
    pub fn limit(&mut self, limit: u32) -> &mut Self {
        self.limit = Some(limit);
        self
    }

    /// OFFSET
    pub fn offset(&mut self, offset: u32) -> &mut Self {
        self.offset = Some(offset);
        self
    }

    /// Пагинация из page/per_page
    pub fn paginate(&mut self, page: i64, per_page: i64) -> &mut Self {
        let page = page.max(1);
        let per_page = per_page.clamp(1, 100);
        self.limit = Some(per_page as u32);
        self.offset = Some(((page - 1) * per_page) as u32);
        self
    }

    // ==================== ПОСТРОЕНИЕ ЗАПРОСА ====================

    /// Построение SELECT-запроса
    pub fn build_select(&self, fields: &str) -> (String, Vec<String>) {
        let mut sql = format!("SELECT {} FROM {}", fields, self.table);
        
        if !self.conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&self.conditions.join(" AND "));
        }
        
        if let Some((ref field, order)) = self.order_by {
            sql.push_str(&format!(" ORDER BY {} {}", field, order));
        }
        
        if let Some(limit) = self.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        
        if let Some(offset) = self.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
        
        (sql, self.params.clone())
    }

    /// Построение COUNT-запроса
    pub fn build_count(&self) -> (String, Vec<String>) {
        let mut sql = format!("SELECT COUNT(*) as count FROM {}", self.table);
        
        if !self.conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&self.conditions.join(" AND "));
        }
        
        (sql, self.params.clone())
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

    #[inline]
    fn is_field_allowed(&self, field: &str) -> bool {
        if let Some(wl) = self.whitelist {
            wl.is_allowed(field)
        } else {
            is_safe_field_name(field)
        }
    }

    /// Получение текущих условий
    pub fn conditions(&self) -> &[String] {
        &self.conditions
    }

    /// Получение текущих параметров
    pub fn params(&self) -> &[String] {
        &self.params
    }

    /// Проверка наличия условий
    pub fn has_conditions(&self) -> bool {
        !self.conditions.is_empty()
    }

    /// Очистка условий
    pub fn clear_conditions(&mut self) -> &mut Self {
        self.conditions.clear();
        self.params.clear();
        self
    }
}

/// Проверка валидности оператора сравнения
#[inline]
fn is_valid_comparison_operator(op: &str) -> bool {
    matches!(op, "=" | "!=" | "<>" | ">" | ">=" | "<" | "<=")
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_query_builder_basic() {
        let mut builder = SafeQueryBuilder::new("experiments").unwrap();
        builder
            .add_exact_match("status", "active")
            .add_comparison("id", ">", 10);
        
        let (sql, params) = builder.build_select("*");
        assert!(sql.contains("SELECT * FROM experiments"));
        assert!(sql.contains("status = ?"));
        assert!(sql.contains("id > ?"));
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn test_safe_query_builder_with_whitelist() {
        let whitelist = FieldWhitelist::for_batches();
        let mut builder = SafeQueryBuilder::new("batches").unwrap()
            .with_whitelist(&whitelist);
        
        builder.add_exact_match("status", "active");
        builder.add_exact_match("password", "secret"); // Не в whitelist
        
        let (sql, params) = builder.build_select("*");
        assert!(sql.contains("status = ?"));
        assert!(!sql.contains("password")); // Отфильтровано
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn test_safe_query_builder_like() {
        let mut builder = SafeQueryBuilder::new("reagents").unwrap();
        builder.add_like("name", "sodium%test");
        
        let (_, params) = builder.build_select("*");
        // % должен быть экранирован внутри, но обёрнут снаружи
        assert!(params[0].contains("\\%"));
    }

    #[test]
    fn test_safe_query_builder_in_clause() {
        let mut builder = SafeQueryBuilder::new("experiments").unwrap();
        builder.add_in_clause("status", &["active", "scheduled", "completed"]);
        
        let (sql, params) = builder.build_select("*");
        assert!(sql.contains("IN (?, ?, ?)"));
        assert_eq!(params.len(), 3);
    }

    #[test]
    fn test_safe_query_builder_pagination() {
        let mut builder = SafeQueryBuilder::new("experiments").unwrap();
        builder.paginate(3, 20);
        
        let (sql, _) = builder.build_select("*");
        assert!(sql.contains("LIMIT 20"));
        assert!(sql.contains("OFFSET 40")); // (3-1) * 20
    }

    #[test]
    fn test_safe_query_builder_order_by() {
        let mut builder = SafeQueryBuilder::new("experiments").unwrap();
        builder.order_by("created_at", "desc");
        
        let (sql, _) = builder.build_select("*");
        assert!(sql.contains("ORDER BY created_at DESC"));
    }

    #[test]
    fn test_safe_query_builder_count() {
        let mut builder = SafeQueryBuilder::new("experiments").unwrap();
        builder.add_exact_match("status", "active");
        
        let (sql, _) = builder.build_count();
        assert!(sql.contains("SELECT COUNT(*)"));
        assert!(sql.contains("WHERE"));
        assert!(!sql.contains("LIMIT")); // COUNT не имеет LIMIT
    }

    #[test]
    fn test_invalid_table_name() {
        let result = SafeQueryBuilder::new("DROP TABLE users; --");
        assert!(result.is_err());
    }
}
