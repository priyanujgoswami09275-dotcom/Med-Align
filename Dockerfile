# Stage 1: build the React app
FROM node:22-alpine AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: run the server
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY --from=web /build/web/dist ./web/dist
USER node
CMD ["node", "server.js"]
