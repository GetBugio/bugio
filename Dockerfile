# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY public/ ./public/
COPY src/views/ ./src/views/

# db:init needs tsx (runs once at startup via entrypoint)
RUN npm i tsx

COPY src/db/init.ts ./src/db/init.ts
COPY src/db/schema.ts ./src/db/schema.ts
COPY src/db/connection.ts ./src/db/connection.ts
COPY src/config.ts ./src/config.ts
COPY src/types/ ./src/types/

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
