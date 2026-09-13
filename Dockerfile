FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:22-alpine
LABEL org.opencontainers.image.title="Pump.fun GitHub Claims"
LABEL org.opencontainers.image.source="https://github.com/nirholas/pumpfun-github-claims"
WORKDIR /app
RUN addgroup -S bot && adduser -S bot -G bot
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist dist/
RUN mkdir -p /app/data && chown bot:bot /app/data
ENV DATA_DIR=/app/data
ENV FEED_PROFILE=github-first-claims
ENV PERFORMANCE_UPDATES=false
USER bot
EXPOSE 3000
CMD ["node", "--enable-source-maps", "--max-old-space-size=1536", "dist/index.js"]
