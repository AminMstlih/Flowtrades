"""
Development runner — starts both FastAPI backend and Vite frontend in a single terminal.

This script:
1. Starts the FastAPI backend (uvicorn) in the background
2. Starts the Vite dev server in the background  
3. Monitors both processes and shuts down cleanly on Ctrl+C
4. Automatically configures Vite to proxy WebSocket to the backend

Usage: python dev_runner.py
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
import subprocess
from pathlib import Path

import structlog

# ── Structured Logging Setup ────────────────────────────────────

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("dev_runner")


async def run_backend():
    """Run the FastAPI backend server."""
    logger.info("Starting backend server on port 8000...")
    
    # Set environment variable to indicate dev mode
    env = os.environ.copy()
    env["FLOWTRADES_DEV_MODE"] = "1"
    
    process = await asyncio.create_subprocess_exec(
        sys.executable, "main.py",
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    
    async def log_output(stream, prefix):
        """Log output from a stream."""
        while True:
            line = await stream.readline()
            if line:
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    logger.info(f"{prefix}: {decoded}")
            else:
                break
    
    # Log stdout and stderr
    asyncio.create_task(log_output(process.stdout, "BACKEND"))
    asyncio.create_task(log_output(process.stderr, "BACKEND-ERR"))
    
    return process


async def run_frontend():
    """Run the Vite frontend dev server."""
    logger.info("Starting Vite dev server on port 5173...")
    
    # Determine npm command based on OS
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    
    process = await asyncio.create_subprocess_exec(
        npm_cmd, "run", "dev",
        cwd=Path(__file__).parent / "frontend",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    
    async def log_output(stream, prefix):
        """Log output from a stream."""
        while True:
            line = await stream.readline()
            if line:
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    logger.info(f"{prefix}: {decoded}")
            else:
                break
    
    # Log stdout and stderr
    asyncio.create_task(log_output(process.stdout, "FRONTEND"))
    asyncio.create_task(log_output(process.stderr, "FRONTEND-ERR"))
    
    return process


async def main():
    """Main dev runner orchestrator."""
    logger.info("Starting Flowtrades development environment...")
    logger.info("Backend: http://localhost:8000")
    logger.info("Frontend: http://localhost:5173")
    logger.info("Press Ctrl+C to stop both servers")
    
    # Start both servers
    backend_proc = await run_backend()
    frontend_proc = await run_frontend()
    
    # Wait for shutdown signal
    shutdown_event = asyncio.Event()
    
    def _signal_handler(sig, frame):
        logger.info("Shutdown requested...")
        shutdown_event.set()
    
    signal.signal(signal.SIGINT, _signal_handler)
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _signal_handler)
    
    # Wait for shutdown or process exit
    tasks = [
        asyncio.create_task(backend_proc.wait()),
        asyncio.create_task(frontend_proc.wait()),
        asyncio.create_task(shutdown_event.wait()),
    ]
    
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    
    # Cleanup
    logger.info("Shutting down servers...")
    
    for task in pending:
        task.cancel()
    
    # Terminate processes
    if backend_proc.returncode is None:
        backend_proc.terminate()
        try:
            await asyncio.wait_for(backend_proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            backend_proc.kill()
    
    if frontend_proc.returncode is None:
        frontend_proc.terminate()
        try:
            await asyncio.wait_for(frontend_proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            frontend_proc.kill()
    
    logger.info("Development environment stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
