"""Screenshot Annotator backend.

Provides health and simple usage stats for the annotator app. All image
processing happens client-side; the backend stays minimal and dependency-free.
"""

from fastapi import Depends
from palette_sdk import PluginRouter, PluginContext, get_plugin_context

router = PluginRouter(tags=["annotator-app"])


@router.get("/health")
async def health(_ctx: PluginContext = Depends(get_plugin_context)) -> dict:
    """Liveness check used by the dashboard to show backend connectivity."""
    return {"ok": True, "service": "annotator-app"}


@router.get("/stats")
async def stats(_ctx: PluginContext = Depends(get_plugin_context)) -> dict:
    """Readiness info rendered in the dashboard footer."""
    return {
        "service": "annotator-app",
        "version": "1.0.0",
        "tools": ["arrow", "rect", "ellipse", "line", "pencil", "highlighter", "blur", "text", "number"],
        "storage": "client-side",
    }