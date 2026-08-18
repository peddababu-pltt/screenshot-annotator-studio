from __future__ import annotations

import importlib
import importlib.util
import asyncio
import json
import os
import pathlib
import re
import sys
import traceback
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

ROOT = pathlib.Path("/Users/peddababu/Desktop/screenshot annotator/annotator-app").resolve()
ENTRY = pathlib.Path("/Users/peddababu/Desktop/screenshot annotator/annotator-app/backend/api/main.py").resolve()
MANIFEST = json.loads("{\"manifest_version\":\"1\",\"id\":\"annotator-app\",\"name\":\"Screenshot Annotator\",\"version\":\"1.0.6\",\"developer\":\"Your Team\",\"category\":\"Productivity\",\"tagline\":\"Upload, annotate, and export screenshots\",\"description\":\"Upload a screenshot, mark it up with arrows, shapes, text, and highlights, then export as PNG. Runs 100% in the browser.\",\"icon\":\"Scissors\",\"gradient\":{\"bg\":\"linear-gradient(135deg, #2563EB, #7C3AED)\",\"text\":\"#fff\"},\"sdk\":{\"frontend\":\"^0.1.16\",\"backend\":\"^0.1.8\"},\"platform\":{\"min_version\":\"0.1.0\"},\"capabilities\":{\"frontend\":true,\"backend\":true,\"database\":false,\"webhooks\":false,\"scheduled_jobs\":false,\"file_uploads\":false,\"external_network\":[\"cdn.jsdelivr.net\"]},\"frontend\":{\"entry\":\"./frontend/src/index.tsx\",\"sandbox\":true},\"backend\":{\"entry\":\"./backend/api/main.py\"},\"public_routes\":[\"/health\",\"/stats\"]}")
SDK_PATH = "/Users/peddababu/.npm-global/lib/node_modules/@palettelab/cli/backend-sdk"
DATABASE_ENABLED = bool(MANIFEST.get("database") or MANIFEST.get("capabilities", {}).get("database"))
DATABASE_URL = os.environ.get("PALETTE_DEV_DATABASE_URL", "sqlite+aiosqlite:////Users/peddababu/Desktop/screenshot annotator/annotator-app/.palette/dev/annotator-app.sqlite3")
DEV_SECRETS = json.loads("{\"staging_token\":\"pltt login --env staging --url https://apps-api.pltt.xyz --token pltt_c7vjsMaJ_xqUVHpeh-0LzcpPIjkP231TPqUPBimZIN8\",\"PALETTE_DEV_URL\":\"https://dev-os-api.pltt.link\",\"PALETTE_DEV_TOKEN\":\"pltt_HLRfsYk4H8MYChR3rzYo2do7VQ7jtRsCOMoiRhPAjRM\",\"PALETTE_QA_URL\":\"https://qa-os-api.pltt.xyz\",\"PALETTE_QA_TOKEN\":\"pltt_7TCXnYNHyPattqvTSPu3PcQx0HBmnlD-cAmEchrjUfE\",\"PALETTE_PROD_URL\":\"https://os-api.pltt.ai\",\"PALETTE_PROD_TOKEN\":\"pltt_FGM0BiKaOodmnamqJmZ7NLuPRBGndxRHGpWRguQPqEo\"}")
DEV_CONNECTIONS = json.loads("{}")
DEV_APP_MOCKS = json.loads("{}")
BACKEND_BASE = "http://127.0.0.1:8733"

def _service_enabled(name: str) -> bool:
    services = MANIFEST.get("platform_services") or []
    if isinstance(services, list):
        return name in services
    if isinstance(services, dict):
        return name in services
    return False

if SDK_PATH:
    sys.path.insert(0, SDK_PATH)
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ENTRY.parent))

DEV_REDIS = None
DEV_VECTOR = None
DEV_STORAGE = None
if _service_enabled("redis"):
    from palette_sdk.platform_services import LocalRedisService
    DEV_REDIS = LocalRedisService()
if _service_enabled("vector"):
    from palette_sdk.platform_services import LocalVectorService
    DEV_VECTOR = LocalVectorService()
if _service_enabled("storage"):
    from palette_sdk.storage import LocalStorageService
    DEV_STORAGE = LocalStorageService(
        ROOT / ".palette" / "dev-storage",
        MANIFEST.get("id", ""),
        app_name=MANIFEST.get("name"),
        organization_id=1,
        organization_slug="palette-dev",
        organization_name="Palette Dev",
    )

