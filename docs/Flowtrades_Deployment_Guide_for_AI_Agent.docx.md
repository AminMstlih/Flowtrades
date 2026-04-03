  
**FLOWTRADES**

**Deployment Guide for AI Agent**

*From localhost:5173 on Windows RDP → Public URL accessible on any device*

| Field | Detail |
| :---- | :---- |
| Agent Role | Senior DevOps & Full-Stack Deployment Engineer |
| Project | Flowtrades — Real-time BTC Order Flow Visualization Tool |
| Current State | Running locally on Windows RDP Server at localhost:5173 |
| Target State | Frontend on Vercel (public URL) \+ Backend on Windows Server via Cloudflare Tunnel |
| Owner | Min (AminMstlih) — self-taught developer, operating from phone via RDP app |
| Constraint | All operations must work from Windows RDP environment — no Linux SSH |
| Non-negotiable | DO NOT break the existing working setup. Verify at every step before proceeding. |

# **0\. Agent Role & Mandate**

You are a Senior DevOps and Full-Stack Deployment Engineer with deep experience in React/Vite frontend deployment, Python backend hosting, WebSocket infrastructure, Windows Server environments, and cloud deployment pipelines. You have deployed dozens of real-time data applications to production. You think in systems, not steps — every action you take must consider its downstream effect on the entire pipeline.

| 🎯  YOUR PRIMARY DIRECTIVE |
| :---- |
| Deploy Flowtrades from a local Windows RDP environment to a publicly accessible URL. |
| The tool is already working. Your job is to expose it — not rebuild it. |
| Maximum caution. Minimum disruption. Verify before every destructive action. |
| The owner operates from a phone. Every instruction must be executable without a laptop. |
| If something is unclear or risky — STOP and ask before proceeding. |

# **1\. Current System State — Read This Carefully**

Before touching anything, understand exactly what exists and what is working. This is a functioning production tool with real live data. Treat it accordingly.

## **1.1 What Is Currently Running**

| \# TERMINAL 1 — Python Backend cd Flowtrades/btc-orderflow python main.py \# → Connects to Binance, OKX, Bybit WebSocket streams \# → Processes order flow data (aggregation, delta, imbalance) \# → Serves data to frontend via WebSocket \# → Runs on: http://localhost:8000 (confirmed by owner) \# TERMINAL 2 — React Frontend (DEV SERVER) cd Flowtrades/btc-orderflow/frontend npm run dev \# → Vite development server \# → Runs on: http://localhost:5173 \# → Visible ONLY inside the RDP browser \# → NOT accessible from outside the server |
| :---- |

## **1.2 What The Tool Looks Like (Confirmed Working)**

The owner has confirmed and provided a screenshot showing the tool fully operational: live BTC price ($66,508), footprint ladder with buy/sell volume per price level, color-coded cells (green buy dominant, red sell dominant), volume bars, delta panel, 5m interval, Binance \+ OKX \+ Bybit all connected. This is a professional-grade order flow tool.

## **1.3 Known File Structure**

| Flowtrades/ └── btc-orderflow/     ├── main.py                 ← Python backend entry point     ├── requirements.txt     ├── ingestion/              ← WebSocket clients (Binance, OKX, Bybit)     ├── normalization/     ├── aggregation/     ├── output/                 ← WebSocket server to frontend     └── frontend/         ├── vite.config.js      ← MINIMAL (confirmed — only react plugin)         ├── package.json         ├── src/         │   ├── App.jsx (or App.js)         │   └── \[other components\]         └── dist/               ← Does NOT exist yet — built by npm run build |
| :---- |

## **1.4 Confirmed vite.config.js Contents**

| \# CURRENT vite.config.js — do not break this import { defineConfig } from "vite" import react from "@vitejs/plugin-react" export default defineConfig({   plugins: \[react()\], }) |
| :---- |

# **2\. Target Architecture**

The final deployed state must look exactly like this. Both pieces must work together or the tool does not function.

| ┌─────────────────────────────────────────────────────────────┐ │                    ANY DEVICE / BROWSER                     │ │              (phone, tablet, PC — outside RDP)              │ └───────────────────────┬─────────────────────────────────────┘                         │ opens                         ▼ ┌─────────────────────────────────────────────────────────────┐ │                      VERCEL (free)                          │ │              flowtrades.vercel.app                          │ │         Hosts: React frontend (static build)                │ └───────────────────────┬─────────────────────────────────────┘                         │ WebSocket connection to:                         ▼ ┌─────────────────────────────────────────────────────────────┐ │              CLOUDFLARE TUNNEL (free)                       │ │    https://flowtrades-api.trycloudflare.com                 │ │    (or custom domain if configured later)                   │ └───────────────────────┬─────────────────────────────────────┘                         │ tunnels to:                         ▼ ┌─────────────────────────────────────────────────────────────┐ │             WINDOWS RDP SERVER (existing)                   │ │         Python main.py running on port 8000                 │ │    Connected to Binance \+ OKX \+ Bybit WebSocket streams     │ └─────────────────────────────────────────────────────────────┘ |
| :---- |

