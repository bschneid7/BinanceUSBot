# Multi-stage build for BinanceUSBot
FROM node:20-alpine AS base

# Install Python and system dependencies for PPO/ML
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev \
    linux-headers

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules

# Copy source code
COPY . .

# Build shared package first
WORKDIR /app/shared
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm run build

# Build client
WORKDIR /app/client
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install Python packages for ML/sentiment proxy
RUN pip3 install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 botuser

# Copy necessary files
COPY --from=builder --chown=botuser:nodejs /app/package*.json ./
COPY --from=builder --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=botuser:nodejs /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=botuser:nodejs /app/server/package*.json ./server/
COPY --from=builder --chown=botuser:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=botuser:nodejs /app/shared/node_modules ./shared/node_modules
COPY --from=builder --chown=botuser:nodejs /app/shared/package*.json ./shared/
COPY --from=builder --chown=botuser:nodejs /app/client/dist ./client/dist

# Switch to non-root user
USER botuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/ping', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "server/dist/server.js"]
