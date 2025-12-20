// src/query_builders/pagination/time.rs
//! Типы для работы с датами и временными слотами

use chrono::{DateTime, Utc, NaiveDate, NaiveTime, Datelike, Local};

// ==================== ДИАПАЗОН ДАТ ====================

#[derive(Debug, Clone)]
pub struct DateRange {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

impl DateRange {
    pub fn new(start: NaiveDate, end: NaiveDate) -> Self {
        Self { start, end }
    }

    /// Текущая неделя (понедельник - воскресенье)
    pub fn current_week() -> Self {
        let today = Local::now().date_naive();
        let weekday = today.weekday().num_days_from_monday();
        let monday = today - chrono::Duration::days(weekday as i64);
        let sunday = monday + chrono::Duration::days(6);
        Self { start: monday, end: sunday }
    }

    /// Неделя, содержащая указанную дату
    pub fn week_containing(date: NaiveDate) -> Self {
        let weekday = date.weekday().num_days_from_monday();
        let monday = date - chrono::Duration::days(weekday as i64);
        let sunday = monday + chrono::Duration::days(6);
        Self { start: monday, end: sunday }
    }

    /// Текущий месяц
    pub fn current_month() -> Self {
        let today = Local::now().date_naive();
        let first = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
        let last = if today.month() == 12 {
            NaiveDate::from_ymd_opt(today.year() + 1, 1, 1).unwrap() - chrono::Duration::days(1)
        } else {
            NaiveDate::from_ymd_opt(today.year(), today.month() + 1, 1).unwrap() - chrono::Duration::days(1)
        };
        Self { start: first, end: last }
    }

    /// Указанный месяц года
    pub fn month_of(year: i32, month: u32) -> Option<Self> {
        let first = NaiveDate::from_ymd_opt(year, month, 1)?;
        let last = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1)? - chrono::Duration::days(1)
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1)? - chrono::Duration::days(1)
        };
        Some(Self { start: first, end: last })
    }

    /// Следующие N дней (включая сегодня)
    pub fn next_days(days: i64) -> Self {
        let today = Local::now().date_naive();
        Self { start: today, end: today + chrono::Duration::days(days) }
    }

    /// Последние N дней (включая сегодня)
    pub fn last_days(days: i64) -> Self {
        let today = Local::now().date_naive();
        Self { start: today - chrono::Duration::days(days), end: today }
    }

    /// Начало диапазона как DateTime<Utc> (00:00:00)
    pub fn start_datetime(&self) -> DateTime<Utc> {
        self.start.and_hms_opt(0, 0, 0).unwrap().and_utc()
    }

    /// Конец диапазона как DateTime<Utc> (23:59:59)
    pub fn end_datetime(&self) -> DateTime<Utc> {
        self.end.and_hms_opt(23, 59, 59).unwrap().and_utc()
    }

    /// Продолжительность в днях
    pub fn duration_days(&self) -> i64 {
        (self.end - self.start).num_days()
    }

    /// Проверка, содержит ли диапазон дату
    pub fn contains(&self, date: NaiveDate) -> bool {
        date >= self.start && date <= self.end
    }
}

// ==================== ВРЕМЕННОЙ СЛОТ ====================

#[derive(Debug, Clone)]
pub struct TimeSlot {
    pub date: NaiveDate,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub room_id: Option<String>,
}

impl TimeSlot {
    pub fn new(
        date: NaiveDate,
        start_time: NaiveTime,
        end_time: NaiveTime,
        room_id: Option<String>,
    ) -> Self {
        Self { date, start_time, end_time, room_id }
    }

    /// Проверка пересечения с другим слотом
    pub fn overlaps(&self, other: &TimeSlot) -> bool {
        // Разные даты - нет пересечения
        if self.date != other.date {
            return false;
        }
        // Разные комнаты - нет пересечения
        if self.room_id != other.room_id {
            return false;
        }
        // Проверка пересечения времени
        !(self.end_time <= other.start_time || self.start_time >= other.end_time)
    }

    /// Продолжительность в минутах
    pub fn duration_minutes(&self) -> i64 {
        let zero = NaiveTime::from_hms_opt(0, 0, 0).unwrap();
        let start = self.start_time.signed_duration_since(zero);
        let end = self.end_time.signed_duration_since(zero);
        (end - start).num_minutes()
    }

    /// Проверка, содержит ли слот указанное время
    pub fn contains_time(&self, time: NaiveTime) -> bool {
        time >= self.start_time && time < self.end_time
    }

    /// Проверка валидности слота
    pub fn is_valid(&self) -> bool {
        self.end_time > self.start_time
    }
}

// ==================== ТЕСТЫ ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_date_range_current_week() {
        let range = DateRange::current_week();
        assert!(range.end >= range.start);
        assert_eq!((range.end - range.start).num_days(), 6);
    }

    #[test]
    fn test_date_range_month_of() {
        let range = DateRange::month_of(2024, 2).unwrap();
        assert_eq!(range.start.day(), 1);
        assert_eq!(range.end.day(), 29); // 2024 - високосный год
    }

    #[test]
    fn test_date_range_contains() {
        let range = DateRange::new(
            NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2024, 1, 31).unwrap(),
        );
        assert!(range.contains(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()));
        assert!(!range.contains(NaiveDate::from_ymd_opt(2024, 2, 1).unwrap()));
    }

    #[test]
    fn test_time_slot_overlap() {
        let slot1 = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(11, 0, 0).unwrap(),
            Some("room1".to_string()),
        );
        let slot2 = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(10, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(12, 0, 0).unwrap(),
            Some("room1".to_string()),
        );
        let slot3 = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(11, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(13, 0, 0).unwrap(),
            Some("room1".to_string()),
        );
        
        // slot1 и slot2 пересекаются (9-11 и 10-12)
        assert!(slot1.overlaps(&slot2));
        // slot1 и slot3 НЕ пересекаются (9-11 и 11-13 - граничное условие)
        assert!(!slot1.overlaps(&slot3));
    }

    #[test]
    fn test_time_slot_different_rooms() {
        let slot1 = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(11, 0, 0).unwrap(),
            Some("room1".to_string()),
        );
        let slot2 = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(11, 0, 0).unwrap(),
            Some("room2".to_string()),
        );
        
        // Разные комнаты - нет пересечения
        assert!(!slot1.overlaps(&slot2));
    }

    #[test]
    fn test_time_slot_duration() {
        let slot = TimeSlot::new(
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(11, 30, 0).unwrap(),
            None,
        );
        assert_eq!(slot.duration_minutes(), 150); // 2.5 часа = 150 минут
    }
}