DEV_ORGANIZATION = {
    "id": 1,
    "name": "Palette Dev",
    "slug": "palette-dev",
    "description": "Local development organisation",
    "company_type": "IT & Engineering",
    "logo_url": None,
    "theme_id": "mac",
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

LOCAL_UPLOADS = {}
CONTENT_RANGE_RE = re.compile(r"^bytes (?P<start>\d+)-(?P<end>\d+)/(?P<total>\d+)$")

def _local_storage_enabled():
    return _service_enabled("storage") and DEV_STORAGE is not None

def _parse_content_range(value: str | None):
    if not value:
        raise HTTPException(status_code=411, detail="Content-Range header is required")
    match = CONTENT_RANGE_RE.match(value)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid Content-Range header")
    start = int(match.group("start"))
    end = int(match.group("end"))
    total = int(match.group("total"))
    if end < start or total < 0 or end >= total:
        raise HTTPException(status_code=400, detail="Invalid Content-Range byte range")
    return start, end, total

def _require_local_storage(plugin_id: str):
    if plugin_id != MANIFEST.get("id", ""):
        raise HTTPException(status_code=404, detail="App not found")
    if not _local_storage_enabled():
        raise HTTPException(status_code=403, detail='App must declare platform_services: ["storage"]')

def _api_url(path: str):
    return f"{BACKEND_BASE}/api/v1{path}"

class LocalAppInteropService:
    def service(self, service_id: str):
        return LocalAppServiceClient(service_id)

    async def call(self, app_id: str, path: str, *, method: str = "GET", json_body=None, timeout: float = 30.0):
        key = app_id + " " + method.upper() + " " + path
        if key in DEV_APP_MOCKS:
            return DEV_APP_MOCKS[key]
        raise RuntimeError("No local app mock configured for " + key)

    async def call_service(self, service_id: str, path: str, *, method: str = "GET", json_body=None, timeout: float = 30.0):
        key = service_id + " " + method.upper() + " " + path
        if key in DEV_APP_MOCKS:
            return DEV_APP_MOCKS[key]
        raise RuntimeError("No local app service mock configured for " + key)

    async def broker_call(self, target: str, payload=None):
        payload = payload or {}
        payload_key = target + " " + json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if payload_key in DEV_APP_MOCKS:
            return DEV_APP_MOCKS[payload_key]
        if target in DEV_APP_MOCKS:
            return DEV_APP_MOCKS[target]
        raise RuntimeError("No local broker mock configured for " + target)

    async def broker_emit(self, target: str, payload=None):
        print("[palette-broker-event]", target, json.dumps(payload or {}, sort_keys=True))

class LocalAppServiceClient:
    def __init__(self, service_id: str):
        self.service_id = service_id

    async def call(self, path: str, *, method: str = "GET", json=None, timeout: float = 30.0):
        return await LocalAppInteropService().call_service(self.service_id, path, method=method, json_body=json, timeout=timeout)

    async def get(self, path: str, **kwargs):
        return await self.call(path, method="GET", **kwargs)

    async def post(self, path: str, json=None, **kwargs):
        return await self.call(path, method="POST", json=json, **kwargs)

class LocalEventPublisher:
    async def publish(self, topic: str, payload=None):
        print("[palette-event]", topic, json.dumps(payload or {}, sort_keys=True))

class LocalNotificationsService:
    """Local stand-in for the platform notification pool: logs and returns a stub."""

    def __init__(self):
        self._next_id = 1

    def _resolve_action_route(self, route, plugin_id, target_app=None):
        app_id = target_app or plugin_id
        if not route:
            return f"/apps/{app_id}" if app_id else None
        if "://" in route:
            raise ValueError("route must be an internal route starting with '/'")
        if route.startswith("/apps/"):
            return route
        suffix = route if route.startswith("/") else "/" + route
        return f"/apps/{app_id}{suffix}" if app_id else suffix

    async def push(self, *, title, body=None, route=None, severity=None, data=None, user_id=None, to=None, target_app=None, target_app_id=None):
        if not title or not str(title).strip():
            raise ValueError("notification title is required")
        if severity is not None and severity not in ("info", "success", "warning", "error"):
            raise ValueError("severity must be one of: info, success, warning, error")
        plugin_id = MANIFEST.get("id", "")
        badge_app = target_app_id or target_app
        notification = {
            "id": self._next_id,
            "organization_id": 1,
            "type": "app",
            "title": str(title),
            "body": body,
            "data_json": json.dumps(data) if data is not None else None,
            "source_app_id": plugin_id or None,
            "target_app_id": badge_app or plugin_id or None,
            "action_route": self._resolve_action_route(route, plugin_id, badge_app),
            "severity": severity,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "local_recipient": to or ({"kind": "user", "value": str(user_id)} if user_id is not None else {"kind": "current_user", "value": "local"}),
        }
        self._next_id += 1
        print("[palette-notification]", json.dumps(notification, sort_keys=True))
        return notification

NOTIFICATIONS = LocalNotificationsService()

spec = importlib.util.spec_from_file_location("palette_local_backend", ENTRY)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
router = getattr(module, "router", None)
if router is None:
    raise RuntimeError(f"backend entry has no router export: {ENTRY}")

from palette_sdk.jobs import JobCancelledError, JobExecution, JobsClient, drain_pending_jobs

LOCAL_JOB_HANDLERS = {decl.name: decl for decl in drain_pending_jobs()}
LOCAL_JOBS = {}
LOCAL_JOB_TASKS = set()

engine = None
SessionLocal = None
if DATABASE_ENABLED:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from palette_sdk.db import PluginBase

    models_file = ENTRY.parent / "models.py"
    if models_file.exists():
        importlib.import_module("models")

    engine = create_async_engine(DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def _local_job_view(record):
    job_id = record["id"]
    return {
        **{key: value for key, value in record.items() if key != "task"},
        "job_id": job_id,
        "status_url": f"/api/v1/app-jobs/{job_id}",
        "events_url": f"/api/v1/app-jobs/{job_id}/events",
    }

class LocalJobExecutionAdapter:
    def __init__(self, record):
        self.record = record

    async def progress(self, percent, message=None):
        self.record["progress"] = percent
        self.record["message"] = message
        self.record["updated_at"] = datetime.now(timezone.utc).isoformat()

    async def heartbeat(self):
        self.record["updated_at"] = datetime.now(timezone.utc).isoformat()

    async def cancelled(self):
        return bool(self.record.get("cancel_requested"))

class LocalJobsService:
    async def enqueue(self, name, payload, *, idempotency_key=None):
        declaration = LOCAL_JOB_HANDLERS.get(name)
        if declaration is None:
            raise HTTPException(status_code=422, detail=f"local job handler is not registered: {name}")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=422, detail="job payload must be a JSON object")
        try:
            json.dumps(payload)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"job payload is not JSON serializable: {exc}")
        if idempotency_key:
            for existing in LOCAL_JOBS.values():
                if existing["handler"] == name and existing.get("idempotency_key") == idempotency_key:
                    return _local_job_view(existing)
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "id": job_id,
            "plugin_id": MANIFEST.get("id", ""),
            "handler": name,
            "payload": payload or {},
            "result": None,
            "status": "queued",
            "progress": 0,
            "message": None,
            "attempt_count": 0,
            "max_attempts": declaration.max_attempts,
            "cancel_requested": False,
            "error_code": None,
            "error_message": None,
            "idempotency_key": idempotency_key,
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "updated_at": now,
        }
        LOCAL_JOBS[job_id] = record
        task = asyncio.create_task(_run_local_job(record, declaration))
        LOCAL_JOB_TASKS.add(task)
        task.add_done_callback(LOCAL_JOB_TASKS.discard)
        return _local_job_view(record)

    async def get(self, job_id):
        record = LOCAL_JOBS.get(str(job_id))
        if record is None:
            raise HTTPException(status_code=404, detail="Local job not found")
        return _local_job_view(record)

    async def cancel(self, job_id):
        record = LOCAL_JOBS.get(str(job_id))
        if record is None:
            raise HTTPException(status_code=404, detail="Local job not found")
        if record["status"] not in ("completed", "failed", "cancelled"):
            record["cancel_requested"] = True
            if record["status"] == "queued":
                record["status"] = "cancelled"
                record["completed_at"] = datetime.now(timezone.utc).isoformat()
        return _local_job_view(record)

