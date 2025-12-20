# API Reference

Complete API documentation for LIMS system.

## Base URL

```
http://127.0.0.1:8080/api
```

For production, replace with your actual domain.

---

## Table of Contents

- [Authentication](#authentication)
- [Users](#users)
- [Reagents](#reagents)
- [Batches](#batches)
- [Experiments](#experiments)
- [Equipment](#equipment)
- [Rooms](#rooms)
- [Reports](#reports)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Authentication

### POST /api/auth/login

Authenticate user and receive JWT tokens.

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "admin",
    "email": "admin@lab.com",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Errors:**
- `401 Unauthorized` - Invalid credentials
- `400 Bad Request` - Missing required fields

---

### POST /api/auth/refresh

Refresh access token using refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Errors:**
- `401 Unauthorized` - Invalid or expired refresh token

---

### POST /api/auth/logout

Logout user and invalidate tokens.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "message": "Successfully logged out"
}
```

---

## Users

**Permissions:** Admin only

### GET /api/users

List all users with pagination.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `role` (optional): Filter by role (admin, user, guest)
- `search` (optional): Search by username or email

**Example:**
```
GET /api/users?page=1&limit=20&role=user
```

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john_doe",
      "email": "john@lab.com",
      "role": "user",
      "active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

---

### POST /api/users

Create a new user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "username": "jane_smith",
  "email": "jane@lab.com",
  "password": "SecurePass123!",
  "role": "user",
  "active": true
}
```

**Response (201 Created):**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "username": "jane_smith",
  "email": "jane@lab.com",
  "role": "user",
  "active": true,
  "created_at": "2024-01-20T00:00:00Z"
}
```

**Errors:**
- `400 Bad Request` - Validation error
- `409 Conflict` - Username or email already exists
- `403 Forbidden` - Insufficient permissions

---

### GET /api/users/:id

Get user details by ID.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "john@lab.com",
  "role": "user",
  "active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z",
  "last_login": "2024-01-20T10:30:00Z"
}
```

**Errors:**
- `404 Not Found` - User not found

---

### PUT /api/users/:id

Update user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "email": "newemail@lab.com",
  "role": "admin",
  "active": true
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "newemail@lab.com",
  "role": "admin",
  "active": true,
  "updated_at": "2024-01-20T12:00:00Z"
}
```

---

### DELETE /api/users/:id

Delete a user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (204 No Content)**

**Errors:**
- `404 Not Found` - User not found
- `403 Forbidden` - Cannot delete yourself or last admin

---

## Reagents

### GET /api/reagents

List all reagents with filtering and pagination.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `search` (optional): Full-text search
- `hazard_class` (optional): Filter by hazard class
- `status` (optional): Filter by status (active, low_stock, out_of_stock)
- `sort` (optional): Sort field (name, cas_number, created_at)
- `order` (optional): Sort order (asc, desc)

**Example:**
```
GET /api/reagents?search=sodium&hazard_class=flammable&page=1
```

**Response (200 OK):**
```json
{
  "reagents": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Sodium Chloride",
      "cas_number": "7647-14-5",
      "formula": "NaCl",
      "molecular_weight": 58.44,
      "hazard_class": "non_hazardous",
      "storage_conditions": "Room temperature, dry",
      "description": "Common salt",
      "total_quantity": 5000.0,
      "unit": "g",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "total_pages": 3
}
```

---

### POST /api/reagents

Create a new reagent.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "Acetone",
  "cas_number": "67-64-1",
  "formula": "C3H6O",
  "molecular_weight": 58.08,
  "hazard_class": "flammable",
  "storage_conditions": "Cool, well-ventilated area",
  "description": "Organic solvent",
  "supplier": "Sigma-Aldrich",
  "catalog_number": "A1234"
}
```

**Response (201 Created):**
```json
{
  "id": "234e4567-e89b-12d3-a456-426614174001",
  "name": "Acetone",
  "cas_number": "67-64-1",
  "formula": "C3H6O",
  "molecular_weight": 58.08,
  "hazard_class": "flammable",
  "storage_conditions": "Cool, well-ventilated area",
  "description": "Organic solvent",
  "total_quantity": 0.0,
  "unit": "mL",
  "status": "out_of_stock",
  "created_at": "2024-01-20T00:00:00Z"
}
```

**Errors:**
- `400 Bad Request` - Validation error
- `409 Conflict` - CAS number already exists

---

### GET /api/reagents/:id

Get reagent details including all batches.

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Sodium Chloride",
  "cas_number": "7647-14-5",
  "formula": "NaCl",
  "molecular_weight": 58.44,
  "hazard_class": "non_hazardous",
  "storage_conditions": "Room temperature, dry",
  "description": "Common salt",
  "total_quantity": 5000.0,
  "unit": "g",
  "status": "active",
  "batches": [
    {
      "id": "345e4567-e89b-12d3-a456-426614174002",
      "lot_number": "LOT123456",
      "quantity": 1000.0,
      "expiration_date": "2025-12-31",
      "location": "Cabinet A, Shelf 2",
      "status": "available"
    }
  ],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

---

### PUT /api/reagents/:id

Update reagent information.

**Request:**
```json
{
  "name": "Sodium Chloride (99.9%)",
  "description": "High purity common salt",
  "storage_conditions": "Room temperature, dry, dark"
}
```

**Response (200 OK):**
Returns updated reagent object.

---

### DELETE /api/reagents/:id

Delete a reagent (soft delete if batches exist).

**Response (204 No Content)**

---

### GET /api/reagents/search

Full-text search across reagents.

**Query Parameters:**
- `q` (required): Search query
- `limit` (optional): Max results (default: 20)

**Example:**
```
GET /api/reagents/search?q=sodium chloride
```

**Response (200 OK):**
```json
{
  "results": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Sodium Chloride",
      "cas_number": "7647-14-5",
      "formula": "NaCl",
      "match_score": 0.95
    }
  ],
  "total": 1
}
```

---

## Batches

### GET /api/batches

List all batches with filtering.

**Query Parameters:**
- `reagent_id` (optional): Filter by reagent
- `status` (optional): available, low_stock, expired, reserved
- `expiring_soon` (optional): true/false (within 30 days)
- `location` (optional): Filter by storage location

**Response (200 OK):**
```json
{
  "batches": [
    {
      "id": "345e4567-e89b-12d3-a456-426614174002",
      "reagent_id": "123e4567-e89b-12d3-a456-426614174000",
      "reagent_name": "Sodium Chloride",
      "lot_number": "LOT123456",
      "quantity": 1000.0,
      "unit": "g",
      "expiration_date": "2025-12-31",
      "received_date": "2024-01-01",
      "location": "Cabinet A, Shelf 2",
      "supplier": "Sigma-Aldrich",
      "status": "available",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20
}
```

---

### POST /api/batches

Create a new batch.

**Request:**
```json
{
  "reagent_id": "123e4567-e89b-12d3-a456-426614174000",
  "lot_number": "LOT789012",
  "quantity": 500.0,
  "unit": "g",
  "expiration_date": "2026-06-30",
  "received_date": "2024-01-20",
  "location": "Cabinet B, Shelf 1",
  "supplier": "Fisher Scientific",
  "purchase_order": "PO-2024-001",
  "cost": 50.00,
  "notes": "High purity grade"
}
```

**Response (201 Created):**
Returns created batch object.

---

### PUT /api/batches/:id

Update batch (typically quantity or location).

**Request:**
```json
{
  "quantity": 450.0,
  "location": "Cabinet A, Shelf 3",
  "notes": "Moved to new location"
}
```

**Response (200 OK):**
Returns updated batch object.

---

### GET /api/batches/expiring

Get batches expiring soon.

**Query Parameters:**
- `days` (optional): Days threshold (default: 30)

**Response (200 OK):**
```json
{
  "expiring_batches": [
    {
      "id": "345e4567-e89b-12d3-a456-426614174002",
      "reagent_name": "Acetone",
      "lot_number": "LOT999",
      "quantity": 200.0,
      "expiration_date": "2024-02-15",
      "days_until_expiration": 25,
      "location": "Cabinet C"
    }
  ],
  "total": 5
}
```

---

## Experiments

### GET /api/experiments

List experiments with filtering.

**Query Parameters:**
- `status` (optional): planned, in_progress, completed, cancelled
- `start_date` (optional): Filter from date (ISO 8601)
- `end_date` (optional): Filter to date
- `room_id` (optional): Filter by room
- `researcher` (optional): Filter by researcher name

**Response (200 OK):**
```json
{
  "experiments": [
    {
      "id": "456e4567-e89b-12d3-a456-426614174003",
      "title": "Synthesis of Aspirin",
      "description": "Esterification reaction to produce acetylsalicylic acid",
      "status": "in_progress",
      "start_time": "2024-01-20T09:00:00Z",
      "end_time": "2024-01-20T17:00:00Z",
      "room_id": "room-101",
      "room_name": "Organic Chemistry Lab",
      "researcher": "Dr. Jane Smith",
      "created_by": "jane_smith",
      "reagents": [
        {
          "reagent_id": "123e4567-e89b-12d3-a456-426614174000",
          "name": "Salicylic Acid",
          "quantity": 10.0,
          "unit": "g"
        }
      ],
      "equipment": [
        {
          "equipment_id": "eq-001",
          "name": "Rotary Evaporator"
        }
      ],
      "created_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20
}
```

---

### POST /api/experiments

Schedule a new experiment.

**Request:**
```json
{
  "title": "Protein Crystallization",
  "description": "Crystallization of lysozyme",
  "procedure": "1. Prepare protein solution\n2. Set up crystallization plates\n3. Incubate at 20°C",
  "status": "planned",
  "start_time": "2024-01-25T10:00:00Z",
  "end_time": "2024-01-25T16:00:00Z",
  "room_id": "room-201",
  "researcher": "Dr. John Doe",
  "reagents": [
    {
      "reagent_id": "123...",
      "quantity": 5.0,
      "unit": "mg"
    }
  ],
  "equipment_ids": ["eq-001", "eq-002"],
  "notes": "Temperature critical"
}
```

**Response (201 Created):**
Returns created experiment object.

---

### GET /api/experiments/calendar

Get experiments for calendar view.

**Query Parameters:**
- `start` (required): Start date (ISO 8601)
- `end` (required): End date (ISO 8601)
- `room_id` (optional): Filter by room

**Response (200 OK):**
```json
{
  "events": [
    {
      "id": "456e4567-e89b-12d3-a456-426614174003",
      "title": "Synthesis of Aspirin",
      "start": "2024-01-20T09:00:00Z",
      "end": "2024-01-20T17:00:00Z",
      "room": "Organic Chemistry Lab",
      "researcher": "Dr. Jane Smith",
      "status": "in_progress"
    }
  ]
}
```

---

## Equipment

### GET /api/equipment

List all equipment.

**Query Parameters:**
- `status` (optional): available, in_use, maintenance, broken
- `room_id` (optional): Filter by room
- `type` (optional): Filter by equipment type

**Response (200 OK):**
```json
{
  "equipment": [
    {
      "id": "eq-001",
      "name": "Rotary Evaporator",
      "model": "Buchi R-300",
      "serial_number": "SN123456",
      "type": "evaporator",
      "status": "available",
      "room_id": "room-101",
      "room_name": "Organic Chemistry Lab",
      "last_maintenance": "2024-01-01",
      "next_maintenance": "2024-04-01",
      "notes": "Regular maintenance required",
      "created_at": "2023-01-01T00:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

### POST /api/equipment

Add new equipment.

**Request:**
```json
{
  "name": "HPLC System",
  "model": "Agilent 1260",
  "serial_number": "SN789012",
  "type": "chromatography",
  "manufacturer": "Agilent",
  "purchase_date": "2024-01-15",
  "room_id": "room-201",
  "status": "available",
  "maintenance_interval_days": 90,
  "notes": "High performance liquid chromatography"
}
```

**Response (201 Created):**
Returns created equipment object.

---

### PUT /api/equipment/:id

Update equipment status or information.

**Request:**
```json
{
  "status": "maintenance",
  "notes": "Pump replacement in progress",
  "last_maintenance": "2024-01-20"
}
```

---

## Reports

### GET /api/reports/reagents

Generate reagent inventory report.

**Query Parameters:**
- `format` (optional): json, csv, xlsx (default: json)
- `status` (optional): Filter by status
- `hazard_class` (optional): Filter by hazard class

**Response (200 OK):**
```json
{
  "report_date": "2024-01-20T12:00:00Z",
  "total_reagents": 150,
  "total_value": 25000.00,
  "by_status": {
    "active": 120,
    "low_stock": 20,
    "out_of_stock": 10
  },
  "by_hazard_class": {
    "flammable": 30,
    "toxic": 25,
    "corrosive": 20,
    "non_hazardous": 75
  },
  "reagents": [...]
}
```

---

### GET /api/reports/batches

Generate batch report with expiration tracking.

**Query Parameters:**
- `format` (optional): json, csv, xlsx
- `expiring_within_days` (optional): Filter expiring batches

**Response (200 OK):**
```json
{
  "report_date": "2024-01-20T12:00:00Z",
  "total_batches": 200,
  "expiring_soon": 15,
  "expired": 5,
  "total_value": 50000.00,
  "batches": [...]
}
```

---

### GET /api/reports/experiments

Generate experiment history report.

**Query Parameters:**
- `start_date` (required): Start date
- `end_date` (required): End date
- `status` (optional): Filter by status
- `researcher` (optional): Filter by researcher

**Response (200 OK):**
```json
{
  "report_date": "2024-01-20T12:00:00Z",
  "period": {
    "start": "2024-01-01",
    "end": "2024-01-20"
  },
  "total_experiments": 50,
  "by_status": {
    "completed": 35,
    "in_progress": 10,
    "cancelled": 5
  },
  "experiments": [...]
}
```

---

### POST /api/reports/export

Export data in various formats.

**Request:**
```json
{
  "type": "reagents",  // or "batches", "experiments", "equipment"
  "format": "xlsx",    // or "csv", "json"
  "filters": {
    "status": "active",
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    }
  }
}
```

**Response (200 OK):**
Returns file download or URL to download.

---

## Error Handling

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    },
    "timestamp": "2024-01-20T12:00:00Z",
    "request_id": "req-123456"
  }
}
```

### Error Codes

- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `422 Unprocessable Entity` - Validation failed
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## Rate Limiting

(Coming soon)

- 100 requests per minute per IP
- 1000 requests per hour per user
- Headers included in response:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

## Changelog

### v0.1.0 (2024-01-20)
- Initial API release
- Authentication endpoints
- CRUD operations for all resources
- Basic reporting

---

For questions or issues, please open an issue on GitHub.
