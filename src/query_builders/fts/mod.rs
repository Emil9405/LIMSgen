// src/query_builders/fts/mod.rs
//! Full-Text Search построитель запросов
//! ✅ ИСПРАВЛЕНО: Правильная квалификация id в FTS запросах

pub mod config;

use sqlx::SqlitePool;

pub struct FtsQueryBuilder;

impl FtsQueryBuilder {
    /// Проверить доступность FTS таблицы для реагентов
    pub async fn check_fts_available(pool: &SqlitePool) -> bool {
        let result: Result<(i64,), _> = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reagents_fts'"
        ).fetch_one(pool).await;
        matches!(result, Ok((count,)) if count > 0)
    }

    /// Проверить доступность произвольной FTS таблицы
    pub async fn check_fts_table_available(pool: &SqlitePool, fts_table: &str) -> bool {
        let query = format!(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{}'",
            fts_table.replace('\'', "''") // Экранирование для безопасности
        );
        let result: Result<(i64,), _> = sqlx::query_as(&query).fetch_one(pool).await;
        matches!(result, Ok((count,)) if count > 0)
    }

    /// Построить FTS запрос с экранированием спецсимволов
    pub fn build_fts_query(search: &str) -> String {
        let cleaned = search
            .chars()
            .filter(|c| !matches!(c, '(' | ')' | '*' | '"' | ':' | '^' | '-' | '+' | '~' | '&' | '|'))
            .collect::<String>();
        
        cleaned
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|word| format!("{}*", word))
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Экранировать FTS запрос (алиас для build_fts_query)
    pub fn escape_fts_query(query: &str) -> String {
        Self::build_fts_query(query)
    }

    /// Построить условие поиска с FTS или LIKE fallback
    /// 
    /// # Arguments
    /// * `search` - Строка поиска
    /// * `use_fts` - Использовать FTS (true) или LIKE fallback (false)
    /// * `fts_table` - Имя FTS таблицы (например "reagents_fts")
    /// * `like_fields` - Поля для LIKE поиска (например ["name", "formula"])
    /// * `table_alias` - Алиас основной таблицы (например "r")
    /// 
    /// # Returns
    /// (SQL условие, Vec параметров для биндинга)
    pub fn build_search_condition(
        search: &str,
        use_fts: bool,
        fts_table: &str,
        like_fields: &[&str],
        table_alias: &str,
    ) -> (String, Vec<String>) {
        let search_trimmed = search.trim();
        if search_trimmed.is_empty() {
            return (String::new(), Vec::new());
        }

        if use_fts {
            let fts_query = Self::build_fts_query(search_trimmed);
            if fts_query.is_empty() {
                return (String::new(), Vec::new());
            }
            
            // ✅ ИСПРАВЛЕНО: Явно указываем fts_table.id для избежания ambiguous column
            let condition = format!(
                "{}.id IN (SELECT {}.id FROM {} WHERE {} MATCH ?)",
                table_alias, fts_table, fts_table, fts_table
            );
            (condition, vec![fts_query])
        } else {
            let pattern = format!("%{}%", search_trimmed);
            
            if like_fields.is_empty() {
                return (String::new(), Vec::new());
            }
            
            let conditions: Vec<String> = like_fields
                .iter()
                .map(|f| format!("{}.{} LIKE ?", table_alias, f))
                .collect();
            
            let params: Vec<String> = like_fields
                .iter()
                .map(|_| pattern.clone())
                .collect();
            
            (format!("({})", conditions.join(" OR ")), params)
        }
    }

    /// Построить условие поиска для реагентов (с поиском по батчам)
    /// ✅ Использует алиас `bs` для подзапроса батчей чтобы избежать конфликта
    pub fn build_reagent_search_condition(
        search: &str,
        use_fts: bool,
        table_alias: &str,
    ) -> (String, Vec<String>) {
        let search_trimmed = search.trim();
        if search_trimmed.is_empty() {
            return (String::new(), Vec::new());
        }

        let pattern = format!("%{}%", search_trimmed);

        if use_fts {
            let fts_query = Self::build_fts_query(search_trimmed);
            if fts_query.is_empty() {
                return (String::new(), Vec::new());
            }
            
            // ✅ ИСПРАВЛЕНО: 
            // - Используем reagents_fts.id явно
            // - Используем алиас `bs` (batch_search) вместо `b` для подзапроса
            let condition = format!(
                "({}.id IN (SELECT reagents_fts.id FROM reagents_fts WHERE reagents_fts MATCH ?) \
                 OR EXISTS (SELECT 1 FROM batches bs WHERE bs.reagent_id = {}.id AND \
                 (bs.batch_number LIKE ? OR bs.cat_number LIKE ? OR bs.supplier LIKE ?)))",
                table_alias, table_alias
            );
            
            (condition, vec![fts_query, pattern.clone(), pattern.clone(), pattern])
        } else {
            // ✅ ИСПРАВЛЕНО: Используем алиас `bs` для подзапроса батчей
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
}

/// Экранировать FTS запрос (публичная функция для обратной совместимости)
pub fn escape_fts_query(query: &str) -> String {
    FtsQueryBuilder::build_fts_query(query)
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_fts_query() {
        assert_eq!(FtsQueryBuilder::build_fts_query("test"), "test*");
        assert_eq!(FtsQueryBuilder::build_fts_query("sodium chloride"), "sodium* chloride*");
        assert_eq!(FtsQueryBuilder::build_fts_query("test*"), "test*");
        assert_eq!(FtsQueryBuilder::build_fts_query("(test)"), "test*");
        assert_eq!(FtsQueryBuilder::build_fts_query("a+b-c"), "abc*");
        assert_eq!(FtsQueryBuilder::build_fts_query(""), "");
        assert_eq!(FtsQueryBuilder::build_fts_query("   "), "");
    }

    #[test]
    fn test_build_search_condition_fts() {
        let (condition, params) = FtsQueryBuilder::build_search_condition(
            "sodium",
            true,
            "reagents_fts",
            &["name", "formula"],
            "r"
        );
        
        assert!(condition.contains("reagents_fts.id"));
        assert!(condition.contains("r.id IN"));
        assert_eq!(params.len(), 1);
        assert_eq!(params[0], "sodium*");
    }

    #[test]
    fn test_build_search_condition_like() {
        let (condition, params) = FtsQueryBuilder::build_search_condition(
            "sodium",
            false,
            "reagents_fts",
            &["name", "formula", "cas_number"],
            "r"
        );
        
        assert!(condition.contains("r.name LIKE"));
        assert!(condition.contains("r.formula LIKE"));
        assert!(condition.contains("r.cas_number LIKE"));
        assert_eq!(params.len(), 3);
    }

    #[test]
    fn test_build_search_condition_empty() {
        let (condition, params) = FtsQueryBuilder::build_search_condition(
            "",
            true,
            "reagents_fts",
            &["name"],
            "r"
        );
        assert!(condition.is_empty());
        assert!(params.is_empty());

        let (condition2, params2) = FtsQueryBuilder::build_search_condition(
            "   ",
            false,
            "reagents_fts",
            &["name"],
            "r"
        );
        assert!(condition2.is_empty());
        assert!(params2.is_empty());
    }

    #[test]
    fn test_build_reagent_search_condition_fts() {
        let (condition, params) = FtsQueryBuilder::build_reagent_search_condition(
            "sodium",
            true,
            "r"
        );
        
        // Должен использовать reagents_fts.id
        assert!(condition.contains("reagents_fts.id"));
        // Должен использовать алиас bs для батчей, НЕ b
        assert!(condition.contains("bs.reagent_id"));
        assert!(condition.contains("bs.batch_number"));
        // НЕ должен содержать "FROM batches b " (с пробелом после b)
        assert!(!condition.contains("FROM batches b "));
        
        assert_eq!(params.len(), 4); // fts_query + 3 LIKE patterns
    }

    #[test]
    fn test_build_reagent_search_condition_like() {
        let (condition, params) = FtsQueryBuilder::build_reagent_search_condition(
            "sodium",
            false,
            "r"
        );
        
        // Должен использовать алиас bs для батчей
        assert!(condition.contains("bs.reagent_id"));
        assert!(condition.contains("r.name LIKE"));
        assert!(condition.contains("r.formula LIKE"));
        
        assert_eq!(params.len(), 7); // 4 поля реагента + 3 поля батча
    }

    #[test]
    fn test_escape_fts_query() {
        assert_eq!(escape_fts_query("hello world"), "hello* world*");
        assert_eq!(escape_fts_query("H2O"), "H2O*");
        assert_eq!(escape_fts_query("test(1)"), "test1*");
    }
}