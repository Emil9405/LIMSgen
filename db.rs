// src/db.rs - Database migrations and setup
use sqlx::SqlitePool;
use anyhow::Result;

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    // Enable foreign keys and WAL mode
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(pool)
        .await?;

    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(pool)
        .await?;

    // Create users table - Fixed boolean handling for SQLite
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE CHECK(length(username) >= 3 AND length(username) <= 50),
            email TEXT NOT NULL UNIQUE CHECK(length(email) >= 5 AND length(email) <= 255),
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer' CHECK(
                role IN ('admin', 'researcher', 'viewer')
            ),
            is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
            last_login DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        "#,
    )
        .execute(pool)
        .await?;

    // Create the reagent table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS reagents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE CHECK(length(name) > 0 AND length(name) <= 255),
            formula TEXT CHECK(formula IS NULL OR length(formula) <= 500),
            cas_number TEXT CHECK(cas_number IS NULL OR length(cas_number) <= 50),
            manufacturer TEXT CHECK(manufacturer IS NULL OR length(manufacturer) <= 255),
            description TEXT CHECK(description IS NULL OR length(description) <= 1000),
            status TEXT NOT NULL DEFAULT 'active' CHECK(
                status IN ('active', 'inactive', 'discontinued')
            ),
            created_by TEXT,
            updated_by TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY (created_by) REFERENCES users (id),
            FOREIGN KEY (updated_by) REFERENCES users (id)
        )
        "#,
    )
        .execute(pool)
        .await?;

    // Create batches table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            reagent_id TEXT NOT NULL,
            batch_number TEXT NOT NULL,
            quantity REAL NOT NULL CHECK(quantity >= 0),
            original_quantity REAL NOT NULL CHECK(original_quantity >= 0),
            unit TEXT NOT NULL CHECK(length(unit) > 0 AND length(unit) <= 20),
            expiry_date DATETIME,
            supplier TEXT CHECK(supplier IS NULL OR length(supplier) <= 255),
            manufacturer TEXT CHECK(manufacturer IS NULL OR length(manufacturer) <= 255),
            received_date DATETIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'available' CHECK(
                status IN ('available', 'in_use', 'expired', 'depleted')
            ),
            location TEXT CHECK(location IS NULL OR length(location) <= 255),
            notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000),
            created_by TEXT,
            updated_by TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY (reagent_id) REFERENCES reagents (id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users (id),
            FOREIGN KEY (updated_by) REFERENCES users (id),
            UNIQUE(reagent_id, batch_number)
        )
        "#,
    )
        .execute(pool)
        .await?;

    // Create usage_logs table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS usage_logs (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL,
            user_id TEXT,
            quantity_used REAL NOT NULL CHECK(quantity_used > 0),
            purpose TEXT CHECK(purpose IS NULL OR length(purpose) <= 500),
            notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000),
            used_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        "#,
    )
        .execute(pool)
        .await?;

    // Create audit_logs table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            action TEXT NOT NULL CHECK(
                action IN ('CREATE', 'UPDATE', 'DELETE')
            ),
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            old_values TEXT, -- JSON
            new_values TEXT, -- JSON
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        "#,
    )
        .execute(pool)
        .await?;

    // Create indexes for performance
    create_indexes(pool).await?;

    // Create triggers for audit logging
    create_audit_triggers(pool).await?;

    log::info!("Database migrations completed successfully");
    Ok(())
}

async fn create_indexes(pool: &SqlitePool) -> Result<()> {
    let index_queries = [
        // Users indexes
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)",
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)",
        "CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active)",

        // Reagents indexes

        "CREATE INDEX IF NOT EXISTS idx_reagents_status ON reagents (status)",
        "CREATE INDEX IF NOT EXISTS idx_reagents_created_at ON reagents (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_reagents_cas_number ON reagents (cas_number)",
        "CREATE INDEX IF NOT EXISTS idx_reagents_manufacturer ON reagents (manufacturer)",
        "CREATE INDEX IF NOT EXISTS idx_reagents_name_text ON reagents (name COLLATE NOCASE)",

        // Batches indexes
        "CREATE INDEX IF NOT EXISTS idx_batches_reagent_id ON batches (reagent_id)",
        "CREATE INDEX IF NOT EXISTS idx_batches_status ON batches (status)",
        "CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON batches (expiry_date)",
        "CREATE INDEX IF NOT EXISTS idx_batches_manufacturer ON batches (manufacturer)",
        "CREATE INDEX IF NOT EXISTS idx_batches_location ON batches (location)",
        "CREATE INDEX IF NOT EXISTS idx_batches_received_date ON batches (received_date DESC)",

        // Usage logs indexes
        "CREATE INDEX IF NOT EXISTS idx_usage_logs_batch_id ON usage_logs (batch_id)",
        "CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_usage_logs_used_at ON usage_logs (used_at DESC)",

        // Audit logs indexes
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs (table_name, record_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)",
    ];

    for query in index_queries.iter() {
        sqlx::query(query).execute(pool).await?;
    }

    Ok(())
}

