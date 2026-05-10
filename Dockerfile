# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY app/frontend/package*.json ./
RUN npm install
COPY app/frontend/ ./
RUN npm run build

# Stage 2: Python Backend
FROM python:3.12-slim
WORKDIR /app

# Copy the entire project structure
COPY . .

# Install dependencies using the pyproject.toml
RUN pip install --no-cache-dir ./app

# Copy built frontend from Stage 1 to the correct location
# ws_server.py looks for app/frontend/dist
RUN rm -rf app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./app/frontend/dist

# Set environment variables
ENV PORT=8000
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Run the application directly from the app directory
WORKDIR /app/app
CMD ["python", "main.py"]
