// src/auth_handlers.rs - Authentication route handlers
use actix_web::{web, HttpRequest, HttpResponse};
use validator::Validate;
use std::sync::Arc;

use crate::handlers::ApiResponse;
use crate::auth::{
    AuthService, User, LoginRequest, RegisterRequest, ChangePasswordRequest,
    LoginResponse, UserInfo, UserRole, get_current_user, check_permission
};
use crate::error::{ApiError, ApiResult};
use crate::AppState;

// FIXED: AuthService is now Arc<AuthService>
pub async fn login(
    app_state: web::Data<Arc<AppState>>,
    auth_service: web::Data<Arc<AuthService>>,
    request: web::Json<LoginRequest>,
) -> ApiResult<HttpResponse> {
    request.validate()?;

    let user = User::find_by_username(&app_state.db_pool, &request.username).await
        .map_err(|_| ApiError::BadRequest("Invalid username or password".to_string()))?;

    if !auth_service.verify_password(&request.password, &user.password_hash)
        .map_err(|_| ApiError::InternalServerError("Password verification failed".to_string()))? {
        return Err(ApiError::BadRequest("Invalid username or password".to_string()));
    }

    user.update_last_login(&app_state.db_pool).await?;
    let token = auth_service.generate_token(&user)?;

    let response = LoginResponse {
        token,
        expires_in: 24 * 3600, // 24 hours in seconds
        user: user.clone().into(),
    };

    log::info!("User {} logged in successfully", user.username);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        response,
        "Login successful".to_string(),
    )))
}

pub async fn register(
    app_state: web::Data<Arc<AppState>>,
    auth_service: web::Data<Arc<AuthService>>,
    request: web::Json<RegisterRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    request.validate()?;

    // Determine role - only admins can create other admins
    let role = if let Ok(claims) = get_current_user(&http_request) {
        check_permission(&claims, |role| role.can_manage_users())?;

        // Admin can specify role
        if let Some(role_str) = &request.role {
            UserRole::from_str(role_str)
                .ok_or_else(|| ApiError::BadRequest("Invalid role specified".to_string()))?
        } else {
            UserRole::Researcher // Default for admin-created users
        }
    } else {
        // Check if this is the first user (becomes admin)
        let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&app_state.db_pool)
            .await?;

        if user_count.0 == 0 {
            UserRole::Admin // First user becomes admin
        } else {
            // Self-registration not allowed unless configured
            return Err(ApiError::BadRequest("Registration is disabled. Contact administrator.".to_string()));
        }
    };

    let user = User::create(&app_state.db_pool, request.into_inner(), role, &auth_service).await?;
    let token = auth_service.generate_token(&user)?;

    let response = LoginResponse {
        token,
        expires_in: 24 * 3600,
        user: user.into(),
    };

    log::info!("New user registered: {} with role {:?}", response.user.username, response.user.role);

    Ok(HttpResponse::Created().json(ApiResponse::success_with_message(
        response,
        "User registered successfully".to_string(),
    )))
}

pub async fn get_profile(http_request: HttpRequest) -> ApiResult<HttpResponse> {
    let claims = get_current_user(&http_request)?;

    let user_info = UserInfo {
        id: claims.sub,
        username: claims.username,
        email: claims.email,
        role: claims.role,
        is_active: true,
        last_login: None, // We don't store this in JWT
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(user_info)))
}

pub async fn change_password(
    app_state: web::Data<Arc<AppState>>,
    auth_service: web::Data<Arc<AuthService>>,
    request: web::Json<ChangePasswordRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    request.validate()?;
    let claims = get_current_user(&http_request)?;

    let user = User::find_by_id(&app_state.db_pool, &claims.sub).await?;

    // Verify current password
    if !auth_service.verify_password(&request.current_password, &user.password_hash)
        .map_err(|_| ApiError::InternalServerError("Password verification failed".to_string()))? {
        return Err(ApiError::BadRequest("Current password is incorrect".to_string()));
    }

    // Hash new password and update
    let new_password_hash = auth_service.hash_password(&request.new_password)
        .map_err(|_| ApiError::InternalServerError("Password hashing failed".to_string()))?;
    user.change_password(&app_state.db_pool, &new_password_hash).await?;

    log::info!("User {} changed password", user.username);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Password changed successfully".to_string(),
    )))
}

pub async fn logout(http_request: HttpRequest) -> ApiResult<HttpResponse> {
    let claims = get_current_user(&http_request)?;

    log::info!("User {} logged out", claims.username);

    Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
        (),
        "Logged out successfully".to_string(),
    )))
}

// Admin only: List all users
pub async fn list_users(
    app_state: web::Data<Arc<AppState>>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let claims = get_current_user(&http_request)?;
    check_permission(&claims, |role| role.can_manage_users())?;

    let users: Vec<User> = sqlx::query_as("SELECT * FROM users ORDER BY created_at DESC")
        .fetch_all(&app_state.db_pool)
        .await?;

    let user_infos: Vec<UserInfo> = users.into_iter().map(|u| u.into()).collect();

    Ok(HttpResponse::Ok().json(ApiResponse::success(user_infos)))
}

