# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use the slim variant to keep the image small; alpine can cause issues with
# native addons (bcrypt uses bcryptjs — pure JS, so alpine is safe here).
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDeps needed for tsc)
RUN npm ci

# Copy source and compile
COPY src/ ./src/
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

# Copy only production manifests and install prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Run as a non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
