// src/query_builders/fts/config.rs
//! Конфигурация FTS5 для разных таблиц

/// Конфигурация полнотекстового поиска
#[derive(Debug, Clone)]
pub struct FtsConfig {
    /// Имя FTS-таблицы
    pub fts_table: &'static str,
    /// Имя основной таблицы
    pub main_table: &'static str,
    /// Поле ID для JOIN
    pub id_field: &'static str,
    /// Поля для поиска (в LIKE fallback)
    pub search_fields: Vec<&'static str>,
}

impl Default for FtsConfig {
    fn default() -> Self {
        Self::for_reagents()
    }
}

impl FtsConfig {
    /// Конфигурация для реагентов
    pub fn for_reagents() -> Self {
        Self {
            fts_table: "reagents_fts",
            main_table: "reagents",
            id_field: "id",
            search_fields: vec!["name", "formula", "cas_number", "manufacturer", "description"],
        }
    }

    /// Конфигурация для экспериментов
    pub fn for_experiments() -> Self {
        Self {
            fts_table: "experiments_fts",
            main_table: "experiments",
            id_field: "id",
            search_fields: vec!["title", "description", "protocol", "notes"],
        }
    }

    /// Конфигурация для оборудования
    pub fn for_equipment() -> Self {
        Self {
            fts_table: "equipment_fts",
            main_table: "equipment",
            id_field: "id",
            search_fields: vec!["name", "model", "serial_number", "manufacturer", "description", "location"],
        }
    }

    /// Конфигурация для запчастей оборудования
    pub fn for_equipment_parts() -> Self {
        Self {
            fts_table: "equipment_parts_fts",
            main_table: "equipment_parts",
            id_field: "id",
            search_fields: vec!["name", "part_number", "description", "notes"],
        }
    }

    /// Кастомная конфигурация
    pub fn custom(
        fts_table: &'static str,
        main_table: &'static str,
        id_field: &'static str,
        search_fields: Vec<&'static str>,
    ) -> Self {
        Self { fts_table, main_table, id_field, search_fields }
    }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fts_config_for_reagents() {
        let config = FtsConfig::for_reagents();
        assert_eq!(config.fts_table, "reagents_fts");
        assert_eq!(config.main_table, "reagents");
        assert!(config.search_fields.contains(&"name"));
        assert!(config.search_fields.contains(&"formula"));
    }

    #[test]
    fn test_fts_config_custom() {
        let config = FtsConfig::custom(
            "custom_fts",
            "custom_table",
            "custom_id",
            vec!["field1", "field2"],
        );
        assert_eq!(config.fts_table, "custom_fts");
        assert_eq!(config.main_table, "custom_table");
    }
}
