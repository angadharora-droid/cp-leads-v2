# syntax=docker/dockerfile:1
#
# One image serves the whole CRM: the Express API under /api and the built
# React app for every other path. Railway builds this file from the repo root.
#
#   docker build -t cp-leads .
#   docker run -p 5000:5000 --env-file backend/.env cp-leads

# ---- Stage 1: build the React client ---------------------------------------
FROM node:22-alpine AS client
WORKDIR /client
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_BASE_URL is deliberately left unset: the API is served from the
# same origin under /api by the runtime stage below.
RUN npm run build

# ---- Stage 2: API runtime with LibreOffice ---------------------------------
FROM node:22-bookworm-slim AS runtime

# LibreOffice Writer converts uploaded Word agreements to PDF
# (backend/src/services/docxToPdf.service.js). fonts-liberation provides
# metric-compatible stand-ins for Times New Roman in the letters.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=5000 \
    SOFFICE_PATH=/usr/bin/soffice \
    SERVE_CLIENT_DIR=/app/client

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=client /client/dist ./client

# The node image ships an unprivileged "node" user with a writable home,
# which LibreOffice needs for its per-run profile.
USER node

EXPOSE 5000
CMD ["node", "src/server.js"]
