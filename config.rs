// src/config.rs - Configuration management
use serde::Deserialize;
use std::env;
use anyhow::{Context, Result};

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub auth: AuthConfig,
    pub security: SecurityConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub workers: Option<usize>,
    pub keep_alive: u64,
    pub client_timeout: u64,
    pub client_shutdown: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout: u64,
    pub idle_timeout: u64,
    pub backup_enabled: bool,
    pub backup_interval_hours: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub token_expiration_hours: i64,
    pub bcrypt_cost: u32,
    pub max_login_attempts: u32,
    pub lockout_duration_minutes: u64,
    pub allow_self_registration: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SecurityConfig {
    pub allowed_origins: Vec<String>,
    pub rate_limit_requests: u32,
    pub rate_limit_window_seconds: u64,
    pub max_request_size: usize,
    pub require_https: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
    pub file_enabled: bool,
    pub file_path: Option<String>,
    pub console_enabled: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 8080,
                workers: None,
                keep_alive: 30,
                client_timeout: 30,
                client_shutdown: 5,
            },
            database: DatabaseConfig {
                url: "sqlite:lims.db".to_string(),
                max_connections: 10,
                min_connections: 1,
                connect_timeout: 30,
                idle_timeout: 600,
                backup_enabled: true,
                backup_interval_hours: 24,
            },
            auth: AuthConfig {
                jwt_secret: "fb18f2fe6a44fdd8f5e0aad988008f62".to_string(),
                token_expiration_hours: 24,
                bcrypt_cost: 10,
                max_login_attempts: 5,
                lockout_duration_minutes: 15,
                allow_self_registration: false,
            },
            security: SecurityConfig {
                allowed_origins: vec!["*".to_string()],
                rate_limit_requests: 100,
                rate_limit_window_seconds: 60,
                max_request_size: 1024 * 1024, // 1MB
                require_https: false,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                format: "json".to_string(),
                file_enabled: true,
                file_path: Some("lims.log".to_string()),
                console_enabled: true,
            },
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let mut config = Config::default();
        
        // Override with environment variables
        config.server.host = env::var("LIMS_HOST").unwrap_or(config.server.host);
        config.server.port = env::var("LIMS_PORT")
            .unwrap_or(config.server.port.to_string())
            .parse()
            .context("Invalid LIMS_PORT")?;
        
        config.database.url = env::var("DATABASE_URL").unwrap_or(config.database.url);
        config.database.max_connections = env::var("DB_MAX_CONNECTIONS")
            .unwrap_or(config.database.max_connections.to_string())
            .parse()
            .context("Invalid DB_MAX_CONNECTIONS")?;
        
        config.auth.jwt_secret = env::var("JWT_SECRET").unwrap_or(config.auth.jwt_secret);
        config.auth.token_expiration_hours = env::var("JWT_EXPIRATION_HOURS")
            .unwrap_or(config.auth.token_expiration_hours.to_string())
            .parse()
            .context("Invalid JWT_EXPIRATION_HOURS")?;
        
        config.auth.allow_self_registration = env::var("ALLOW_SELF_REGISTRATION")
            .unwrap_or("false".to_string())
            .parse()
            .context("Invalid ALLOW_SELF_REGISTRATION")?;
        
        config.security.require_https = env::var("REQUIRE_HTTPS")
            .unwrap_or("false".to_string())
            .parse()
            .context("Invalid REQUIRE_HTTPS")?;
        
        config.logging.level = env::var("LOG_LEVEL").unwrap_or(config.logging.level);
        
        // Validate configuration
        config.validate()?;
        
        Ok(config)
    }
    
    fn validate(&self) -> Result<()> {
        if self.auth.jwt_secret == "change-me-in-production" {
            log::warn!("⚠️  Using default JWT secret. Change JWT_SECRET in production!");
        }
        
        if self.auth.jwt_secret.len() < 32 {
            return Err(anyhow::anyhow!("JWT secret must be at least 32 characters long"));
        }
        
        if self.server.port < 1024 && env::var("USER").unwrap_or_default() != "root" {
            log::warn!("Port {} requires root privileges", self.server.port);
        }
        
        if self.database.max_connections < self.database.min_connections {
            return Err(anyhow::anyhow!("max_connections must be >= min_connections"));
        }
        
        Ok(())
    }
    
    pub fn is_production(&self) -> bool {
        env::var("LIMS_ENV").unwrap_or_default() == "production"
    }
    
    pub fn print_startup_info(&self) {
        log::info!("🧪 LIMS Starting up...");
        log::info!("🌐 Server: {}:{}", self.server.host, self.server.port);
        log::info!("💾 Database: {}", 
            if self.database.url.contains("sqlite") { "SQLite" } 
            else if self.database.url.contains("postgres") { "PostgreSQL" }
            else { "Unknown" });
        log::info!("🔒 Auth: JWT ({}h expiration)", self.auth.token_expiration_hours);
        log::info!("📊 Logging: {} level", self.logging.level);
        
        if !self.is_production() {
            log::warn!("🚧 Running in development mode");
        }
        
        if !self.security.require_https && self.is_production() {
            log::warn!("⚠️  HTTPS not required in production mode");
        }
    }
}

// Environment-specific configuration loading
pub fn load_env_file() -> Result<()> {
    if let Ok(env_file) = env::var("ENV_FILE") {
        dotenvy::from_filename(&env_file)
            .with_context(|| format!("Failed to load environment file: {}", env_file))?;
    } else if std::path::Path::new(".env").exists() {
        dotenvy::dotenv().context("Failed to load .env file")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.host, "127.0.0.1");
        assert_eq!(config.server.port, 8080);
        assert!(!config.is_production());
    }

    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        config.auth.jwt_secret = "short".to_string();
        assert!(config.validate().is_err());
        
        config.auth.jwt_secret = "a".repeat(32);
        assert!(config.validate().is_ok());
    }
}