// Admin only: Update user role/status
pub async fn update_user(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    request: web::Json<UpdateUserRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let user_id = path.into_inner();
    let claims = get_current_user(&http_request)?;
    check_permission(&claims, |role| role.can_manage_users())?;

    request.validate()?;

    // Prevent admin from deactivating themselves
    if user_id == claims.sub && request.is_active == Some(false) {
        return Err(ApiError::BadRequest("Cannot deactivate your own account".to_string()));
    }

    let now = chrono::Utc::now();
    let mut query = "UPDATE users SET updated_at = ?".to_string();
    let mut params: Vec<String> = vec![now.to_rfc3339()];

    if let Some(role) = &request.role {
        if UserRole::from_str(role).is_some() {
            query.push_str(", role = ?");
            params.push(role.clone());
        } else {
            return Err(ApiError::BadRequest("Invalid role specified".to_string()));
        }
    }

    if let Some(is_active) = request.is_active {
        query.push_str(", is_active = ?");
        params.push(if is_active { "1" } else { "0" }.to_string());
    }

    query.push_str(" WHERE id = ?");
    params.push(user_id.clone());

    let mut query_builder = sqlx::query(&query);
    for param in params {
        query_builder = query_builder.bind(param);
    }

    let result = query_builder.execute(&app_state.db_pool).await?;

    if result.rows_affected() > 0 {
        log::info!("Admin {} updated user {}", claims.username, user_id);
        Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
            (),
            "User updated successfully".to_string(),
        )))
    } else {
        Err(ApiError::NotFound("User not found".to_string()))
    }
}

#[derive(serde::Deserialize, validator::Validate)]
pub struct UpdateUserRequest {
    pub role: Option<String>,
    pub is_active: Option<bool>,
}
pub async fn change_user_password(
    app_state: web::Data<Arc<AppState>>,
    auth_service: web::Data<Arc<AuthService>>,
    path: web::Path<String>,
    request: web::Json<ChangeUserPasswordRequest>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let user_id = path.into_inner();
    let claims = get_current_user(&http_request)?;
    check_permission(&claims, |role| role.can_manage_users())?;

    request.validate()?;

    let new_password_hash = auth_service.hash_password(&request.new_password)
        .map_err(|_| ApiError::InternalServerError("Password hashing failed".to_string()))?;

    let result = sqlx::query("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&new_password_hash)
        .bind(&user_id)
        .execute(&app_state.db_pool)
        .await?;

    if result.rows_affected() > 0 {
        log::info!("Admin {} changed password for user {}", claims.username, user_id);
        Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
            (),
            "Password changed successfully".to_string(),
        )))
    } else {
        Err(ApiError::NotFound("User not found".to_string()))
    }
}

pub async fn delete_user(
    app_state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    http_request: HttpRequest,
) -> ApiResult<HttpResponse> {
    let user_id = path.into_inner();
    let claims = get_current_user(&http_request)?;
    check_permission(&claims, |role| role.can_manage_users())?;

    // Prevent admin from deleting themselves
    if user_id == claims.sub {
        return Err(ApiError::BadRequest("Cannot delete your own account".to_string()));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&user_id)
        .execute(&app_state.db_pool)
        .await?;

    if result.rows_affected() > 0 {
        log::info!("Admin {} deleted user {}", claims.username, user_id);
        Ok(HttpResponse::Ok().json(ApiResponse::success_with_message(
            (),
            "User deleted successfully".to_string(),
        )))
    } else {
        Err(ApiError::NotFound("User not found".to_string()))
    }
}

// Добавить структуру для изменения пароля
#[derive(serde::Deserialize, validator::Validate)]
pub struct ChangeUserPasswordRequest {
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub new_password: String,
}
// Permission check middleware functions
pub fn check_reagent_permission(
    http_request: &HttpRequest,
    action: ReagentAction,
) -> ApiResult<()> {
    let claims = get_current_user(http_request)?;

    match action {
        ReagentAction::Create => check_permission(&claims, |role| role.can_create_reagents()),
        ReagentAction::Edit => check_permission(&claims, |role| role.can_edit_reagents()),
        ReagentAction::Delete => check_permission(&claims, |role| role.can_delete_reagents()),
        ReagentAction::View => Ok(()), // Everyone can view
    }
}

pub fn check_batch_permission(
    http_request: &HttpRequest,
    action: BatchAction,
) -> ApiResult<()> {
    let claims = get_current_user(http_request)?;

    match action {
        BatchAction::Create => check_permission(&claims, |role| role.can_create_batches()),
        BatchAction::Edit => check_permission(&claims, |role| role.can_edit_batches()),
        BatchAction::Delete => check_permission(&claims, |role| role.can_delete_batches()),
        BatchAction::View => Ok(()), // Everyone can view
    }
}

pub enum ReagentAction {
    Create,
    Edit,
    Delete,
    View,
}

pub enum BatchAction {
    Create,
    Edit,
    Delete,
    View,
}