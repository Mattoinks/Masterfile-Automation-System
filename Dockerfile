# Single-service image: React UI + FastAPI API + OCR/Excel stack.
# Deploy this one container to Render / Railway / Fly / any Docker host.

# --- Frontend build ---
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Same-origin API when UI is served by FastAPI
ENV VITE_API_BASE=/api
RUN npm run build

# --- Runtime ---
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /frontend/dist /app/static

ENV STATIC_DIR=/app/static
ENV DATA_DIR=/data
ENV PYTHONUNBUFFERED=1

RUN mkdir -p /data

EXPOSE 8000

# Render/Railway set $PORT; default to 8000 locally
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
