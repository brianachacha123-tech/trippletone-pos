FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Copy frontend build
COPY frontend/dist ./frontend/dist/

EXPOSE 5000

CMD ["node", "src/server.js"]
