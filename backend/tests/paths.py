"""Repository paths resolved from this file, so the suite runs from any checkout (not only /app).

The deployed container happens to live at /app, but hard-coding it means the tests cannot run in CI, in a developer
clone, or in a review sandbox.
"""
from __future__ import annotations

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
SPEC_DIR = REPO_ROOT / "spec"
FRONTEND_DIR = REPO_ROOT / "frontend"
MEMORY_DIR = REPO_ROOT / "memory"
BACKEND_ENV = BACKEND_DIR / ".env"
FRONTEND_ENV = FRONTEND_DIR / ".env"