LOCAL_JOB_SERVICE = LocalJobsService()

def _local_job_context(session):
    from palette_sdk import PluginContext
    from palette_sdk.apps import AppInteropClient
    from palette_sdk.connections import PluginConnectionsClient
    from palette_sdk.events import EventPublisher
    from palette_sdk.notifications import NotificationsClient
    from palette_sdk.organization import OrganizationInfo
    from palette_sdk.platform_services import UnavailablePlatformService

    return PluginContext(
        db=session,
        user_id="dev-user",
        organization_id=1,
        organization=OrganizationInfo.from_dict(DEV_ORGANIZATION),
        org_role="owner",
        plugin_id=MANIFEST.get("id", ""),
        permissions=MANIFEST.get("permissions", []),
        storage=DEV_STORAGE or UnavailablePlatformService("storage"),
        connections=PluginConnectionsClient(None, DEV_CONNECTIONS),
        apps=AppInteropClient(LocalAppInteropService()),
        notifications=NotificationsClient(NOTIFICATIONS),
        redis=DEV_REDIS or UnavailablePlatformService("redis"),
        vector=DEV_VECTOR or UnavailablePlatformService("vector"),
        events=EventPublisher(LocalEventPublisher()),
        jobs=JobsClient(LOCAL_JOB_SERVICE),
        config={
            "secrets": DEV_SECRETS,
            "secret_specs": MANIFEST.get("secrets") or {},
            "secret_scope": "dev",
        },
    )

