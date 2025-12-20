// src/query_builders/filters/value.rs
//! Типы значений фильтра для безопасного биндинга в sqlx

use serde::{Serialize, Deserialize};

/// Значение фильтра - типобезопасный контейнер для биндинга
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    StringArray(Vec<String>),
    IntegerArray(Vec<i64>),
    FloatArray(Vec<f64>),
    StringRange { from: String, to: String },
    IntegerRange { from: i64, to: i64 },
    FloatRange { from: f64, to: f64 },
    Null,
}

impl FilterValue {
    // Конструкторы
    #[inline] pub fn string(s: impl Into<String>) -> Self { FilterValue::String(s.into()) }
    #[inline] pub fn integer(n: i64) -> Self { FilterValue::Integer(n) }
    #[inline] pub fn float(n: f64) -> Self { FilterValue::Float(n) }
    #[inline] pub fn boolean(b: bool) -> Self { FilterValue::Boolean(b) }
    #[inline] pub fn null() -> Self { FilterValue::Null }
    
    #[inline] pub fn string_array(arr: Vec<String>) -> Self { FilterValue::StringArray(arr) }
    #[inline] pub fn integer_array(arr: Vec<i64>) -> Self { FilterValue::IntegerArray(arr) }
    #[inline] pub fn float_array(arr: Vec<f64>) -> Self { FilterValue::FloatArray(arr) }
    
    #[inline] 
    pub fn string_range(from: impl Into<String>, to: impl Into<String>) -> Self {
        FilterValue::StringRange { from: from.into(), to: to.into() }
    }
    #[inline] pub fn integer_range(from: i64, to: i64) -> Self { FilterValue::IntegerRange { from, to } }
    #[inline] pub fn float_range(from: f64, to: f64) -> Self { FilterValue::FloatRange { from, to } }

    // Проверки типа
    #[inline]
    pub fn is_array(&self) -> bool {
        matches!(self, FilterValue::StringArray(_) | FilterValue::IntegerArray(_) | FilterValue::FloatArray(_))
    }

    #[inline]
    pub fn is_range(&self) -> bool {
        matches!(self, FilterValue::StringRange { .. } | FilterValue::IntegerRange { .. } | FilterValue::FloatRange { .. })
    }

    #[inline]
    pub fn is_null(&self) -> bool {
        matches!(self, FilterValue::Null)
    }

    /// Длина массива (если это массив)
    pub fn array_len(&self) -> Option<usize> {
        match self {
            FilterValue::StringArray(arr) => Some(arr.len()),
            FilterValue::IntegerArray(arr) => Some(arr.len()),
            FilterValue::FloatArray(arr) => Some(arr.len()),
            _ => None,
        }
    }

    /// Конвертация в строку для простых типов (для параметризованных запросов)
    pub fn to_string_value(&self) -> Result<String, &'static str> {
        match self {
            FilterValue::String(s) => Ok(s.clone()),
            FilterValue::Integer(n) => Ok(n.to_string()),
            FilterValue::Float(n) => Ok(n.to_string()),
            FilterValue::Boolean(b) => Ok(if *b { "1" } else { "0" }.to_string()),
            FilterValue::Null => Ok(String::new()),
            _ => Err("Cannot convert array/range to single string value"),
        }
    }

    /// Получение значений массива как Vec<String>
    pub fn as_string_array(&self) -> Result<Vec<String>, &'static str> {
        match self {
            FilterValue::StringArray(arr) => Ok(arr.clone()),
            FilterValue::IntegerArray(arr) => Ok(arr.iter().map(|n| n.to_string()).collect()),
            FilterValue::FloatArray(arr) => Ok(arr.iter().map(|n| n.to_string()).collect()),
            _ => Err("Value is not an array"),
        }
    }

    /// Получение значений диапазона как (String, String)
    pub fn as_range_strings(&self) -> Result<(String, String), &'static str> {
        match self {
            FilterValue::StringRange { from, to } => Ok((from.clone(), to.clone())),
            FilterValue::IntegerRange { from, to } => Ok((from.to_string(), to.to_string())),
            FilterValue::FloatRange { from, to } => Ok((from.to_string(), to.to_string())),
            _ => Err("Value is not a range"),
        }
    }
}

// ==================== FROM IMPLEMENTATIONS ====================

impl From<String> for FilterValue {
    fn from(s: String) -> Self { FilterValue::String(s) }
}

impl From<&str> for FilterValue {
    fn from(s: &str) -> Self { FilterValue::String(s.to_string()) }
}

impl From<i64> for FilterValue {
    fn from(n: i64) -> Self { FilterValue::Integer(n) }
}

impl From<i32> for FilterValue {
    fn from(n: i32) -> Self { FilterValue::Integer(n as i64) }
}

impl From<f64> for FilterValue {
    fn from(n: f64) -> Self { FilterValue::Float(n) }
}

impl From<f32> for FilterValue {
    fn from(n: f32) -> Self { FilterValue::Float(n as f64) }
}

impl From<bool> for FilterValue {
    fn from(b: bool) -> Self { FilterValue::Boolean(b) }
}

impl From<Vec<String>> for FilterValue {
    fn from(arr: Vec<String>) -> Self { FilterValue::StringArray(arr) }
}

impl From<Vec<i64>> for FilterValue {
    fn from(arr: Vec<i64>) -> Self { FilterValue::IntegerArray(arr) }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_value_types() {
        let str_val = FilterValue::string("test");
        let int_val = FilterValue::integer(42);
        let float_val = FilterValue::float(3.14);
        let bool_val = FilterValue::boolean(true);
        let range_val = FilterValue::float_range(1.0, 10.0);
        let arr_val = FilterValue::string_array(vec!["a".to_string(), "b".to_string()]);

        assert!(!str_val.is_array());
        assert!(!int_val.is_array());
        assert!(!float_val.is_array());
        assert!(!bool_val.is_array());
        assert!(range_val.is_range());
        assert!(arr_val.is_array());
        assert_eq!(arr_val.array_len(), Some(2));
    }

    #[test]
    fn test_to_string_value() {
        assert_eq!(FilterValue::string("test").to_string_value().unwrap(), "test");
        assert_eq!(FilterValue::integer(42).to_string_value().unwrap(), "42");
        assert_eq!(FilterValue::float(3.14).to_string_value().unwrap(), "3.14");
        assert_eq!(FilterValue::boolean(true).to_string_value().unwrap(), "1");
        assert_eq!(FilterValue::boolean(false).to_string_value().unwrap(), "0");
    }

    #[test]
    fn test_as_string_array() {
        let arr = FilterValue::integer_array(vec![1, 2, 3]);
        let result = arr.as_string_array().unwrap();
        assert_eq!(result, vec!["1", "2", "3"]);
    }

    #[test]
    fn test_as_range_strings() {
        let range = FilterValue::integer_range(10, 20);
        let (from, to) = range.as_range_strings().unwrap();
        assert_eq!(from, "10");
        assert_eq!(to, "20");
    }

    #[test]
    fn test_from_implementations() {
        let _: FilterValue = "test".into();
        let _: FilterValue = String::from("test").into();
        let _: FilterValue = 42i64.into();
        let _: FilterValue = 42i32.into();
        let _: FilterValue = 3.14f64.into();
        let _: FilterValue = true.into();
    }
}
