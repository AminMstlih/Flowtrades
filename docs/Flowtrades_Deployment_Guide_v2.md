# **FLOWTRADES**
**Deployment Guide for AI Agent (v2 — Single Server Architecture)**

*From localhost:8000 on Windows RDP → Secure Public URL*

| Field | Detail |
| :---- | :---- |
| Agent Role | Senior DevOps & Backend Engineer |
| Project | Flowtrades — Real-time BTC Order Flow Visualization Tool |
| Target State | Single monolithic Python backend serving BOTH the compiled React UI and the WebSocket stream, exposed via a secure Cloudflare Tunnel. |
| Owner | Min (AminMstlih) — operating from phone via RDP app |

---

## **0\. Architecture Paradigm Shift**

The original plan decoupled the frontend (Vercel) from the backend (Windows). For a high-frequency real-time order flow tool, this is an anti-pattern that introduces CORS issues, latency, and unnecessary complexity. 

**The new, robust architecture:**
1. **Single Server:** The React frontend is compiled once (`npm run build`). The Python backend process hosts these static files on `/` and handles the WebSocket on `/ws`.
2. **One Tunnel:** A single Cloudflare Tunnel points exactly to the Python backend on `localhost:8000`. No Vercel needed.
3. **Security:** The WebSocket endpoint requires a hardcoded authentication token to prevent unauthorized access and bot abuse.
4. **Daemonization:** `WinSW` (Windows Service Wrapper) replaces outdated NSSM to ensure the backend and tunnel start automatically on Windows boot.

---

## **1\. Implementation Steps**

### **STEP 1 — Securing the WebSocket (Python Backend)**

Before exposing the server to the internet, we must secure the WebSocket endpoint. Anyone who finds the tunnel URL could otherwise connect and drain server resources.

1. **Generate a Secret Token:** Choose a strong password/token (e.g., `FLOW_SECRET_2026`).
2. **Update Backend:** In the Python WebSocket handler (e.g., in `main.py` or the `output` module), modify the connection logic to require a `token` query parameter. If the token is missing or incorrect, forcefully close the connection immediately.

### **STEP 2 — Frontend Configuration (React)**

The frontend no longer needs environment variables for different domains, because it will be hosted on the *same exact domain* as the backend.

1. **Update WebSocket URL:** Instead of hardcoding `ws://localhost:8000` or using `.env` files, change the frontend WebSocket connection to use a dynamic relative path:
   ```javascript
   // Automatically connects to the same protocol and host that served the HTML
   const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   const wsUrl = `${protocol}//${window.location.host}/ws?token=FLOW_SECRET_2026`;
   const ws = new WebSocket(wsUrl);
   ```
2. **Build the Frontend:** Run `npm run build` inside `Flowtrades/btc-orderflow/frontend`. This generates a `dist/` folder containing the optimized production UI.

### **STEP 3 — Serving the UI from Python**

The Python backend must be updated to serve the `dist/` folder when a user visits the root URL (`/`).

1. Copy or sympathetically link the `frontend/dist/` folder so the Python app can read it.
2. If using **FastAPI** (example):
   ```python
   from fastapi.staticfiles import StaticFiles
   from fastapi.responses import FileResponse
   
   # Mount the assets directory
   app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")
   
   # Serve the index.html on the root
   @app.get("/")
   async def serve_ui():
       return FileResponse("frontend/dist/index.html")
   ```

### **STEP 4 — Secure Public Exposure (Cloudflare Tunnel)**

1. Download **cloudflared** for Windows.
2. Authenticate the tunnel with a free Cloudflare account: `cloudflared.exe tunnel login`.
3. Create a named tunnel: `cloudflared.exe tunnel create flowtrades-backend`.
4. Create the `config.yml` to route traffic to `http://localhost:8000`.
5. Route the DNS to a custom domain or Cloudflare subdomain: `cloudflared.exe tunnel route dns flowtrades-backend api.yourdomain.com`.

### **STEP 5 — Daemonization (WinSW)**

To ensure the system survives server reboots without manual intervention:
1. Download **WinSW** (.NET natively supported on Windows Server).
2. Create `winsw-python.xml` to wrap the Python `main.py` execution.
3. Create `winsw-cloudflared.xml` to wrap the `cloudflared tunnel run` execution.
4. Run `winsw install` and `winsw start` for both.

---

## **2\. Verification & Testing**

1. **Local Test:** Open Chrome on RDP and visit `http://localhost:8000`. The chart should load, the WebSocket should connect, and live order flow should render.
2. **Auth Test:** Try connecting to `ws://localhost:8000/ws` without the token via a WebSocket testing extension. It should instantly reject.
3. **Public Test:** Turn off WiFi on the phone, use cellular data, and visit the Cloudflare Tunnel URL. The UI should load perfectly and immediately begin streaming live data.

*The entire stack is now secure, hyper-optimized for latency, and operates as a single cohesive unit.*