| ⚠️  WHY VERCEL ALONE IS NOT ENOUGH |
| :---- |
| Vercel only hosts static files (HTML, CSS, JS). It cannot run Python. |
| The Python backend MUST stay on the Windows server — it holds the live exchange connections. |
| Vercel hosts the chart UI. Cloudflare Tunnel makes the Python backend reachable from the internet. |
| Both pieces are required. Deploying only the frontend gives a chart with no live data. |

# **3\. Deployment Steps — Execute In Order**

| 🚨  CRITICAL RULE BEFORE ANY STEP |
| :---- |
| ALWAYS verify the current state before changing anything. |
| ALWAYS test after each step before moving to the next. |
| NEVER run npm run build until environment variables are correctly set. |
| NEVER modify main.py or any Python backend file — backend is not touched in this deployment. |
| If a step fails — diagnose before retrying. Do not run the same failing command repeatedly. |

## **STEP 1 — Find the Backend URL in Frontend Code**

The frontend must be connecting to the backend somewhere in its source code. Find every place where localhost:8000 or ws://localhost or a port number appears. This is what needs to become an environment variable.

### **1.1 — Search for hardcoded backend references**

| \# Run this in Windows RDP — Command Prompt or PowerShell \# Navigate to frontend src folder cd Flowtrades/btc-orderflow/frontend/src \# Search for any localhost or port references findstr /s /i "localhost" \*.js \*.jsx \*.ts \*.tsx findstr /s /i "8000" \*.js \*.jsx \*.ts \*.tsx findstr /s /i "ws://" \*.js \*.jsx \*.ts \*.tsx findstr /s /i "wss://" \*.js \*.jsx \*.ts \*.tsx \# Also check for any config or api files dir /s /b \*.js \*.jsx \*.ts \*.tsx | findstr /i "config|api|socket|websocket" |
| :---- |

### **1.2 — Document every file and line found**

List every file path and the exact line of code that contains a hardcoded backend reference. Do not proceed to Step 2 until this inventory is complete. There may be 1 file or there may be 5 — find all of them.

| 💡  WHAT YOU ARE LOOKING FOR |
| :---- |
| Something like: const ws \= new WebSocket("ws://localhost:8000/ws") |
| Or: const API\_URL \= "http://localhost:8000" |
| Or: fetch("http://localhost:8000/api/...") |
| Every one of these must become an environment variable before the build. |

## **STEP 2 — Replace Hardcoded URLs with Environment Variables**

Vite has built-in support for environment variables. Any variable prefixed with VITE\_ is accessible in the frontend code. Replace every hardcoded backend URL with the appropriate environment variable.

### **2.1 — Create environment files**

| \# Location: Flowtrades/btc-orderflow/frontend/ \# FILE 1: .env (for local development — keeps existing behavior) VITE\_WS\_URL=ws://localhost:8000/ws VITE\_API\_URL=http://localhost:8000 \# FILE 2: .env.production (for Vercel deployment) \# Leave blank for now — will be filled in Step 4 after Cloudflare tunnel URL is known VITE\_WS\_URL=PLACEHOLDER\_REPLACE\_IN\_STEP\_4 VITE\_API\_URL=PLACEHOLDER\_REPLACE\_IN\_STEP\_4 \# IMPORTANT: Add both files to .gitignore if they contain secrets \# These files do not contain secrets — only URLs — so they can be committed \# But Vercel environment variables are the preferred method (see Step 5\) |
| :---- |

### **2.2 — Update the source code to use environment variables**

For every hardcoded URL found in Step 1, replace it with the Vite environment variable syntax. Example pattern:

| \# BEFORE (hardcoded — breaks in production): const ws \= new WebSocket("ws://localhost:8000/ws"); \# AFTER (environment variable — works everywhere): const wsUrl \= import.meta.env.VITE\_WS\_URL || "ws://localhost:8000/ws"; const ws \= new WebSocket(wsUrl); \# BEFORE (hardcoded API call): const response \= await fetch("http://localhost:8000/api/data"); \# AFTER: const apiUrl \= import.meta.env.VITE\_API\_URL || "http://localhost:8000"; const response \= await fetch(\`${apiUrl}/api/data\`); \# The || fallback ensures local dev still works even without .env file |
| :---- |

