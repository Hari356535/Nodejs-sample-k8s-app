#  Build stage 
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

#  Runtime stage 
FROM node:20-alpine

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN apk add --no-cache curl && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
