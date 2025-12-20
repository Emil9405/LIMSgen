// src/query_builders/sql/count.rs
//! Построитель COUNT-запросов

use crate::query_builders::filters::FieldWhitelist;
use crate::query_builders::sql::SafeQueryBuilder;

/// Специализированный построитель COUNT-запросов
/// 
/// Обёртка над SafeQueryBuilder с упрощённым API для подсчёта
pub struct CountQueryBuilder<'a> {
    inner: SafeQueryBuilder<'a>,
}

impl<'a> CountQueryBuilder<'a> {
    /// Создание нового построителя
    pub fn new_safe(table: &'a str) -> Result<Self, String> {
        Ok(Self {
            inner: SafeQueryBuilder::new(table)?
        })
    }

    /// Установка whitelist
    pub fn with_whitelist(mut self, whitelist: &'a FieldWhitelist) -> Self {
        self.inner = self.inner.with_whitelist(whitelist);
        self
    }

    /// Точное совпадение
    pub fn add_exact_match(&mut self, field: &str, value: impl Into<String>) -> &mut Self {
        self.inner.add_exact_match(field, value);
        self
    }

    /// Сравнение
    pub fn add_comparison(&mut self, field: &str, operator: &str, value: impl ToString) -> &mut Self {
        self.inner.add_comparison(field, operator, value);
        self
    }

    /// LIKE поиск
    pub fn add_like(&mut self, field: &str, pattern: impl Into<String>) -> &mut Self {
        self.inner.add_like(field, pattern);
        self
    }

    /// IS NULL
    pub fn add_is_null(&mut self, field: &str) -> &mut Self {
        self.inner.add_is_null(field);
        self
    }

    /// IS NOT NULL
    pub fn add_is_not_null(&mut self, field: &str) -> &mut Self {
        self.inner.add_is_not_null(field);
        self
    }

    /// IN clause
    pub fn add_in_clause(&mut self, field: &str, values: &[impl ToString]) -> &mut Self {
        self.inner.add_in_clause(field, values);
        self
    }

    /// BETWEEN
    pub fn add_between(&mut self, field: &str, from: impl ToString, to: impl ToString) -> &mut Self {
        self.inner.add_between(field, from, to);
        self
    }

    /// Добавление сырого условия
    pub fn add_raw_condition(&mut self, condition: &str, params: Vec<String>) -> &mut Self {
        self.inner.add_raw_condition(condition, params);
        self
    }

    /// SQL-запрос
    pub fn sql(&self) -> String {
        self.inner.build_count().0
    }

    /// Параметры запроса
    pub fn params(&self) -> Vec<String> {
        self.inner.build_count().1
    }

    /// Построение запроса (SQL + параметры)
    pub fn build(&self) -> (String, Vec<String>) {
        self.inner.build_count()
    }

    /// Проверка наличия условий
    pub fn has_conditions(&self) -> bool {
        self.inner.has_conditions()
    }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_query_builder_basic() {
        let mut builder = CountQueryBuilder::new_safe("experiments").unwrap();
        builder.add_exact_match("status", "active");
        
        let sql = builder.sql();
        assert!(sql.contains("SELECT COUNT(*)"));
        assert!(sql.contains("FROM experiments"));
        assert!(sql.contains("status = ?"));
    }

    #[test]
    fn test_count_query_builder_multiple_conditions() {
        let mut builder = CountQueryBuilder::new_safe("batches").unwrap();
        builder
            .add_exact_match("status", "available")
            .add_comparison("quantity", ">", 0);
        
        let (sql, params) = builder.build();
        assert!(sql.contains("AND"));
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn test_count_query_builder_with_whitelist() {
        let whitelist = FieldWhitelist::for_batches();
        let mut builder = CountQueryBuilder::new_safe("batches").unwrap()
            .with_whitelist(&whitelist);
        
        builder.add_exact_match("quantity", "10");
        builder.add_exact_match("password", "secret"); // Не в whitelist
        
        let params = builder.params();
        assert_eq!(params.len(), 1); // password отфильтрован
    }

    #[test]
    fn test_count_query_builder_no_conditions() {
        let builder = CountQueryBuilder::new_safe("experiments").unwrap();
        
        let sql = builder.sql();
        assert!(sql.contains("SELECT COUNT(*) as count FROM experiments"));
        assert!(!sql.contains("WHERE"));
    }
}