### **2.3 — Update vite.config.js**

Add the server proxy configuration for local development and define the build output directory:

| import { defineConfig } from "vite" import react from "@vitejs/plugin-react" export default defineConfig({   plugins: \[react()\],   server: {     port: 5173,     proxy: {       "/api": {         target: "http://localhost:8000",         changeOrigin: true,       },       "/ws": {         target: "ws://localhost:8000",         ws: true,         changeOrigin: true,       }     }   },   build: {     outDir: "dist",     sourcemap: false,   } }) \# NOTE: The proxy only applies during npm run dev. \# In production (Vercel), the frontend connects directly to the Cloudflare tunnel URL. |
| :---- |

### **2.4 — Verify local dev still works**

| \# After making changes — test that nothing is broken locally cd Flowtrades/btc-orderflow/frontend npm run dev \# Open localhost:5173 in RDP browser \# Confirm: live data still showing, no console errors \# If broken: revert the changes and re-examine what was changed \# DO NOT proceed to Step 3 if local dev is broken |
| :---- |

## **STEP 3 — Test the Production Build Locally**

Before deploying to Vercel, verify that npm run build produces a working dist folder. A build that works locally will work on Vercel. A build that fails locally will fail on Vercel — do not skip this step.

| cd Flowtrades/btc-orderflow/frontend \# Build for production npm run build \# Expected output: \# ✓ built in Xs \# dist/index.html \# dist/assets/index-\[hash\].js \# dist/assets/index-\[hash\].css \# If build fails — READ THE ERROR before doing anything else \# Common errors: \# \- Missing import → fix the import \# \- TypeScript error → check the changed files \# \- Environment variable not found → check .env file location \# Preview the production build locally: npm run preview \# Opens on localhost:4173 — test that it loads correctly in RDP browser \# Note: live data will still work here because backend is on localhost |
| :---- |

## **STEP 4 — Set Up Cloudflare Tunnel on Windows Server**

Cloudflare Tunnel creates a secure, encrypted connection between the Windows server and Cloudflare's network. This gives the Python backend a public HTTPS/WSS URL without opening firewall ports or exposing the server's IP address. This is safer than port forwarding and free.

### **4.1 — Download cloudflared for Windows**

| \# In RDP browser, go to: https://github.com/cloudflare/cloudflared/releases/latest \# Download: cloudflared-windows-amd64.exe \# Save to: C:\\cloudflared\\cloudflared.exe \# (Create the C:\\cloudflared folder first) |
| :---- |

### **4.2 — Create a quick tunnel (no account needed for testing)**

| \# Open Command Prompt in RDP cd C:\\cloudflared \# Start a temporary tunnel pointing to the Python backend cloudflared.exe tunnel \--url http://localhost:8000 \# Cloudflare will output something like: \# Your quick Tunnel has been created\! Visit it at: \# https://random-words-here.trycloudflare.com \# COPY THIS URL — you need it for Step 5 \# This URL is your public backend address \# Keep this terminal open — closing it kills the tunnel \# Test: open the tunnel URL in your phone browser (outside RDP) \# You should see some response from the Python backend \# Even a 404 page means the tunnel is working |
| :---- |

### **4.3 — Test WebSocket through the tunnel**

| \# The tunnel URL uses HTTPS → WebSocket becomes WSS automatically \# If your tunnel URL is: https://abc-def-ghi.trycloudflare.com \# Then WebSocket URL is:  wss://abc-def-ghi.trycloudflare.com/ws \# Note: trycloudflare.com tunnels are temporary and change on restart \# For a permanent URL — set up a named tunnel with a Cloudflare account \# (covered in Section 5 — Permanent Setup) |
| :---- |

| ⚠️  IMPORTANT: KEEP main.py RUNNING DURING TUNNEL TEST |
| :---- |
| The tunnel forwards requests TO the Python backend. |
| If main.py is not running, the tunnel has nothing to connect to. |
| Always start main.py first, then start the cloudflared tunnel. |
| Order: 1\) python main.py → 2\) cloudflared tunnel → 3\) test from phone |

## **STEP 5 — Deploy Frontend to Vercel**

With the Cloudflare tunnel URL known, the frontend can now be configured to point to the real backend and deployed to Vercel.

### **5.1 — Update the environment variable with real tunnel URL**