async fn create_audit_triggers(pool: &SqlitePool) -> Result<()> {
    let trigger_queries = [
        // Reagents audit triggers
        r#"CREATE TRIGGER IF NOT EXISTS reagents_audit_insert
           AFTER INSERT ON reagents
           BEGIN
               INSERT INTO audit_logs (id, user_id, action, table_name, record_id, new_values, created_at)
               VALUES (
                   lower(hex(randomblob(16))),
                   NEW.created_by,
                   'CREATE',
                   'reagents',
                   NEW.id,
                   json_object(
                       'name', NEW.name,
                       'formula', NEW.formula,
                       'cas_number', NEW.cas_number,
                       'manufacturer', NEW.manufacturer,
                       'description', NEW.description,
                       'status', NEW.status
                   ),
                   NEW.created_at
               );
           END"#,

        r#"CREATE TRIGGER IF NOT EXISTS reagents_audit_update
           AFTER UPDATE ON reagents
           BEGIN
               INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, created_at)
               VALUES (
                   lower(hex(randomblob(16))),
                   NEW.updated_by,
                   'UPDATE',
                   'reagents',
                   NEW.id,
                   json_object(
                       'name', OLD.name,
                       'formula', OLD.formula,
                       'cas_number', OLD.cas_number,
                       'manufacturer', OLD.manufacturer,
                       'description', OLD.description,
                       'status', OLD.status
                   ),
                   json_object(
                       'name', NEW.name,
                       'formula', NEW.formula,
                       'cas_number', NEW.cas_number,
                       'manufacturer', NEW.manufacturer,
                       'description', NEW.description,
                       'status', NEW.status
                   ),
                   datetime('now')
               );
           END"#,

        r#"CREATE TRIGGER IF NOT EXISTS reagents_audit_delete
           BEFORE DELETE ON reagents
           BEGIN
               INSERT INTO audit_logs (id, action, table_name, record_id, old_values, created_at)
               VALUES (
                   lower(hex(randomblob(16))),
                   'DELETE',
                   'reagents',
                   OLD.id,
                   json_object(
                       'name', OLD.name,
                       'formula', OLD.formula,
                       'cas_number', OLD.cas_number,
                       'manufacturer', OLD.manufacturer,
                       'description', OLD.description,
                       'status', OLD.status
                   ),
                   datetime('now')
               );
           END"#,

        // Batches audit triggers
        r#"CREATE TRIGGER IF NOT EXISTS batches_audit_insert
           AFTER INSERT ON batches
           BEGIN
               INSERT INTO audit_logs (id, user_id, action, table_name, record_id, new_values, created_at)
               VALUES (
                   lower(hex(randomblob(16))),
                   NEW.created_by,
                   'CREATE',
                   'batches',
                   NEW.id,
                   json_object(
                       'batch_number', NEW.batch_number,
                       'quantity', NEW.quantity,
                       'unit', NEW.unit,
                       'status', NEW.status,
                       'location', NEW.location
                   ),
                   NEW.created_at
               );
           END"#,
        r#"CREATE TRIGGER IF NOT EXISTS batches_audit_update
           AFTER UPDATE ON batches
           BEGIN
               INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, created_at)
               VALUES (
                   lower(hex(randomblob(16))),
                   NEW.updated_by,
                   'UPDATE',
                   'batches',
                   NEW.id,
                   json_object(
                       'batch_number', OLD.batch_number,
                       'quantity', OLD.quantity,
                       'status', OLD.status
                   ),
                   json_object(
                       'batch_number', NEW.batch_number,
                       'quantity', NEW.quantity,
                       'status', NEW.status
                   ),
                   datetime('now')
               );
           END"#,
    ];

    for query in trigger_queries.iter() {
        sqlx::query(query).execute(pool).await?;
    }

    Ok(())
}

// Migration helper for existing databases
pub async fn migrate_existing_tables(pool: &SqlitePool) -> Result<()> {
    // Add new columns to existing tables if they don't exist
    let migration_queries = [
        // Reagents table additions
        "ALTER TABLE reagents ADD COLUMN cas_number TEXT CHECK(cas_number IS NULL OR length(cas_number) <= 50)",
        "ALTER TABLE reagents ADD COLUMN manufacturer TEXT CHECK(manufacturer IS NULL OR length(manufacturer) <= 255)",
        "ALTER TABLE reagents ADD COLUMN created_by TEXT",
        "ALTER TABLE reagents ADD COLUMN updated_by TEXT",

        // Batches table additions
        "ALTER TABLE batches ADD COLUMN original_quantity REAL",
        "ALTER TABLE batches ADD COLUMN manufacturer TEXT CHECK(manufacturer IS NULL OR length(manufacturer) <= 255)",
        "ALTER TABLE batches ADD COLUMN location TEXT CHECK(location IS NULL OR length(location) <= 255)",
        "ALTER TABLE batches ADD COLUMN notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000)",
        "ALTER TABLE batches ADD COLUMN created_by TEXT",
        "ALTER TABLE batches ADD COLUMN updated_by TEXT",
    ];

    for query in migration_queries.iter() {
        let _ = sqlx::query(query).execute(pool).await; // Ignore errors for existing columns
    }

    // Update original_quantity for existing batches
    let _ = sqlx::query("UPDATE batches SET original_quantity = quantity WHERE original_quantity IS NULL")
        .execute(pool)
        .await;

    Ok(())
}

// Helper function to reset database if needed (for development)
pub async fn reset_database(pool: &SqlitePool) -> Result<()> {
    log::warn!("Resetting database - all data will be lost!");

    let drop_queries = [
        "DROP TABLE IF EXISTS audit_logs",
        "DROP TABLE IF EXISTS usage_logs",
        "DROP TABLE IF EXISTS batches",
        "DROP TABLE IF EXISTS reagents",
        "DROP TABLE IF EXISTS users",
    ];

    for query in drop_queries.iter() {
        sqlx::query(query).execute(pool).await?;
    }

    // Recreate tables
    run_migrations(pool).await?;

    Ok(())
}