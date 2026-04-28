# Backend API

Production-ready Node.js + TypeScript backend with JWT authentication, MongoDB, and Redis.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Express 4 |
| Database | MongoDB 7 (Mongoose) |
| Cache / Sessions | Redis 7 (ioredis) |
| Auth | JWT (access + refresh tokens) |
| Password hashing | bcryptjs |
| Containerisation | Docker + docker-compose |

---

## Project Structure

```
src/
├── main.ts                  # Entry point — env, DB, Redis, HTTP server
├── app.ts                   # Express app factory
├── config/
│   └── index.ts             # Centralised env-var config
├── database/
│   └── connection.ts        # MongoDB connection with retry
├── infra/
│   └── redis/
│       ├── client.ts        # ioredis singleton
│       └── redis.service.ts # Typed Redis helpers
├── modules/
│   ├── auth/
│   │   ├── models/
│   │   │   └── user.model.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.routes.ts
│   │   └── auth.dto.ts
│   └── ai/
│       ├── ai.interface.ts  # IAiService contract (LLaMA 8B ready)
│       └── ai.service.ts    # Placeholder — swap for real provider
└── shared/
    ├── middleware/
    │   ├── auth.middleware.ts
    │   └── error.middleware.ts
    └── utils/
        ├── response.util.ts  # Standardised API envelope
        └── logger.ts
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379`

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — set strong JWT secrets at minimum

# 3. Start in development mode (hot-reload)
npm run dev
```

The server starts on `http://localhost:3000`.

### Other scripts

```bash
npm run build    # Compile TypeScript → dist/
npm start        # Run compiled output (production mode)
npm run lint     # ESLint
npm run format   # Prettier
```

---

## Running with Docker

### Prerequisites

- Docker Engine 24+
- Docker Compose v2

### Setup

```bash
# 1. Copy env file and set strong secrets
cp .env.example .env

# 2. Build and start all services (API + MongoDB + Redis)
docker-compose up --build

# Stop
docker-compose down

# Stop and remove all data volumes
docker-compose down -v
```

All three services (`api`, `mongo`, `redis`) communicate over an isolated Docker network. MongoDB and Redis ports are **not** exposed to the host by default.

---

## API Endpoints

### Health

```
GET /health
```

### Auth (`/api/v1/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create a new account |
| POST | `/login` | — | Login, receive token pair |
| POST | `/refresh` | — | Rotate refresh token |
| POST | `/logout` | — | Invalidate refresh token |
| GET | `/me` | Bearer JWT | Get current user info |

#### Register

```json
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "strongPassword123"
}
```

#### Login

```json
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "strongPassword123"
}
```

Response:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "<15-min JWT>",
    "refreshToken": "<7-day JWT stored in Redis>"
  }
}
```

#### Refresh tokens

```json
POST /api/v1/auth/refresh
{
  "refreshToken": "<previously issued refresh token>"
}
```

#### Logout

```json
POST /api/v1/auth/logout
{
  "refreshToken": "<refresh token to invalidate>"
}
```

#### Protected route

```
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

---

## AI Integration (Future — LLaMA 8B)

The `src/modules/ai/` module is a placeholder ready for LLaMA 8B integration.

### Options

| Option | Description |
|---|---|
| **Ollama** (recommended) | `ollama run llama3`, implement `OllamaAiService` against `POST http://localhost:11434/api/generate` |
| **llama.cpp server** | Build with `--server`, implement `LlamaCppAiService` against `POST http://localhost:8080/completion` |
| **Remote endpoint** | Store URL + key in `.env`, implement `RemoteAiService` |

To activate: implement `IAiService` (see [src/modules/ai/ai.interface.ts](src/modules/ai/ai.interface.ts)) and swap the export in [src/modules/ai/ai.service.ts](src/modules/ai/ai.service.ts).

---

## Environment Variables

See [.env.example](.env.example) for a full reference.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `JWT_SECRET` | **Yes** | — | Access token signing secret |
| `JWT_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token signing secret |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | `""` | Redis password (if any) |
