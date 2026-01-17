FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1000 nodeapp && \
    adduser -D -u 1000 -G nodeapp nodeapp && \
    chown -R nodeapp:nodeapp /app

USER nodeapp

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/server.js"]
