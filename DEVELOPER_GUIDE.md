# Developer Guide

Comprehensive guide for developers working on the LIMS project.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Backend Development](#backend-development)
- [Frontend Development](#frontend-development)
- [Database Schema](#database-schema)
- [API Development](#api-development)
- [Testing](#testing)
- [Code Style & Standards](#code-style--standards)
- [Security Considerations](#security-considerations)
- [Performance Optimization](#performance-optimization)
- [Debugging](#debugging)
- [Contributing](#contributing)

---

## Development Environment Setup

### Prerequisites

Install the following tools:

**Required:**
- Rust 1.70+ ([rustup.rs](https://rustup.rs/))
- Node.js 16+ ([nodejs.org](https://nodejs.org/))
- Git ([git-scm.com](https://git-scm.com/))
- SQLite 3 ([sqlite.org](https://www.sqlite.org/))

**Recommended:**
- VS Code with extensions:
  - rust-analyzer
  - ESLint
  - Prettier
  - SQLite Viewer
- Postman or Insomnia (API testing)
- DB Browser for SQLite

### Initial Setup

```bash
# Clone repository
git clone https://github.com/Emil9405/LIMSgen.git
cd LIMSgen

# Backend setup
cp .env.example .env
# Edit .env with your settings
cargo build

# Frontend setup
cd lims-frontend
npm install

# Initialize database
cd ..
cargo run -- --init-db

# Run migrations (if any)
cargo run -- --migrate
```

### Running Development Servers

**Terminal 1 (Backend):**
```bash
# Run with hot reload
cargo watch -x run

# Or standard run
cargo run
```

**Terminal 2 (Frontend):**
```bash
cd lims-frontend
npm start
```

Backend: `http://127.0.0.1:8080`  
Frontend: `http://localhost:3000`

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# ... code ...

# Format code
cargo fmt
cd lims-frontend && npm run format

# Lint
cargo clippy
cd lims-frontend && npm run lint

# Test
cargo test
cd lims-frontend && npm test

# Commit
git add .
git commit -m "feat: add new feature"

# Push
git push origin feature/new-feature
```

---

## Project Structure

```
lims/
├── src/                          # Rust backend source
│   ├── main.rs                   # Application entry point
│   ├── models.rs                 # Data models & database schema
│   ├── db.rs                     # Database connection & utilities
│   ├── auth.rs                   # Authentication logic
│   ├── error.rs                  # Error types & handling
│   ├── config.rs                 # Configuration management
│   ├── handlers.rs               # General API handlers
│   ├── auth_handlers.rs          # Auth endpoints
│   ├── reagent_handlers.rs       # Reagent endpoints
│   ├── batch_handlers.rs         # Batch endpoints
│   ├── experiment_handlers.rs    # Experiment endpoints
│   ├── equipment_handlers.rs     # Equipment endpoints
│   ├── report_handlers.rs        # Report endpoints
│   ├── room_handlers.rs          # Room endpoints
│   ├── filter_handlers.rs        # Filter endpoints
│   ├── import_export.rs          # Import/export functionality
│   ├── jwt_rotation.rs           # JWT token management
│   ├── monitoring.rs             # Application monitoring
│   ├── validator.rs              # Input validation
│   └── query_builders/           # SQL query builders module
│       ├── mod.rs                # Module exports
│       ├── fts.rs                # Full-text search
│       ├── filters/              # Filter builders
│       │   ├── mod.rs
│       │   ├── builder.rs        # Filter builder implementation
│       │   ├── enums.rs          # Status enums
│       │   ├── value.rs          # Filter value types
│       │   └── whitelist.rs      # Field whitelisting
│       ├── sql/                  # SQL builders
│       │   ├── mod.rs
│       │   ├── select.rs         # SELECT query builder
│       │   └── count.rs          # COUNT query builder
│       └── utils/                # Utilities
│           ├── mod.rs
│           ├── validators.rs     # Field validators
│           └── time.rs           # Time utilities
│
├── lims-frontend/                # React frontend
│   ├── public/                   # Static files
│   │   └── index.html
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── Dashboard.js
│   │   │   ├── Reagents.js
│   │   │   ├── Experiments.js
│   │   │   ├── Equipment.js
│   │   │   ├── Users.js
│   │   │   ├── Reports.js
│   │   │   ├── Login.js
│   │   │   ├── Header.js
│   │   │   ├── Modal.js
│   │   │   ├── Table.js
│   │   │   └── ... (other components)
│   │   ├── App.js                # Main component
│   │   ├── api.js                # API client
│   │   ├── index.js              # Entry point
│   │   └── styles/               # CSS files
│   └── package.json
│
├── migrations/                   # Database migrations
├── tests/                        # Integration tests
├── docs/                         # Documentation
├── .env.example                  # Environment template
├── Cargo.toml                    # Rust dependencies
├── .gitignore
└── README.md
```

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────┐
│              Client (Browser)                   │
│            React Application                    │
└───────────────────┬─────────────────────────────┘
                    │ HTTP/REST
                    ▼
┌─────────────────────────────────────────────────┐
│           Actix-web Server                      │
│  ┌──────────────────────────────────────────┐   │
│  │        Middleware Stack                  │   │
│  │  • CORS                                  │   │
│  │  • JWT Authentication                    │   │
│  │  • Request Logging                       │   │
│  │  • Error Handler                         │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │         Route Handlers                   │   │
│  │  • Auth Handlers                         │   │
│  │  • Reagent Handlers                      │   │
│  │  • Experiment Handlers                   │   │
│  │  • ... (other handlers)                  │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │      Business Logic Layer                │   │
│  │  • Validation                            │   │
│  │  • Query Builders                        │   │
│  │  • Authorization                         │   │
│  └──────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────┘
                    │ SQLx
                    ▼
┌─────────────────────────────────────────────────┐
│         SQLite Database + FTS5                  │
│  • Users, Reagents, Batches                     │
│  • Experiments, Equipment                       │
│  • Full-text search indexes                     │
└─────────────────────────────────────────────────┘
```

### Request Flow

```
1. Client Request
   └─> 2. CORS Middleware
       └─> 3. JWT Validation
           └─> 4. Route Handler
               └─> 5. Input Validation
                   └─> 6. Business Logic
                       └─> 7. Query Builder (SQL)
                           └─> 8. Database Query
                               └─> 9. Response Serialization
                                   └─> 10. Client Response
```

---

## Backend Development

### Adding a New Endpoint

1. **Define the handler function:**

```rust
// src/my_new_handlers.rs
use actix_web::{web, HttpResponse, Result};
use crate::models::MyModel;
use crate::db::DbPool;

pub async fn get_my_data(
    pool: web::Data<DbPool>,
) -> Result<HttpResponse> {
    let conn = pool.get().await?;
    
    // Query database
    let data = sqlx::query_as::<_, MyModel>(
        "SELECT * FROM my_table"
    )
    .fetch_all(&conn)
    .await?;
    
    Ok(HttpResponse::Ok().json(data))
}
```

2. **Register the route:**

```rust
// src/main.rs
use actix_web::web;

fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/my-data", web::get().to(my_new_handlers::get_my_data))
    );
}
```

3. **Add authentication (if needed):**

```rust
use crate::auth::RequireAuth;

pub async fn protected_endpoint(
    pool: web::Data<DbPool>,
    auth: RequireAuth,  // This enforces authentication
) -> Result<HttpResponse> {
    let user_id = auth.user_id;
    // ... implementation
}
```

### Database Queries

**Using Query Builder:**

```rust
use crate::query_builders::{SafeQueryBuilder, FieldWhitelist};

let whitelist = FieldWhitelist::for_reagents();
let mut builder = SafeQueryBuilder::new("reagents")?
    .with_whitelist(&whitelist);

builder
    .add_exact_match("status", "active")
    .add_comparison("quantity", ">", 0)
    .order_by("name", "asc")
    .paginate(page, limit);

let (sql, params) = builder.build_select("*");
let reagents = sqlx::query_as::<_, Reagent>(&sql)
    .bind_all(params)
    .fetch_all(&pool)
    .await?;
```

**Direct Queries (use sparingly):**

```rust
let reagent = sqlx::query_as::<_, Reagent>(
    "SELECT * FROM reagents WHERE id = ?"
)
.bind(reagent_id)
.fetch_one(&pool)
.await?;
```

### Error Handling

```rust
use crate::error::{ApiError, ErrorResponse};

pub async fn my_handler() -> Result<HttpResponse, ApiError> {
    // This will automatically convert to proper HTTP error
    let data = some_function()
        .map_err(|e| ApiError::NotFound(format!("Resource not found: {}", e)))?;
    
    Ok(HttpResponse::Ok().json(data))
}
```

Custom error types in `src/error.rs`:

```rust
#[derive(Debug)]
pub enum ApiError {
    NotFound(String),
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    InternalError(String),
}

impl ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        match self {
            ApiError::NotFound(msg) => 
                HttpResponse::NotFound().json(ErrorResponse::new(msg)),
            // ... other variants
        }
    }
}
```

### Input Validation

```rust
use validator::Validate;
use serde::Deserialize;

#[derive(Debug, Deserialize, Validate)]
pub struct CreateReagentRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    
    #[validate(regex = "CAS_REGEX")]
    pub cas_number: String,
    
    #[validate(range(min = 0.0))]
    pub molecular_weight: Option<f64>,
}

pub async fn create_reagent(
    payload: web::Json<CreateReagentRequest>,
) -> Result<HttpResponse> {
    // Validate input
    payload.validate()
        .map_err(|e| ApiError::BadRequest(format!("Validation error: {}", e)))?;
    
    // Process request
    // ...
}
```

---

## Frontend Development

### Component Structure

```jsx
// src/components/MyComponent.js
import React, { useState, useEffect } from 'react';
import { api } from '../api';

function MyComponent() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    useEffect(() => {
        loadData();
    }, []);
    
    const loadData = async () => {
        try {
            setLoading(true);
            const response = await api.get('/my-endpoint');
            setData(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    if (loading) return <Loading />;
    if (error) return <ErrorMessage error={error} />;
    
    return (
        <div className="my-component">
            {/* Component JSX */}
        </div>
    );
}

export default MyComponent;
```

### API Calls

```javascript
// src/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8080/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            // Try to refresh token
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    const response = await axios.post('/api/auth/refresh', {
                        refresh_token: refreshToken
                    });
                    localStorage.setItem('access_token', response.data.access_token);
                    // Retry original request
                    return api(error.config);
                } catch (refreshError) {
                    // Redirect to login
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
```

### State Management

For simple state, use React hooks:

```jsx
// Global state with Context
import React, { createContext, useState, useContext } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
    const [user, setUser] = useState(null);
    const [notifications, setNotifications] = useState([]);
    
    const value = {
        user,
        setUser,
        notifications,
        addNotification: (notification) => {
            setNotifications([...notifications, notification]);
        },
    };
    
    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}
```

---

## Database Schema

### Main Tables

```sql
-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'guest')),
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reagents table
CREATE TABLE reagents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cas_number TEXT UNIQUE,
    formula TEXT,
    molecular_weight REAL,
    hazard_class TEXT,
    storage_conditions TEXT,
    description TEXT,
    supplier TEXT,
    catalog_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Batches table
CREATE TABLE batches (
    id TEXT PRIMARY KEY,
    reagent_id TEXT NOT NULL,
    lot_number TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    expiration_date DATE,
    received_date DATE,
    location TEXT,
    supplier TEXT,
    purchase_order TEXT,
    cost REAL,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reagent_id) REFERENCES reagents(id)
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE reagents_fts USING fts5(
    name,
    cas_number,
    formula,
    description,
    content=reagents,
    content_rowid=id
);
```

### Migrations

Create migration files in `migrations/` directory:

```sql
-- migrations/001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
    -- table definition
);

-- migrations/002_add_experiments.sql
CREATE TABLE IF NOT EXISTS experiments (
    -- table definition
);
```

Run migrations:

```bash
cargo run -- --migrate
```

---

## Testing

### Backend Tests

```rust
// tests/reagent_tests.rs
#[cfg(test)]
mod tests {
    use super::*;
    
    #[actix_rt::test]
    async fn test_create_reagent() {
        let pool = create_test_pool().await;
        
        let reagent = CreateReagentRequest {
            name: "Test Chemical".to_string(),
            cas_number: "123-45-6".to_string(),
            // ...
        };
        
        let result = create_reagent_handler(
            web::Data::new(pool),
            web::Json(reagent)
        ).await;
        
        assert!(result.is_ok());
    }
}
```

Run tests:

```bash
cargo test
```

### Frontend Tests

```javascript
// src/components/__tests__/MyComponent.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from '../MyComponent';

test('renders component correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('My Component')).toBeInTheDocument();
});

test('handles button click', () => {
    const mockHandler = jest.fn();
    render(<MyComponent onClick={mockHandler} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockHandler).toHaveBeenCalledTimes(1);
});
```

---

## Code Style & Standards

### Rust

Follow Rust conventions:
- Use `cargo fmt` for formatting
- Run `cargo clippy` for linting
- Document public APIs with `///` comments
- Use meaningful variable names
- Prefer `?` operator for error handling

### JavaScript

- Use ESLint and Prettier
- Functional components with hooks
- Destructure props
- Use async/await over promises
- PropTypes or TypeScript for type checking

---

## Security Considerations

1. **Never trust user input** - validate everything
2. **Use parameterized queries** - prevent SQL injection
3. **Hash passwords** - use bcrypt
4. **Validate JWT tokens** - check expiration and signature
5. **Sanitize output** - prevent XSS
6. **Use HTTPS in production**
7. **Keep dependencies updated**
8. **Review security guides** regularly

---

## Performance Optimization

- Use database indexes
- Implement pagination
- Cache frequently accessed data
- Use connection pooling
- Optimize SQL queries
- Compress responses
- Use CDN for static assets

---

## Debugging

**Backend:**
```bash
# Enable debug logging
RUST_LOG=debug cargo run

# Use rust-gdb or lldb
cargo build
rust-gdb ./target/debug/lims
```

**Frontend:**
- Use React DevTools
- Browser DevTools Network tab
- Console logging (remove in production)

---

For more information, see [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) and [API_REFERENCE.md](../api/API_REFERENCE.md).
