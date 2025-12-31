# Use a stable Node LTS image
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

EXPOSE 3000

# Start server
CMD ["node", "index.js"]