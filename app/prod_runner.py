"""
Production runner — builds frontend and starts backend in single command.

This script:
1. Builds the Vite frontend (optimized production build)
2. Starts the FastAPI backend which serves the built frontend
3. Single server handles everything

Usage: python prod_runner.py
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

logger = structlog.get_logger("prod_runner")


async def build_frontend():
    """Build the Vite frontend for production."""
    logger.info("Building frontend for production...")
    
    # Determine npm command based on OS
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    
    frontend_dir = Path(__file__).parent / "frontend"
    
    process = await asyncio.create_subprocess_exec(
        npm_cmd, "run", "build",
        cwd=frontend_dir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        logger.error("frontend_build_failed", error=stderr.decode())
        raise RuntimeError("Frontend build failed")
    
    logger.info("frontend_build_success")
    return True


async def run_backend():
    """Run the FastAPI backend server (serves built frontend)."""
    logger.info("Starting backend server on port 8000...")
    logger.info("Application will be available at: http://localhost:8000")
    
    process = await asyncio.create_subprocess_exec(
        sys.executable, "main.py",
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


async def main():
    """Main production runner orchestrator."""
    logger.info("=" * 60)
    logger.info("Flowtrades Production Startup")
    logger.info("=" * 60)
    
    try:
        # Step 1: Build frontend
        await build_frontend()
        
        # Step 2: Start backend (which serves the built frontend)
        backend_proc = await run_backend()
        
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
            asyncio.create_task(shutdown_event.wait()),
        ]
        
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        
        # Cleanup
        logger.info("Shutting down...")
        
        for task in pending:
            task.cancel()
        
        # Terminate process
        if backend_proc.returncode is None:
            backend_proc.terminate()
            try:
                await asyncio.wait_for(backend_proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                backend_proc.kill()
        
        logger.info("Production server stopped.")
        
    except Exception as e:
        logger.error("startup_failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