async def _run_local_job(record, declaration):
    record["status"] = "running"
    record["attempt_count"] = 1
    record["started_at"] = datetime.now(timezone.utc).isoformat()
    record["updated_at"] = record["started_at"]
    adapter = LocalJobExecutionAdapter(record)
    execution = JobExecution(
        adapter,
        job_id=record["id"],
        attempt=1,
        idempotency_key=record.get("idempotency_key"),
    )

    async def invoke(session):
        ctx = _local_job_context(session)
        return await declaration.handler(ctx, execution, record["payload"])

    try:
        await execution.check_cancelled()
        if SessionLocal is None:
            result = await asyncio.wait_for(
                invoke(None), timeout=declaration.timeout_seconds
            )
        else:
            async with SessionLocal() as session:
                result = await asyncio.wait_for(
                    invoke(session), timeout=declaration.timeout_seconds
                )
                await session.commit()
        if result is not None and not isinstance(result, dict):
            raise TypeError("job handler must return a dict or None")
        json.dumps(result)
        if record["cancel_requested"]:
            record["status"] = "cancelled"
            record["message"] = "Cancelled"
        else:
            record["status"] = "completed"
            record["progress"] = 100
            record["message"] = record["message"] or "Completed"
            record["result"] = result
    except JobCancelledError:
        record["status"] = "cancelled"
        record["message"] = "Cancelled"
    except Exception as exc:
        record["status"] = "failed"
        record["message"] = "Job failed"
        record["error_code"] = type(exc).__name__
        record["error_message"] = str(exc)
        traceback.print_exc()
    finally:
        record["completed_at"] = datetime.now(timezone.utc).isoformat()
        record["updated_at"] = record["completed_at"]

class DevPluginContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.user = SimpleNamespace(
            id="dev-user",
            email="developer@palette.local",
            name="Palette Developer",
            organization_id=1,
        )
        request.state.org_role = "owner"
        request.state.organization_info = DEV_ORGANIZATION
        request.state.plugin_id = MANIFEST.get("id", "")
        request.state.plugin_permissions = MANIFEST.get("permissions", [])
        request.state.plugin_config = {
            "secrets": DEV_SECRETS,
            "secret_specs": MANIFEST.get("secrets") or {},
            "secret_scope": "dev",
        }
        request.state.plugin_local_connections = DEV_CONNECTIONS
        request.state.plugin_apps = LocalAppInteropService()
        request.state.plugin_events = LocalEventPublisher()
        request.state.plugin_jobs = LOCAL_JOB_SERVICE
        request.state.notifications = NOTIFICATIONS
        request.state.storage = DEV_STORAGE
        if DEV_REDIS is not None:
            request.state.redis = DEV_REDIS
        if DEV_VECTOR is not None:
            request.state.vector = DEV_VECTOR
        if SessionLocal is None:
            request.state.db = None
            return await call_next(request)

        async with SessionLocal() as session:
            request.state.db = session
            try:
                return await call_next(request)
            except Exception:
                await session.rollback()
                raise

