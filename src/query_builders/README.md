# Query Builders - Production-Ready SQL Module

Безопасный модуль для генерации SQL-запросов с защитой от инъекций.

## Структура модулей

```
query_builders/
├── mod.rs                    # Главный модуль с re-exports
├── filters/
│   ├── mod.rs               # FilterOperator, Filter, FilterGroup, FilterItem
│   ├── enums.rs             # Все статусы через макрос define_status_enum!
│   ├── value.rs             # FilterValue для типобезопасного биндинга
│   ├── whitelist.rs         # FieldWhitelist, FieldConfig, FieldValidationError
│   └── builder.rs           # FilterBuilder с sqlx интеграцией
├── fts/
│   ├── mod.rs               # FtsQueryBuilder
│   └── config.rs            # FtsConfig для разных таблиц
├── pagination/
│   ├── mod.rs
│   └── time.rs              # DateRange, TimeSlot
├── sql/
│   ├── mod.rs
│   ├── select.rs            # SafeQueryBuilder
│   └── count.rs             # CountQueryBuilder
└── utils/
    ├── mod.rs               # escape_*, validate_*, file utils
    └── validators.rs        # ExperimentValidator, MaintenanceValidator
```

## Ключевые принципы безопасности

### 1. Все значения - через bind
```rust
// ✅ ПРАВИЛЬНО
builder.push_bind(user_input);

// ❌ ЗАПРЕЩЕНО
builder.push(&format!("'{}'", user_input));
```

### 2. Имена колонок - через whitelist
```rust
let whitelist = FieldWhitelist::for_batches();
let builder = FilterBuilder::new().with_whitelist(&whitelist);

// Невалидные поля игнорируются
builder.add_exact_match("password", "secret"); // Будет пропущено
```

### 3. Операторы - enum
```rust
pub enum FilterOperator {
    Eq, Neq, Gt, Gte, Lt, Lte, 
    Like, StartsWith, EndsWith,
    In, NotIn, IsNull, IsNotNull, 
    Between, NotBetween,
}
```

### 4. FTS - через параметры
```rust
let (sql, params) = fts_builder.build_fts_condition("search term");
// sql: "reagents.id IN (SELECT id FROM reagents_fts WHERE reagents_fts MATCH ?)"
// params: ["search* term*"]
```

## Использование

### Простой запрос
```rust
use crate::query_builders::{SafeQueryBuilder, FieldWhitelist};

let whitelist = FieldWhitelist::for_batches();
let mut builder = SafeQueryBuilder::new("batches")?
    .with_whitelist(&whitelist);

builder
    .add_exact_match("status", "active")
    .add_comparison("quantity", ">", 0)
    .order_by("created_at", "desc")
    .paginate(1, 20);

let (sql, params) = builder.build_select("*");
```

### Сложные фильтры с группами
```rust
use crate::query_builders::{Filter, FilterGroup, FilterItem, FilterBuilder, FieldWhitelist};

let group = FilterGroup::and(vec![
    FilterItem::filter(Filter::eq("status", "active")),
    FilterItem::group(FilterGroup::or(vec![
        FilterItem::filter(Filter::gte("quantity", 10.0)),
        FilterItem::filter(Filter::is_null("expiry_date")),
    ])),
]);

let whitelist = FieldWhitelist::for_batches();
let builder = FilterBuilder::new().with_whitelist(&whitelist);
let (sql, params) = builder.build_condition(&group)?;
// sql: "status = ? AND (quantity >= ? OR expiry_date IS NULL)"
```

### Интеграция с sqlx::QueryBuilder
```rust
use sqlx::QueryBuilder;

let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("SELECT * FROM batches");
let mut has_where = false;
let mut count = 0;

let filter_builder = FilterBuilder::new().with_whitelist(&whitelist);
filter_builder.build_condition_with_bindings(&group, &mut qb, &mut has_where, &mut count)?;

let query = qb.build();
// Все параметры биндятся автоматически
```

### FTS поиск
```rust
use crate::query_builders::{FtsQueryBuilder, FtsConfig};

let fts = FtsQueryBuilder::for_reagents();
let (condition, params) = fts.build_fts_condition("sodium chloride");

// С fallback на LIKE если FTS недоступен
let (condition, params) = fts.build_with_fallback("sodium", fts_available);
```

### Статусы через макрос
```rust
use crate::query_builders::filters::enums::*;

// Все методы генерируются автоматически
let status = BatchStatus::Available;
assert_eq!(status.as_str(), "available");
assert_eq!(BatchStatus::from_str("low_stock"), Some(BatchStatus::LowStock));
assert!(BatchStatus::is_valid("expired"));

// Display trait
println!("{}", status); // "available"

// Все значения
let all = BatchStatus::all_values(); // &["available", "low_stock", ...]
```

## Гарантии безопасности

После рефакторинга **невозможны**:
- SQL injection через values (все через bind)
- SQL injection через column names (whitelist)
- SQL injection через ORDER BY (whitelist + normalize)
- SQL injection через FTS (escape + bind)
- SQL injection через operators (enum, не строки)

## Миграция с предыдущей версии

```rust
// Было (safe_requests.rs)
use crate::safe_requests::{SafeQueryBuilder, FilterBuilder};

// Стало (query_builders)
use crate::query_builders::{SafeQueryBuilder, FilterBuilder};
```

API остаётся совместимым, изменена только организация модулей.
