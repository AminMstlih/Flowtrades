# Flowtrades Development & Production Guide

## 🚀 Quick Start

### Development Mode (Hot Reload)
Run both backend and frontend with hot reload in a single terminal:

```bash
# Option 1: Using Python directly
python dev_runner.py

# Option 2: Using npm (from frontend directory)
cd frontend
npm run dev:full

# Option 3: Using the installed script (after pip install -e .)
flowtrades-dev
```

**Access**: `http://localhost:5173`

### Production Mode (Single Server) ⭐ RECOMMENDED
Build frontend and run everything from one server:

```bash
# Option 1: Using Python directly
python prod_runner.py

# Option 2: Using npm (from frontend directory)
cd frontend
npm run build:prod

# Option 3: Using the installed script (after pip install -e .)
flowtrades-prod
```

**Access**: `http://localhost:8000`

## Traditional Setup (Two Terminals)

If you prefer running services separately:

### Terminal 1 - Backend
```bash
python main.py
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```

## Architecture

### Development Mode (Two Servers)
```
Browser → Vite Dev Server (5173) → Proxy → FastAPI Backend (8000)
                  ↕ WebSocket Proxy
              Exchange Data Sources
```
**Use when**: Active development, need hot reload

### Production Mode (Single Server) ⭐
```
Browser → FastAPI Backend (8000)
          ↳ Serves built static files
          ↕ Direct WebSocket
      Exchange Data Sources
```
**Use when**: Production deployment, resource efficiency

## Configuration

### Vite Proxy (frontend/vite.config.js)
- `/ws/*` → Proxied to `ws://localhost:8000` (WebSocket)
- `/api/*` → Proxied to `http://localhost:8000` (REST API)

### WebSocket Connection
The frontend automatically detects the environment:
- **Dev**: Connects to `ws://localhost:5173/ws/footprint` (via proxy)
- **Production**: Connects to `ws://localhost:8000/ws/footprint` (direct)

## Comparison

### Development Mode
✅ Hot reload for frontend (instant updates)
✅ Hot reload for backend (with dev tools)
✅ Detailed error messages
✅ Source maps for debugging
❌ Uses more resources (2 servers)
❌ Requires Vite proxy for WebSocket

### Production Mode ⭐
✅ Single server (resource efficient)
✅ No CORS issues
✅ Optimized & minified frontend
✅ Faster load times
✅ Simpler deployment
❌ No hot reload (need to rebuild)
❌ Longer startup (build time)

## When to Use Which

**Development Mode** - When you're:
- Actively developing frontend components
- Debugging UI issues
- Testing UI changes frequently

**Production Mode** - When you're:
- Running for actual trading
- Deploying to a server
- Want minimum resource usage
- Testing production-like environment

## Stopping the Servers

Press `Ctrl+C` in the terminal running `dev_runner.py` to gracefully shut down both services.