app = FastAPI(title=f"{MANIFEST.get('name', 'Palette Plugin')} Local Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DevPluginContextMiddleware)
app.include_router(router, prefix=f"/api/v1/plugins/{MANIFEST['id']}")

@app.get("/api/v1/app-jobs/{job_id}")
async def get_local_job(job_id: str):
    return await LOCAL_JOB_SERVICE.get(job_id)

@app.post("/api/v1/app-jobs/{job_id}/cancel")
async def cancel_local_job(job_id: str):
    return await LOCAL_JOB_SERVICE.cancel(job_id)

@app.get("/api/v1/app-jobs/{job_id}/events")
async def local_job_events(job_id: str):
    await LOCAL_JOB_SERVICE.get(job_id)

    async def stream():
        last = None
        while True:
            current = await LOCAL_JOB_SERVICE.get(job_id)
            marker = (current["status"], current["progress"], current["message"], current["updated_at"])
            if marker != last:
                yield "event: job\ndata: " + json.dumps(current, default=str) + "\n\n"
                last = marker
            if current["status"] in ("completed", "failed", "cancelled"):
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream")

@app.post("/api/v1/app-storage/{plugin_id}/uploads")
async def create_local_app_storage_upload(plugin_id: str, request: Request):
    _require_local_storage(plugin_id)
    body = await request.json()
    filename = body.get("filename") or "upload"
    content_type = body.get("content_type") or "application/octet-stream"
    size = int(body.get("size") or 0)
    key = body.get("key")
    chunk_size = int(body.get("chunk_size") or 8 * 1024 * 1024)
    upload_id = uuid.uuid4().hex
    object_path = DEV_STORAGE.object_path(filename, key=key)
    temp_path = DEV_STORAGE._target(f".tmp/app-storage/{upload_id}.part")
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path.write_bytes(b"")
    LOCAL_UPLOADS[upload_id] = {
        "plugin_id": plugin_id,
        "object_path": object_path,
        "content_type": content_type,
        "size": size,
        "uploaded_bytes": 0,
        "complete": False,
    }
    return {
        "upload_id": upload_id,
        "mode": "local_resumable",
        "bucket": "local",
        "object_path": object_path,
        "file_url": DEV_STORAGE._target(object_path).as_uri(),
        "upload_url": _api_url(f"/app-storage/{plugin_id}/uploads/{upload_id}/chunks"),
        "status_url": _api_url(f"/app-storage/{plugin_id}/uploads/{upload_id}/status"),
        "content_type": content_type,
        "size": size,
        "chunk_size": chunk_size,
    }

@app.get("/api/v1/app-storage/{plugin_id}/uploads/{upload_id}/status")
async def local_app_storage_upload_status(plugin_id: str, upload_id: str):
    _require_local_storage(plugin_id)
    session = LOCAL_UPLOADS.get(upload_id)
    if not session or session["plugin_id"] != plugin_id:
        raise HTTPException(status_code=404, detail="Upload session not found")
    return {
        "upload_id": upload_id,
        "object_path": session["object_path"],
        "uploaded_bytes": session["uploaded_bytes"],
        "size": session["size"],
        "complete": session["complete"],
        "file_url": DEV_STORAGE._target(session["object_path"]).as_uri(),
    }

@app.put("/api/v1/app-storage/{plugin_id}/uploads/{upload_id}/chunks")
async def upload_local_app_storage_chunk(plugin_id: str, upload_id: str, request: Request):
    _require_local_storage(plugin_id)
    session = LOCAL_UPLOADS.get(upload_id)
    if not session or session["plugin_id"] != plugin_id:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if session["complete"]:
        return Response(status_code=204)
    start, end, total = _parse_content_range(request.headers.get("content-range"))
    if total != session["size"]:
        raise HTTPException(status_code=400, detail="Chunk total does not match upload size")
    if start != session["uploaded_bytes"]:
        raise HTTPException(status_code=409, detail=f"Expected chunk to start at byte {session['uploaded_bytes']}")
    payload = await request.body()
    if len(payload) != end - start + 1:
        raise HTTPException(status_code=400, detail="Chunk size does not match Content-Range")
    temp_path = DEV_STORAGE._target(f".tmp/app-storage/{upload_id}.part")
    with temp_path.open("ab") as fh:
        fh.write(payload)
    session["uploaded_bytes"] = end + 1
    if session["uploaded_bytes"] >= session["size"]:
        final_path = DEV_STORAGE._target(session["object_path"])
        final_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.replace(final_path)
        session["complete"] = True
        return Response(status_code=201)
    return Response(status_code=308, headers={"Range": f"bytes=0-{session['uploaded_bytes'] - 1}"})

@app.on_event("startup")
async def create_local_database_tables():
    if engine is None:
        return
    async with engine.begin() as conn:
        await conn.run_sync(PluginBase.metadata.create_all)
