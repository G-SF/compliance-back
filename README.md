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
| LLM | Ollama (local — mistral / llama3:8b) |
| File uploads | multer (memory storage) |
| HTTP client | axios |
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
│       ├── ai.interface.ts  # IAiService contract
│       ├── ai.service.ts    # Ollama implementation (HTTP → llm:11434)
│       ├── ai.controller.ts # generate + generate-with-files handlers
│       ├── ai.routes.ts     # Router + multer file upload config
│       └── ai.dto.ts        # Input validation
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

### AI (`/api/v1/ai`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/generate` | — | Send prompt + context to LLM |
| POST | `/generate-with-files` | — | Send prompt + context + files to LLM |

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

## AI Integration (LLaMA / Mistral via Ollama)

The `src/modules/ai/` module connects to a local [Ollama](https://ollama.com) container.

### Running with Docker (recommended)

```bash
# docker-compose starts Ollama and pulls the model automatically
docker-compose up --build
```

The `llm` service pulls the model on first start (cached in a named volume).  
Subsequent starts skip the pull — model is already on disk.

### Running locally (without Docker)

```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Start the server
ollama serve

# 3. Pull a model (one-time)
ollama pull mistral          # ~4 GB
# or
ollama pull llama3:8b        # ~4.7 GB

# 4. Set env vars in .env
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=mistral
```

### Switching models

Change `LLM_MODEL` in your `.env` file to any model available via `ollama list`.  
The model must be pulled before use.

### Example curl commands

**Simple prompt:**
```bash
curl -s -X POST http://localhost:3000/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is a REST API?", "context": "Answer in 2 sentences."}' | jq
```

**Prompt + file:**
```bash
curl -s -X POST http://localhost:3000/api/v1/ai/generate-with-files \
  -F "prompt=Summarize this file" \
  -F "context=Be concise" \
  -F "files=@./README.md" | jq
```

### Response format

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "response": "A REST API is an architectural style...",
    "model": "mistral"
  }
}
```

### File upload constraints

| Field | Value |
|---|---|
| Accepted formats | `.txt`, `.json`, `.md` |
| Max size per file | 5 MB |
| Multiple files | Yes (`files[]`) |

---

## AI Integration (Future — swap model)

To use a different model, update `LLM_MODEL` in `.env` and run `ollama pull <model>`.  
The `IAiService` interface in [src/modules/ai/ai.interface.ts](src/modules/ai/ai.interface.ts) remains stable — swap the implementation in [src/modules/ai/ai.service.ts](src/modules/ai/ai.service.ts) to point at any provider.

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
| `LLM_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |
| `LLM_MODEL` | No | `mistral` | Model to use for generation |
