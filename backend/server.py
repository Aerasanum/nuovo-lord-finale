"""Empire Lords Dragon — server-authoritative FastAPI backend."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.api import routes_alliance, routes_auth, routes_game, routes_premium, routes_qa, routes_store
from app.core import clock, config, reqlog, tasks
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
        tasks.spawn(worlds.ensure_default_world(), "ensure_default_world")
    tasks.spawn(pyramid.bootstrap(), "pyramid.bootstrap")  # Pyramid cycle state + first deadline for every OPEN world (Bible §21)
    tasks.spawn(grande_mondo.bootstrap(), "grande_mondo.bootstrap")  # fog wall / War of the Regions deadline for every Grande Mondo (Bibbia GM)
    tasks.spawn(inactivity.bootstrap(), "inactivity.bootstrap")  # inactivity sweep per OPEN world (3 gg nei primi 30 gg del Regno, poi 120 gg)
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
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _action(request: Request) -> str:
    """The route template rather than the concrete path, so the same action reads the same across players."""
    route = request.scope.get("route")
    return f"{request.method} {getattr(route, 'path', None) or request.url.path}"


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    # A refused action is the ordinary case (not enough resources, queue full), so it is not a server problem to
    # warn about — but it is exactly what a player reports, and the trace_id is how their report is found again.
    log.info("api error code=%s %s", exc.code, reqlog.describe(exc.trace_id, _action(request)))
    return JSONResponse(status_code=exc.status, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    err = ApiError("VALIDATION_ERROR", "Invalid request", 422, {"errors": exc.errors()})
    log.info("api error code=%s %s", err.code, reqlog.describe(err.trace_id, _action(request)))
    return JSONResponse(status_code=422, content=err.to_dict())


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    err = ApiError("INTERNAL_ERROR", "Internal server error", 500, {}, retryable=True)
    # The stack trace and the id the client is shown have to be on the same line: logging them separately is what
    # made the trace_id useless, since the id in the body was never the one written next to the traceback.
    log.error("unhandled error %s", reqlog.describe(err.trace_id, _action(request)), exc_info=exc)
    return JSONResponse(status_code=500, content=err.to_dict())


app.include_router(routes_auth.router)
app.include_router(routes_game.router)
app.include_router(routes_alliance.router)
app.include_router(routes_premium.router)
app.include_router(routes_store.router)
app.include_router(routes_qa.router)


@app.get("/api")
async def root():
    return {"name": "Empire Lords Dragon API", **spec_meta()}
