"""Empire Lords Dragon — server-authoritative FastAPI backend."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.api import routes_alliance, routes_auth, routes_game, routes_premium, routes_qa
from app.core import clock, config
from app.core.db import close, ensure_indexes
from app.core.errors import ApiError
from app.core.spec import get_spec, spec_meta
from app.domain import conquest, construction, grande_mondo, inactivity, marches, missions, mythic, pyramid, scheduler, sentinels, worlds  # noqa: F401  (registers event handlers)
from app.domain.research import validate_dag

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    spec = get_spec()
    validate_dag()
    log.info("spec %s loaded, hash %s", spec.version, spec.computed_hash)
    await ensure_indexes()
    await clock.load_offset()
    stop = asyncio.Event()
    worker = None
    if config.WORLD_AUTO_CREATE:
        asyncio.create_task(worlds.ensure_default_world())
    asyncio.create_task(pyramid.bootstrap())  # Pyramid cycle state + first deadline for every OPEN world (Bible §21)
    asyncio.create_task(grande_mondo.bootstrap())  # fog wall / War of the Regions deadline for every Grande Mondo (Bibbia GM)
    asyncio.create_task(inactivity.bootstrap())  # inactivity sweep per OPEN world (3 gg nei primi 30 gg del Regno, poi 120 gg)
    if config.SCHEDULER_ENABLED:
        worker = asyncio.create_task(scheduler.worker_loop(stop))
    try:
        yield
    finally:
        stop.set()
        if worker:
            await worker
        close()


app = FastAPI(title="Empire Lords Dragon API", version=spec_meta()["version"], lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    err = ApiError("VALIDATION_ERROR", "Invalid request", 422, {"errors": exc.errors()})
    return JSONResponse(status_code=422, content=err.to_dict())


@app.exception_handler(Exception)
async def unhandled_handler(_: Request, exc: Exception):
    log.exception("unhandled error")
    err = ApiError("INTERNAL_ERROR", "Internal server error", 500, {}, retryable=True)
    return JSONResponse(status_code=500, content=err.to_dict())


app.include_router(routes_auth.router)
app.include_router(routes_game.router)
app.include_router(routes_alliance.router)
app.include_router(routes_premium.router)
app.include_router(routes_qa.router)


@app.get("/api")
async def root():
    return {"name": "Empire Lords Dragon API", **spec_meta()}
