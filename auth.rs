use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Duration, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;
use actix_web::web;
use actix_web::HttpMessage;
use validator::Validate;
use actix_web::{HttpRequest, dev::ServiceRequest};
use actix_web_httpauth::extractors::bearer::BearerAuth;
use crate::error::{ApiError, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserRole {
    Admin,
    Researcher,
    Viewer,
}

impl UserRole {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "admin" => Some(UserRole::Admin),
            "researcher" => Some(UserRole::Researcher),
            "viewer" => Some(UserRole::Viewer),
            _ => None,
        }
    }

    pub fn can_manage_users(&self) -> bool {
        matches!(self, UserRole::Admin)
    }

    pub fn can_create_reagents(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Researcher)
    }

    pub fn can_edit_reagents(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Researcher)
    }

    pub fn can_delete_reagents(&self) -> bool {
        matches!(self, UserRole::Admin)
    }

    pub fn can_create_batches(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Researcher)
    }

    pub fn can_edit_batches(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Researcher)
    }

    pub fn can_delete_batches(&self) -> bool {
        matches!(self, UserRole::Admin)
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 1, message = "Username is required"))]
    pub username: String,
    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(length(min = 3, max = 50, message = "Username must be 3-50 characters"))]
    pub username: String,
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 1, message = "Current password is required"))]
    pub current_password: String,
    #[validate(length(min = 8, message = "New password must be at least 8 characters"))]
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: UserRole,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
}

impl From<User> for UserInfo {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
            role: UserRole::from_str(&user.role).unwrap_or(UserRole::Viewer),
            is_active: user.is_active,
            last_login: user.last_login,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user_id
    pub username: String,
    pub email: String,
    pub role: UserRole,
    pub exp: i64,
    pub iat: i64,
}

pub struct AuthService {
    jwt_secret: String,
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

impl AuthService {
    pub fn new(jwt_secret: &str) -> Self {
        Self {
            jwt_secret: jwt_secret.to_string(),
            encoding_key: EncodingKey::from_secret(jwt_secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(jwt_secret.as_bytes()),
        }
    }

    pub fn hash_password(&self, password: &str) -> Result<String, bcrypt::BcryptError> {
        hash(password, DEFAULT_COST)
    }

    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
        verify(password, hash)
    }

    pub fn generate_token(&self, user: &User) -> ApiResult<String> {
        let now = Utc::now();
        let exp = now + Duration::hours(24);

        let claims = Claims {
            sub: user.id.clone(),
            username: user.username.clone(),
            email: user.email.clone(),
            role: UserRole::from_str(&user.role).unwrap_or(UserRole::Viewer),
            exp: exp.timestamp(),
            iat: now.timestamp(),
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|_| ApiError::AuthError("Failed to generate token".to_string()))
    }

    pub fn verify_token(&self, token: &str) -> ApiResult<Claims> {
        let validation = Validation::default();
        decode::<Claims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|_| ApiError::AuthError("Invalid token".to_string()))
    }
}

impl User {
    pub async fn find_by_username(pool: &SqlitePool, username: &str) -> ApiResult<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ? AND is_active = 1")
            .bind(username)
            .fetch_one(pool)
            .await
            .map_err(|_| ApiError::NotFound("User not found".to_string()))
    }

    pub async fn find_by_id(pool: &SqlitePool, id: &str) -> ApiResult<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|_| ApiError::NotFound("User not found".to_string()))
    }

    pub async fn create(
        pool: &SqlitePool,
        request: RegisterRequest,
        role: UserRole,
        auth_service: &AuthService,
    ) -> ApiResult<User> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let password_hash = auth_service.hash_password(&request.password)
            .map_err(|_| ApiError::InternalServerError("Failed to hash password".to_string()))?;

        let user = User {
            id: id.clone(),
            username: request.username,
            email: request.email,
            password_hash,
            role: match role {
                    UserRole::Admin => "admin".to_string(),
                    UserRole::Researcher => "researcher".to_string(),
                    UserRole::Viewer => "viewer".to_string(),
                },
            is_active: true,
            last_login: None,
            created_at: now,
            updated_at: now,
        };

        sqlx::query(
            r#"INSERT INTO users (id, username, email, password_hash, role, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#
        )
            .bind(&user.id)
            .bind(&user.username)
            .bind(&user.email)
            .bind(&user.password_hash)
            .bind(&user.role)
            .bind(if user.is_active { 1 } else { 0 })
            .bind(&user.created_at)
            .bind(&user.updated_at)
            .execute(pool)
            .await?;

        Ok(user)
    }

    pub async fn update_last_login(&self, pool: &SqlitePool) -> ApiResult<()> {
        sqlx::query("UPDATE users SET last_login = datetime('now') WHERE id = ?")
            .bind(&self.id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn change_password(&self, pool: &SqlitePool, new_password_hash: &str) -> ApiResult<()> {
        sqlx::query("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(new_password_hash)
            .bind(&self.id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

pub fn get_current_user(req: &HttpRequest) -> ApiResult<Claims> {
    req.extensions()
        .get::<Claims>().cloned()
        .ok_or_else(|| ApiError::Unauthorized("No user information found".to_string()))
}

pub fn check_permission<F>(claims: &Claims, check: F) -> ApiResult<()>
where
    F: Fn(&UserRole) -> bool,
{
    if check(&claims.role) {
        Ok(())
    } else {
        Err(ApiError::Forbidden("Insufficient permissions".to_string()))
    }
}

// FIXED: JWT middleware function
pub async fn jwt_middleware(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (actix_web::Error, ServiceRequest)> {
    let token = credentials.token();

    // Fixed: Get AuthService from app data correctly
    let auth_service = match req.app_data::<web::Data<std::sync::Arc<AuthService>>>() {
        Some(svc) => svc,
        None => {
            log::error!("AuthService not found in app data");
            return Err((
                ApiError::InternalServerError("Auth service not available".to_string()).into(),
                req,
            ));
        }
    };

    match auth_service.verify_token(token) {
        Ok(claims) => {
            // Insert claims into request extensions
            req.extensions_mut().insert(claims);
            Ok(req)
        }
        Err(err) => {
            log::warn!("JWT verification failed: {}", err);
            Err((err.into(), req))
        }
    }
}