| \# Replace PLACEHOLDER with the actual Cloudflare tunnel URL from Step 4 \# In Flowtrades/btc-orderflow/frontend/.env.production: VITE\_WS\_URL=wss://your-actual-tunnel-url.trycloudflare.com/ws VITE\_API\_URL=https://your-actual-tunnel-url.trycloudflare.com \# Run build again with the real URL: npm run build \# Verify dist folder was created successfully |
| :---- |

### **5.2 — Option A: Deploy via GitHub (Recommended)**

This is the easiest method because Min already has the repo on GitHub and a Vercel account.

| \# Commit the changes to GitHub: cd Flowtrades git add . git commit \-m "feat: add env vars and production build config" git push origin main \# Then in Vercel dashboard (vercel.com): \# 1\. Click "Add New Project" \# 2\. Import from GitHub → select Flowtrades repo \# 3\. Set Root Directory to: btc-orderflow/frontend \# 4\. Framework Preset: Vite (auto-detected) \# 5\. Add Environment Variables: \#    VITE\_WS\_URL \= wss://your-tunnel-url.trycloudflare.com/ws \#    VITE\_API\_URL \= https://your-tunnel-url.trycloudflare.com \# 6\. Click Deploy \# Vercel will: \# \- Pull the code from GitHub \# \- Run npm run build automatically \# \- Deploy the dist folder \# \- Give you a URL like: flowtrades.vercel.app |
| :---- |

### **5.3 — Option B: Deploy via Vercel CLI**

| \# If GitHub auto-deploy is not working, use CLI directly \# Install Vercel CLI on Windows server: npm install \-g vercel \# Navigate to frontend folder: cd Flowtrades/btc-orderflow/frontend \# Login to Vercel: vercel login \# Follow the browser authentication flow \# Deploy: vercel \--prod \# Vercel CLI will ask: \# \- Set up and deploy? Y \# \- Which scope? (your account) \# \- Link to existing project? N (first time) \# \- Project name? flowtrades \# \- Directory? ./ (current) \# Deploy will run and give you the public URL |
| :---- |

## **STEP 6 — Verify End-to-End on Phone**

This is the final verification. Do not consider the deployment complete until all of these pass.

| Test | How to Test | Expected Result |
| :---- | :---- | :---- |
| Frontend loads | Open flowtrades.vercel.app in phone browser (NOT RDP) | Chart UI renders — no blank page |
| No console errors | Open browser DevTools → Console tab | Zero red errors related to connection |
| WebSocket connects | Watch the LIVE indicator in top right of chart | Shows LIVE status, not disconnected |
| Live price updates | Watch the price number in the header | Price changes in real time |
| Footprint data | Look at the footprint ladder cells | Numbers updating, colors showing |
| Volume bars | Check bottom panel | Green/red volume bars animating |
| Delta panel | Check bottom strip | Delta values updating per candle |
| Mobile layout | Rotate phone, try landscape | Chart adapts to screen size |
| Reconnect test | Turn off WiFi for 10s, turn back on | Chart reconnects automatically |

# **4\. Making It Permanent**

The quick tunnel from Step 4 is temporary — it changes URL every time cloudflared restarts. For a stable production setup, configure a permanent named tunnel. This requires a free Cloudflare account.

## **4.1 — Named Cloudflare Tunnel (Stable URL)**

| \# Step 1: Create a free Cloudflare account at cloudflare.com \# Step 2: Authenticate cloudflared with your account cloudflared.exe tunnel login \# Opens browser — log in to Cloudflare — authorize cloudflared \# Step 3: Create a named tunnel cloudflared.exe tunnel create flowtrades-backend \# Outputs a tunnel ID and creates a credentials file \# Note the tunnel ID — you need it \# Step 4: Create tunnel config file \# Create: C:\\cloudflared\\config.yml tunnel: YOUR\_TUNNEL\_ID\_HERE credentials-file: C:\\Users\\\[username\]\\.cloudflared\\\[tunnel-id\].json ingress:   \- service: http://localhost:8000 \# Step 5: Route a domain to the tunnel (optional — gets you a custom URL) cloudflared.exe tunnel route dns flowtrades-backend api.yourdomain.com \# Or use a Cloudflare-provided subdomain (free) \# This gives you: flowtrades-backend.cfargotunnel.com \# Step 6: Run the permanent tunnel cloudflared.exe tunnel run flowtrades-backend |
| :---- |

## **4.2 — Make Python Backend Start Automatically**

Currently main.py must be started manually each time. Configure it as a Windows Service so it starts automatically when the server reboots.

