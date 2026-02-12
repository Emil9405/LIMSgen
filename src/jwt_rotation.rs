// src/jwt_rotation.rs - Automatic JWT Secret Rotation Module

// Автоматическая ротация JWT ключей каждые 3 дня



use rand::{thread_rng, Rng, distributions::Alphanumeric};

use sqlx::SqlitePool;

use std::path::Path;

use std::fs;

use std::time::Duration;

use tokio::time;

use chrono::{DateTime, Utc, Duration as ChronoDuration};

use anyhow::{Context, Result};

use serde::{Serialize, Deserialize};



const JWT_SECRET_LENGTH: usize = 64;

const ROTATION_INTERVAL_DAYS: i64 = 3;



#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]

pub struct JwtRotationRecord {

    pub id: i32,

    pub secret_hash: String,  // Hash секрета (не сам секрет!)

    pub created_at: DateTime<Utc>,

    pub expires_at: DateTime<Utc>,

    pub is_active: bool,

}



/// Генерирует безопасный JWT секрет

fn generate_jwt_secret() -> String {

    thread_rng()

        .sample_iter(&Alphanumeric)

        .take(JWT_SECRET_LENGTH)

        .map(char::from)

        .collect()

}



/// Создает хеш секрета для хранения в БД (не храним сам секрет!)

fn hash_secret(secret: &str) -> String {

    use std::collections::hash_map::DefaultHasher;

    use std::hash::{Hash, Hasher};



    let mut hasher = DefaultHasher::new();

    secret.hash(&mut hasher);

    format!("{:x}", hasher.finish())

}



/// Обновляет JWT_SECRET в .env файле

pub fn update_env_file(env_path: &str, new_secret: &str) -> Result<()> {

    let path = Path::new(env_path);



    let content = if path.exists() {

        fs::read_to_string(path)?

    } else {

        String::new()

    };



    let new_content = if content.contains("JWT_SECRET=") {

        // Заменяем существующий ключ

        let mut lines: Vec<String> = content.lines().map(String::from).collect();

        for line in &mut lines {

            if line.trim().starts_with("JWT_SECRET=") {

                *line = format!("JWT_SECRET={}", new_secret);

            }

        }

        lines.join("\n") + "\n"

    } else {

        // Добавляем новый ключ

        if content.is_empty() {

            format!("JWT_SECRET={}\n", new_secret)

        } else {

            format!("{}\nJWT_SECRET={}\n", content.trim_end(), new_secret)

        }

    };



    // Создаем резервную копию

    let backup_path = format!("{}.backup.{}", env_path, Utc::now().timestamp());

    fs::write(&backup_path, &content)

        .context("Failed to create backup")?;



    // Записываем новый файл

    fs::write(path, new_content)

        .context("Failed to update .env file")?;



    log::info!("✓ JWT secret rotated, backup saved to: {}", backup_path);



    Ok(())

}



/// Инициализирует таблицу для отслеживания ротации ключей

pub async fn init_rotation_table(pool: &SqlitePool) -> Result<()> {

    sqlx::query(

        r#"

        CREATE TABLE IF NOT EXISTS jwt_rotation_log (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            secret_hash TEXT NOT NULL,

            created_at DATETIME NOT NULL,

            expires_at DATETIME NOT NULL,

            is_active BOOLEAN NOT NULL DEFAULT 1

        )

        "#

    )

        .execute(pool)

        .await

        .context("Failed to create jwt_rotation_log table")?;



    log::info!("✓ JWT rotation table initialized");

    Ok(())

}



/// Проверяет, нужна ли ротация ключа

pub async fn should_rotate(pool: &SqlitePool) -> Result<bool> {

    let active_record: Option<JwtRotationRecord> = sqlx::query_as(

        "SELECT * FROM jwt_rotation_log WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1"

    )

        .fetch_optional(pool)

        .await?;



    match active_record {

        Some(record) => {

            let now = Utc::now();

            let should_rotate = now >= record.expires_at;



            if should_rotate {

                log::info!("JWT secret expired at {}, rotation needed", record.expires_at);

            }



            Ok(should_rotate)

        }

        None => {

            // Нет активных записей - нужна инициализация

            log::info!("No active JWT rotation record found, initialization needed");

            Ok(true)

        }

    }

}



/// Выполняет ротацию JWT секрета

pub async fn rotate_jwt_secret(pool: &SqlitePool, env_path: &str) -> Result<String> {

    log::info!("🔄 Starting JWT secret rotation...");



    // Генерируем новый секрет

    let new_secret = generate_jwt_secret();

    let secret_hash = hash_secret(&new_secret);



    // Деактивируем старые ключи

    sqlx::query("UPDATE jwt_rotation_log SET is_active = 0 WHERE is_active = 1")

        .execute(pool)

        .await

        .context("Failed to deactivate old keys")?;



    // Добавляем новый ключ в БД

    let now = Utc::now();

    let expires_at = now + ChronoDuration::days(ROTATION_INTERVAL_DAYS);



    sqlx::query(

        r#"INSERT INTO jwt_rotation_log (secret_hash, created_at, expires_at, is_active)

           VALUES (?, ?, ?, 1)"#

    )

        .bind(&secret_hash)

        .bind(&now)

        .bind(&expires_at)

        .execute(pool)

        .await

        .context("Failed to insert new rotation record")?;



    // Обновляем .env файл

    update_env_file(env_path, &new_secret)

        .context("Failed to update .env file")?;



    log::info!("✓ JWT secret rotated successfully");

    log::info!("  New secret length: {}", new_secret.len());

    log::info!("  Expires at: {}", expires_at);

    log::warn!("⚠️  Application restart recommended to load new JWT secret");



    Ok(new_secret)

}



