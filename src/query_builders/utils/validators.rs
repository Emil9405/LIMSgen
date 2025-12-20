// src/query_builders/utils/validators.rs
//! Бизнес-валидаторы для экспериментов и обслуживания оборудования

use chrono::{DateTime, Utc};

// ==================== ВАЛИДАТОР ЭКСПЕРИМЕНТОВ ====================

pub struct ExperimentValidator;

impl ExperimentValidator {
    /// Валидация образовательного эксперимента (учебного занятия)
    pub fn validate_educational_experiment(
        start: Option<&DateTime<Utc>>,
        end: Option<&DateTime<Utc>>,
    ) -> Result<(), String> {
        let start = start.ok_or("Start time is required for educational experiments")?;
        let end = end.ok_or("End time is required for educational experiments")?;
        
        if end <= start {
            return Err("End time must be after start time".to_string());
        }
        
        let duration = (*end - *start).num_minutes();
        
        if duration < 15 {
            return Err("Educational experiment must be at least 15 minutes".to_string());
        }
        
        if duration > 480 {
            return Err("Educational experiment cannot exceed 8 hours".to_string());
        }
        
        Ok(())
    }

    /// Валидация заголовка эксперимента
    pub fn validate_title(title: &str) -> Result<(), String> {
        if title.trim().is_empty() {
            return Err("Title cannot be empty".to_string());
        }
        if title.len() > 200 {
            return Err("Title cannot exceed 200 characters".to_string());
        }
        Ok(())
    }

    /// Валидация описания эксперимента
    pub fn validate_description(description: &str, max_length: usize) -> Result<(), String> {
        if description.len() > max_length {
            return Err(format!("Description cannot exceed {} characters", max_length));
        }
        Ok(())
    }

    /// Проверка, находится ли эксперимент в допустимом временном окне
    pub fn is_within_time_window(
        experiment_date: &DateTime<Utc>,
        window_start: &DateTime<Utc>,
        window_end: &DateTime<Utc>,
    ) -> bool {
        experiment_date >= window_start && experiment_date <= window_end
    }
}

// ==================== ВАЛИДАТОР ОБСЛУЖИВАНИЯ ====================

pub struct MaintenanceValidator;

impl MaintenanceValidator {
    /// Проверка необходимости обслуживания
    pub fn needs_maintenance(
        last_maintenance: Option<&DateTime<Utc>>,
        next_maintenance: Option<&DateTime<Utc>>,
        interval_days: Option<i32>,
    ) -> bool {
        let now = Utc::now();
        
        // Если указана дата следующего обслуживания и она прошла
        if let Some(next) = next_maintenance {
            if *next <= now {
                return true;
            }
        }
        
        // Если указана дата последнего обслуживания и интервал
        if let (Some(last), Some(interval)) = (last_maintenance, interval_days) {
            let next_due = *last + chrono::Duration::days(interval as i64);
            if next_due <= now {
                return true;
            }
        }
        
        false
    }

    /// Расчёт даты следующего обслуживания
    pub fn next_maintenance_date(
        last_maintenance: Option<&DateTime<Utc>>,
        interval_days: Option<i32>,
    ) -> Option<DateTime<Utc>> {
        match (last_maintenance, interval_days) {
            (Some(last), Some(interval)) => {
                Some(*last + chrono::Duration::days(interval as i64))
            }
            _ => None,
        }
    }

    /// Количество дней до следующего обслуживания
    pub fn days_until_maintenance(next_maintenance: Option<&DateTime<Utc>>) -> Option<i64> {
        next_maintenance.map(|next| (*next - Utc::now()).num_days())
    }

    /// Проверка просроченности обслуживания
    pub fn is_overdue(next_maintenance: Option<&DateTime<Utc>>) -> bool {
        next_maintenance.map(|next| *next < Utc::now()).unwrap_or(false)
    }

    /// Валидация интервала обслуживания
    pub fn validate_interval(interval_days: i32) -> Result<(), String> {
        if interval_days < 1 {
            return Err("Maintenance interval must be at least 1 day".to_string());
        }
        if interval_days > 365 * 5 {
            return Err("Maintenance interval cannot exceed 5 years".to_string());
        }
        Ok(())
    }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_experiment_validator_educational() {
        let now = Utc::now();
        let start = now;
        let end = now + Duration::hours(2);
        
        let result = ExperimentValidator::validate_educational_experiment(
            Some(&start),
            Some(&end),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_experiment_validator_too_short() {
        let now = Utc::now();
        let start = now;
        let end = now + Duration::minutes(10); // Меньше 15 минут
        
        let result = ExperimentValidator::validate_educational_experiment(
            Some(&start),
            Some(&end),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("15 minutes"));
    }

    #[test]
    fn test_experiment_validator_too_long() {
        let now = Utc::now();
        let start = now;
        let end = now + Duration::hours(10); // Больше 8 часов
        
        let result = ExperimentValidator::validate_educational_experiment(
            Some(&start),
            Some(&end),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("8 hours"));
    }

    #[test]
    fn test_experiment_validator_title() {
        assert!(ExperimentValidator::validate_title("Valid Title").is_ok());
        assert!(ExperimentValidator::validate_title("").is_err());
        assert!(ExperimentValidator::validate_title("   ").is_err());
        
        let long_title = "x".repeat(201);
        assert!(ExperimentValidator::validate_title(&long_title).is_err());
    }

    #[test]
    fn test_maintenance_needs_maintenance() {
        let now = Utc::now();
        let past = now - Duration::days(30);
        let future = now + Duration::days(30);
        
        // Обслуживание просрочено
        assert!(MaintenanceValidator::needs_maintenance(
            None,
            Some(&past),
            None,
        ));
        
        // Обслуживание не требуется
        assert!(!MaintenanceValidator::needs_maintenance(
            None,
            Some(&future),
            None,
        ));
        
        // По интервалу - просрочено
        let old_maintenance = now - Duration::days(100);
        assert!(MaintenanceValidator::needs_maintenance(
            Some(&old_maintenance),
            None,
            Some(90), // интервал 90 дней
        ));
    }

    #[test]
    fn test_maintenance_next_date() {
        let now = Utc::now();
        let next = MaintenanceValidator::next_maintenance_date(
            Some(&now),
            Some(30),
        );
        
        assert!(next.is_some());
        let expected = now + Duration::days(30);
        assert!((next.unwrap() - expected).num_seconds().abs() < 1);
    }

    #[test]
    fn test_maintenance_days_until() {
        let now = Utc::now();
        let future = now + Duration::days(10);
        
        let days = MaintenanceValidator::days_until_maintenance(Some(&future));
        assert!(days.is_some());
        assert!((days.unwrap() - 10).abs() <= 1); // Допуск на время выполнения
    }

    #[test]
    fn test_maintenance_interval_validation() {
        assert!(MaintenanceValidator::validate_interval(30).is_ok());
        assert!(MaintenanceValidator::validate_interval(0).is_err());
        assert!(MaintenanceValidator::validate_interval(-1).is_err());
        assert!(MaintenanceValidator::validate_interval(365 * 6).is_err());
    }
}
