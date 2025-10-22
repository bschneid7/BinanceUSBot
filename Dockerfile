This version adds a proper build step for the server and client, installs necessary build tools for native dependencies (@tensorflow/tfjs-node), and runs the application using node directly.

Dockerfile
# ---- Base Node ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init python3 make g++ git # Add git for potential private repo installs

# ---- Shared Dependencies & Build ----
FROM base AS shared-builder
COPY shared/package*.json ./shared/
RUN cd shared && npm install --legacy-peer-deps
COPY shared/ ./shared/
RUN cd shared && npm run build

# ---- Server Dependencies & Build ----
FROM base AS server-builder
COPY server/package*.json ./server/
# Copy built shared package
COPY --from=shared-builder /app/shared ./shared
RUN cd server && npm install --legacy-peer-deps
COPY server/ ./server/
RUN cd server && npm run build

# ---- Client Dependencies & Build ----
FROM base AS client-builder
COPY client/package*.json ./client/
# Copy built shared package
COPY --from=shared-builder /app/shared ./shared
RUN cd client && npm install --legacy-peer-deps
COPY client/ ./client/
RUN cd client && npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production
WORKDIR /app

# Install runtime dependencies needed for tfjs-node
RUN apk add --no-cache dumb-init python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S botuser && \
    adduser -S -u 1001 -G botuser botuser

# Copy necessary package files for production install
COPY --chown=botuser:botuser server/package.json server/package-lock.json ./server/
COPY --chown=botuser:botuser --from=shared-builder /app/shared ./shared

# Install server production dependencies ONLY
RUN cd server && npm ci --omit=dev

# Copy built artifacts
COPY --chown=botuser:botuser --from=server-builder /app/server/dist ./server/dist
COPY --chown=botuser:botuser --from=client-builder /app/client/dist ./client/dist

# Copy scripts and static files that might be needed at runtime
COPY --chown=botuser:botuser server/scripts ./server/scripts

# Switch to non-root user
USER botuser

EXPOSE ${PORT:-3000}

# Health check (pointing to the correct port)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application using built JS file
CMD ["node", "server/dist/server.js"]

Explanation of Dockerfile Changes:

Multi-stage Builds: Separated dependency installation and building for shared, server, and client to optimize caching and reduce final image size.

Explicit Build: Each stage now runs npm run build.

Production Dependencies: The final production stage installs only production dependencies for the server using npm ci --omit=dev.

Copy Built Artifacts: Copies the dist folders from the builder stages into the final image.

Native Dependencies: Installs python3, make, and g++ in the final production stage, as @tensorflow/tfjs-node might need them at runtime or during installation.

CMD: Starts the application using the compiled server/dist/server.js file with node.

Healthcheck: Updated to use the correct port variable (${PORT:-3000}).

Instructions
Replace File Contents: Carefully replace the entire content of the following files in your project with the code provided above:

client/src/pages/Analytics.tsx

client/src/pages/MLDashboard.tsx

Dockerfile (the one in the root of your project)