/// Запускает фоновую задачу автоматической ротации

pub async fn start_rotation_task(pool: SqlitePool, env_path: String) {

    log::info!("🔐 JWT rotation task started (interval: {} days)", ROTATION_INTERVAL_DAYS);



    // Инициализируем таблицу

    if let Err(e) = init_rotation_table(&pool).await {

        log::error!("Failed to initialize rotation table: {}", e);

        return;

    }



    // Проверяем, нужна ли немедленная ротация

    match should_rotate(&pool).await {

        Ok(true) => {

            log::info!("Immediate rotation needed");

            if let Err(e) = rotate_jwt_secret(&pool, &env_path).await {

                log::error!("Failed to rotate JWT secret: {}", e);

            }

        }

        Ok(false) => {

            if let Ok(Some(record)) = get_active_rotation_record(&pool).await {

                let remaining = record.expires_at - Utc::now();

                log::info!("Current JWT secret valid, expires in {} hours", 

                    remaining.num_hours());

            }

        }

        Err(e) => {

            log::error!("Failed to check rotation status: {}", e);

        }

    }



    // Запускаем периодическую проверку (каждый час)

    let mut interval = time::interval(Duration::from_secs(3600)); // Проверка каждый час



    loop {

        interval.tick().await;



        match should_rotate(&pool).await {

            Ok(true) => {

                log::info!("⏰ Rotation time reached");



                match rotate_jwt_secret(&pool, &env_path).await {

                    Ok(_) => {

                        log::info!("✓ Automatic JWT rotation completed");



                        // Отправляем уведомление администраторам (опционально)

                        notify_admins_about_rotation(&pool).await;

                    }

                    Err(e) => {

                        log::error!("❌ Failed to rotate JWT secret: {}", e);

                        // Повторная попытка через 10 минут

                        tokio::time::sleep(Duration::from_secs(600)).await;

                    }

                }

            }

            Ok(false) => {

                // Все в порядке, продолжаем ждать

            }

            Err(e) => {

                log::error!("Error checking rotation status: {}", e);

            }

        }

    }

}



/// Получает активную запись о ротации

async fn get_active_rotation_record(pool: &SqlitePool) -> Result<Option<JwtRotationRecord>> {

    let record = sqlx::query_as(

        "SELECT * FROM jwt_rotation_log WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1"

    )

        .fetch_optional(pool)

        .await?;



    Ok(record)

}



/// Отправляет уведомление администраторам о ротации (опционально)

async fn notify_admins_about_rotation(pool: &SqlitePool) {

    // Здесь можно добавить логику отправки email или других уведомлений

    // Например, запись в audit_logs или отправка email администраторам



    let notification_result = sqlx::query(

        r#"INSERT INTO audit_logs (id, user_id, action, table_name, record_id, new_values, created_at)

           VALUES (?, NULL, 'UPDATE', 'jwt_rotation', 'system', ?, datetime('now'))"#

    )

        .bind(uuid::Uuid::new_v4().to_string())

        .bind(r#"{"event": "jwt_secret_rotated", "automated": true}"#)

        .execute(pool)

        .await;



    if let Err(e) = notification_result {

        log::warn!("Failed to log rotation in audit_logs: {}", e);

    }



    log::info!("📧 Admin notification sent about JWT rotation");

}



/// Получает статистику ротации ключей

pub async fn get_rotation_stats(pool: &SqlitePool) -> Result<RotationStats> {

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM jwt_rotation_log")

        .fetch_one(pool)

        .await?;



    let active_record = get_active_rotation_record(pool).await?;



    let next_rotation = active_record

        .as_ref()

        .map(|r| r.expires_at)

        .unwrap_or_else(|| Utc::now());



    let last_rotation = active_record

        .as_ref()

        .map(|r| r.created_at)

        .unwrap_or_else(|| Utc::now());



    Ok(RotationStats {

        total_rotations: total.0,

        last_rotation,

        next_rotation,

        is_active: active_record.is_some(),

    })

}



#[derive(Debug, Serialize)]

pub struct RotationStats {

    pub total_rotations: i64,

    pub last_rotation: DateTime<Utc>,

    pub next_rotation: DateTime<Utc>,

    pub is_active: bool,

}



#[cfg(test)]

mod tests {

    use super::*;



    #[test]

    fn test_generate_jwt_secret() {

        let secret = generate_jwt_secret();

        assert_eq!(secret.len(), JWT_SECRET_LENGTH);

        assert!(secret.chars().all(|c| c.is_alphanumeric()));

    }



    #[test]

    fn test_hash_secret() {

        let secret = "test_secret_123";

        let hash1 = hash_secret(secret);

        let hash2 = hash_secret(secret);



        // Один и тот же секрет должен давать один хеш

        assert_eq!(hash1, hash2);



        // Разные секреты должны давать разные хеши

        let different_hash = hash_secret("different_secret");

        assert_ne!(hash1, different_hash);

    }

}