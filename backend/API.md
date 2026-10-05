# MindPC Backend API Documentation

All responses use the standard JSON envelope:
- **Success:** `{ "success": true, "data": ... }`
- **Error:** `{ "success": false, "message": "..." }`

Base URL: `http://localhost:3001`

---

## Table of Contents
1. [Health](#1-health-check)
2. [Authentication](#2-authentication)
   - [Register](#post-apiauthregister)
   - [Login](#post-apiauthlogin)
   - [Get Current User](#get-apiauthme)
3. [Devices](#3-devices)
   - [Register or Get Device](#post-apidevices)
4. [Sessions](#4-sessions)
   - [Bulk Upload Sessions](#post-apisessionsbulk)
   - [List Sessions by Date](#get-apisessions)
5. [Statistics](#5-statistics)
   - [Daily Usage Breakdown](#get-apistatsdaily)
   - [Application Usage Breakdown](#get-apistatsapps)

---

## 1. Health Check

### `GET /api/health`
Verifies that the server is running and the database connection is alive.

- **Auth Required:** No
- **Query Params:** None
- **Body:** None
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "db": "connected"
    }
  }
  ```
- **Error Codes:**
  - `500 Internal Server Error`: Database unreachable.

---

## 2. Authentication

### `POST /api/auth/register`
Creates a new user account.

- **Auth Required:** No
- **Request Body:**
  ```json
  {
    "name": "Aman",
    "email": "aman@example.com",
    "password": "secretpassword"
  }
  ```
- **Success Response (201):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": 1,
        "name": "Aman",
        "email": "aman@example.com",
        "created_at": "2026-10-06T00:00:00.000Z"
      }
    }
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing field, invalid email format, or password < 6 characters.
  - `409 Conflict`: Email already registered.

---

### `POST /api/auth/login`
Authenticates a user and issues a 7-day JWT.

- **Auth Required:** No
- **Request Body:**
  ```json
  {
    "email": "aman@example.com",
    "password": "secretpassword"
  }
  ```
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 1,
        "name": "Aman",
        "email": "aman@example.com"
      }
    }
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing email or password.
  - `401 Unauthorized`: `"Invalid email or password"` (generic message).

---

### `GET /api/auth/me`
Fetches current user profile from the verified token.

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Query Params:** None
- **Body:** None
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": 1,
        "name": "Aman",
        "email": "aman@example.com",
        "created_at": "2026-10-06T00:00:00.000Z"
      }
    }
  }
  ```
- **Error Codes:**
  - `401 Unauthorized`: Missing, expired, or invalid token.
  - `404 Not Found`: User row not found.

---

## 3. Devices

### `POST /api/devices`
Registers a device for the logged-in user. If a device with the same `deviceName` already exists for this user, it returns the existing record (idempotent).

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Request Body:**
  ```json
  {
    "deviceName": "Main Desktop",
    "platform": "win32"
  }
  ```
- **Success Response (201 if created, 200 if already exists):**
  ```json
  {
    "success": true,
    "data": {
      "device": {
        "id": 1,
        "device_name": "Main Desktop",
        "platform": "win32",
        "created_at": "2026-10-06T00:00:00.000Z"
      },
      "created": true
    }
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing `deviceName` or `platform`.
  - `401 Unauthorized`: Missing or invalid token.

---

## 4. Sessions

### `POST /api/sessions/bulk`
Uploads a batch of completed application sessions. Idempotent: sessions with existing `clientSessionId` are skipped via `ON CONFLICT DO NOTHING`.

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Request Body:**
  ```json
  {
    "deviceId": 1,
    "sessions": [
      {
        "clientSessionId": "550e8400-e29b-41d4-a716-446655440000",
        "appName": "Visual Studio Code",
        "appIdentifier": "code.exe",
        "startTime": "2026-10-06T04:30:00.000Z",
        "endTime": "2026-10-06T05:30:00.000Z",
        "durationSeconds": 3600
      }
    ]
  }
  ```
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "total": 1,
      "inserted": 1,
      "skipped": 0
    }
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing fields, invalid timestamps, or `endTime <= startTime`.
  - `401 Unauthorized`: Missing or invalid token.
  - `403 Forbidden`: `deviceId` does not belong to the logged-in user.

---

### `GET /api/sessions`
Fetches all individual sessions for a given calendar day, ordered by `start_time` ascending.

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Query Parameters:**
  - `date` *(required)*: Date formatted as `YYYY-MM-DD`
  - `tz` *(optional)*: Timezone name (default: `Asia/Kolkata`)
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 12,
        "app_name": "Visual Studio Code",
        "app_identifier": "code.exe",
        "start_time": "2026-10-06T04:30:00.000Z",
        "end_time": "2026-10-06T05:30:00.000Z",
        "duration_seconds": 3600
      }
    ]
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing `date` or invalid format.
  - `401 Unauthorized`: Missing or invalid token.

---

## 5. Statistics

### `GET /api/stats/daily`
Returns total usage in seconds for every calendar day in the range `[from, to]`. Gapless: days with no activity return `duration: 0`.

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Query Parameters:**
  - `from` *(required)*: Start date (`YYYY-MM-DD`)
  - `to` *(required)*: End date (`YYYY-MM-DD`)
  - `tz` *(optional)*: Timezone name (default: `Asia/Kolkata`)
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": [
      { "date": "2026-10-03T00:00:00.000Z", "duration": 5400 },
      { "date": "2026-10-04T00:00:00.000Z", "duration": 0 },
      { "date": "2026-10-05T00:00:00.000Z", "duration": 3600 }
    ]
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing parameters, invalid date, or `from > to`.
  - `401 Unauthorized`: Missing or invalid token.

---

### `GET /api/stats/apps`
Returns total usage in seconds grouped by application for a specific calendar date, sorted descending by total duration.

- **Auth Required:** Yes (`Authorization: Bearer <token>`)
- **Query Parameters:**
  - `date` *(required)*: Target date (`YYYY-MM-DD`)
  - `tz` *(optional)*: Timezone name (default: `Asia/Kolkata`)
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": [
      { "name": "Google Chrome", "duration": 3600 },
      { "name": "Visual Studio Code", "duration": 1800 }
    ]
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: Missing or invalid `date`.
  - `401 Unauthorized`: Missing or invalid token.
