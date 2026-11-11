# syntax=docker/dockerfile:1
# Two small images from one file: `bridge` (the brain) and `web` (the face).

# ---- build the face ---------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_STT_LANG
ARG VITE_TTS_LANG
# Same step scripts/start.mjs does: serve the hand-tracking WASM from our origin.
RUN mkdir -p public/mediapipe && cp -r node_modules/@mediapipe/tasks-vision/wasm/. public/mediapipe/
RUN npm run build

# ---- the face: static files behind nginx (free, ~10 MB RAM) -----------------
FROM nginx:alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# ---- the brain: Node + Claude Agent SDK -------------------------------------
FROM node:22-slim AS bridge
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY bridge ./bridge
USER node
EXPOSE 8787
CMD ["node", "bridge/server.mjs"]
