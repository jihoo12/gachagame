# Gacha System API Documentation

This project implements a back-end service for managing user accounts and handling virtual gacha mechanics using Axum and SQLite.

## Setup

### Prerequisites
The system requires Rust and Cargo installed. Database migrations must be executed before running the server.

### Database Migration
Run the following command to initialize or update the database schema:

```bash
cargo sqlx migrate run
```

## Running the Server

The server connects to the database located at `sqlite://gacha.db` (or `$DATABASE_URL` if set via environment variable).

To start the service, execute:

```bash
# Assuming project structure requires this command for local execution
cargo run 
```

## API Endpoints Reference

All endpoints utilize session management and require valid user authentication where specified. `API_BASE` is assumed to be `http://localhost:3000`.

### Authentication & User Management

| Method | Path | Description | Request Body (JSON) | Response | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/register` | Registers a new user account. | `{"username": "...", "nickname": "...", "password": "..."}` | `{status_code: 201, body: MeResponse}` | Validation Rules:<br>• Username: 4–20 alphanumeric characters or underscores.<br>• Nickname: 1–20 characters.<br>• Password: Minimum 6 characters. |
| **GET** | `/me` | Retrieves the currently logged-in user's profile data. | N/A | `MeResponse` | Requires active session cookie for identification. Returns `total_draws`, `nickname`, and `session_id`. |
| **POST** | `/logout` | Logs the current user out of the service. | N/A | (None) | Invalidates the user's session and redirects client to the login page. |

### Core Functionality Endpoints

#### 1. Status Check (`/health`)

*   **Method:** `GET`
*   **Path:** `/health`
*   **Purpose:** Reports the operational status of the service instance.
*   **Response Body Example:** `{"status": "ok", "character_count": 50}`

#### 2. Archive Lookup (`/archive`)

*   **Method:** `GET`
*   **Path:** `/archive`
*   **Purpose:** Retrieves a list of all stored character entries for the academic compendium.
*   **Response Body Example (Array):** Contains objects adhering to the `ArchiveEntry` structure, which includes a `Character` object and an `unlocked` boolean status.

#### 3. Gacha Drawing Logic (`/pull`)

This endpoint handles the mechanics of character drawing based on gold expenditure.
*   **Method:** `POST`
*   **Path:** `/pull`
*   **Request Body (JSON):** `{"times": N}` where `N` is a positive integer representing the number of times to draw.
*   **Logic:** The system rolls grades based on weighted probabilities:
    *   UR: < 3% chance
    *   SSR: < 20% chance
    *   RARE: < 55% chance
    *   COMMON: >= 55% chance
*   **Response Body Example:** `{"total_draws": i64, "gold": i64, "results": [Character, ...]}`

***

### Models Used in API Responses

*   **`UserRow`**: Contains user persistence data: `id`, `session_id`, `username`, `password_hash`, `nickname`, `total_draws` (i64), and `gold` (i64).
*   **`Character`**: Defines a character asset: `name` (String), `grade` (Enum: COMMON, RARE, SSR, UR), `image_url` (String), and `content` (String).
*   **Grade Enum**: Represents character rarities. The internal order for processing is **UR > SSR > RARE > COMMON**.