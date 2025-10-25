# Use Debian-based image for TensorFlow compatibility
FROM node:20-bullseye

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
RUN cd server && npm install --legacy-peer-deps

# Copy all application code
ARG CACHEBUST=1
ARG CACHEBUST=2
ARG CACHEBUST=3
COPY . .

# Expose port
EXPOSE 3000

# Start application using tsx (no pre-compilation needed)
CMD ["npx", "tsx", "server/server.ts"]
