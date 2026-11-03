"""JARVIS Mission Control RPC: the operator's diary (Calendar & Schedule).

``jarvis.schedule`` is one method with an ``action`` (the ``cron.manage`` shape) rather than
five thin ones: list, upsert and remove are the whole surface, and a client that only ever
reads should not have to know about the write verbs.

Storage and validation live in ``hermes_cli.jarvis_schedule``; this module only maps the
wire onto it. Bodies are rebound onto server.py's globals at install (``method_ctx``), which
is where ``_ok`` / ``_err`` come from.
"""

from __future__ import annotations

from .method_ctx import HandlerRegistry, bind_module

_registry = HandlerRegistry()
method = _registry.method

# JSON-RPC error codes: generic failure / invalid argument.
_E_SCHEDULE, _E_SCHEDULE_ARG = 5071, 5072


@method("jarvis.schedule")
def _(rid, params: dict) -> dict:
    """List / add / edit / delete diary entries for this home (see ``hermes_cli.jarvis_schedule``)."""
    from hermes_cli import jarvis_schedule as sched

    action = str(params.get("action") or "list").strip().lower()

    try:
        if action == "list":
            return _ok(rid, {"items": sched.load_items()})

        if action == "upsert":
            row = sched.upsert_item(params.get("item") or {})

            if row is None:
                return _err(
                    rid, _E_SCHEDULE_ARG,
                    "an entry needs a non-empty title and a real YYYY-MM-DD date")

            return _ok(rid, {"item": row, "items": sched.load_items()})

        if action == "remove":
            removed = sched.remove_item(str(params.get("id") or ""))

            return _ok(rid, {"removed": removed, "items": sched.load_items()})

        return _err(rid, _E_SCHEDULE_ARG, f"unknown action {action!r}: expected list, upsert or remove")
    except OSError as exc:
        return _err(rid, _E_SCHEDULE, f"the diary could not be written: {exc}")


def register(server) -> None:
    """Publish this module's handlers onto ``server``, rebound to its globals."""
    bind_module(globals(), server, skip=("_",))