| \# Install NSSM (Non-Sucking Service Manager) — manages Windows services \# Download from: https://nssm.cc/download \# Extract to C:\\nssm\\ \# Create a service for the Python backend: C:\\nssm\\nssm.exe install FlowtradesBackend \# In the NSSM GUI that opens: \# Application Path: C:\\Python\\python.exe (or wherever Python is installed) \# Startup Directory: C:\\path\\to\\Flowtrades\\btc-orderflow \# Arguments: main.py \# Start the service: C:\\nssm\\nssm.exe start FlowtradesBackend \# Verify it is running: C:\\nssm\\nssm.exe status FlowtradesBackend \# Do the same for cloudflared: C:\\nssm\\nssm.exe install FlowtradesCloudflared \# Application: C:\\cloudflared\\cloudflared.exe \# Arguments: tunnel run flowtrades-backend |
| :---- |

## **4.3 — Update Vercel Environment Variables with Permanent URL**

| \# Once permanent tunnel is set up and URL is stable: \# Go to Vercel dashboard → flowtrades project → Settings → Environment Variables \# Update: \# VITE\_WS\_URL \= wss://your-permanent-tunnel-url/ws \# VITE\_API\_URL \= https://your-permanent-tunnel-url \# Then redeploy: \# Vercel dashboard → Deployments → Redeploy (or push a new commit to trigger auto-deploy) |
| :---- |

# **5\. Troubleshooting Guide**

When something breaks — diagnose before acting. Never run commands blindly.

| Problem | Likely Cause | Diagnosis & Fix |
| :---- | :---- | :---- |
| npm run build fails | Environment variable not found or import error | Read the exact error. Check .env file is in frontend/ folder. Check all changed files for syntax errors. |
| Chart loads but no data | Frontend cannot reach Python backend | Open browser DevTools → Network tab → look for failed WebSocket connection. Check tunnel is running. Check main.py is running. |
| WebSocket connects then disconnects | CORS issue or wrong URL format | Check that VITE\_WS\_URL uses wss:// (not ws://) for the Cloudflare tunnel. Cloudflare tunnels require WSS. |
| Vercel build fails | Different Node version or missing dependency | Check Vercel build logs. Add .nvmrc file with node version. Run npm ci instead of npm install. |
| Tunnel URL keeps changing | Using quick tunnel instead of named tunnel | Set up a named Cloudflare tunnel (Section 4.1). Quick tunnels are temporary by design. |
| Page loads blank on phone | JavaScript error on load | Open phone browser DevTools (Chrome → Menu → More Tools → Developer Tools). Check console errors. |
| Local dev broken after changes | vite.config.js or env variable error | Revert the last change. Test again. Apply changes one at a time. |
| Backend 500 error through tunnel | main.py error unrelated to deployment | Check Python terminal output. Backend error — not a deployment issue. |

# **6\. Hard Constraints — What Must Never Be Changed**

| 🚫  DO NOT TOUCH THESE — EVER |
| :---- |
| 1\. main.py — The Python backend is working. Deployment does not require backend changes. |
| 2\. Any Python file in ingestion/, normalization/, aggregation/, output/ folders. |
| 3\. The existing WebSocket logic between backend and frontend — only the URL changes. |
| 4\. Any file that is currently working without issues — only change what deployment requires. |
| 5\. The GitHub main branch without testing the build locally first. |

# **7\. Quick Reference — Commands at a Glance**

| \# ══ DAILY STARTUP ORDER (after permanent setup) ══ \# Services start automatically — no manual steps needed \# Just open flowtrades.vercel.app on any device \# ══ MANUAL STARTUP (before permanent setup) ══ \# Terminal 1: cd Flowtrades/btc-orderflow && python main.py \# Terminal 2: C:\\cloudflared\\cloudflared.exe tunnel \--url http://localhost:8000 \# (Keep both terminals open) \# ══ BUILD AND DEPLOY ══ cd Flowtrades/btc-orderflow/frontend npm run build          \# build for production npm run preview        \# test production build locally vercel \--prod          \# deploy to Vercel (if using CLI) \# ══ ENVIRONMENT FILES ══ \# .env              → local development (localhost URLs) \# .env.production   → production (Cloudflare tunnel URLs) \# ══ VERIFY TUNNEL IS WORKING ══ \# Open in phone browser (outside RDP): \# https://your-tunnel-url.trycloudflare.com \# Should see some response (even 404 \= tunnel is alive) \# ══ CHECK SERVICE STATUS (after NSSM setup) ══ C:\\nssm\\nssm.exe status FlowtradesBackend C:\\nssm\\nssm.exe status FlowtradesCloudflared |
| :---- |

***The tool is already built. The job is simply to make it reachable.***

*Verify at every step. Ask before breaking anything. The owner operates from a phone.*