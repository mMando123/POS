FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/
COPY data/ ./data/ 2>/dev/null || true

# Create required directories
RUN mkdir -p uploads data logs backups exports

EXPOSE 3001

CMD ["node", "src/server.js"]
