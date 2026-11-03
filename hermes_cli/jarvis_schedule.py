"""The operator's diary — Mission Control's Calendar & Schedule entries.

One JSON document per Hermes home (``$HERMES_HOME/jarvis/schedule.json``), because the
diary belongs to the operator rather than to a session or a chat: the desktop panel, the
CLI and an agent turn all read the same list. The file is written atomically (temp file +
``os.replace``) so a reader never sees half a document, and every row is validated on the
way in AND on the way out — a hand-edited file loses its broken rows instead of breaking
the panel that renders them.

Scoping: ``get_hermes_home()`` at call time, so a profile-scoped caller resolves that
profile's home. There is no per-profile split of the diary itself — one operator, one
calendar.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any, Iterable, Optional

from hermes_constants import get_hermes_home

SCHEMA_VERSION = 1

KINDS = ("client", "deadline", "meeting", "task", "travel")
DEFAULT_KIND = "task"

MAX_TITLE = 140
MAX_DETAIL = 400
MAX_ID = 64

_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# 24h clock, 00:00–23:59 — ``99:99`` is not a time and must not survive a load.
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def schedule_path(home: Optional[Path] = None) -> Path:
    """The diary's JSON path for ``home`` (default: the active Hermes home)."""
    return (home or get_hermes_home()) / "jarvis" / "schedule.json"


def _clean_text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def valid_day(value: str) -> bool:
    """A real calendar day in ``YYYY-MM-DD`` (``2026-02-31`` rolls forward, so it fails)."""
    if not _DAY_RE.match(value):
        return False

    try:
        time.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False

    return True


def _valid_clock(value: str) -> bool:
    return bool(_TIME_RE.match(value))


def normalize(raw: Any) -> Optional[dict]:
    """The storable form of ``raw``, or ``None`` when the row is unusable.

    Unusable means: not an object, no title, or no real date. Everything else is repaired
    rather than rejected — an unknown kind becomes ``task``, a broken clock is dropped, a
    missing id or timestamp is minted.
    """
    if not isinstance(raw, dict):
        return None

    title = _clean_text(raw.get("title"), MAX_TITLE)
    date = _clean_text(raw.get("date"), 10)

    if not title or not valid_day(date):
        return None

    kind = raw.get("kind")
    kind = kind if kind in KINDS else DEFAULT_KIND
    clock = _clean_text(raw.get("time"), 5)
    detail = _clean_text(raw.get("detail"), MAX_DETAIL)
    item_id = _clean_text(raw.get("id"), MAX_ID) or new_id()
    now = int(time.time())
    created = _as_int(raw.get("created_at"), now)
    updated = _as_int(raw.get("updated_at"), created)

    row: dict = {
        "id": item_id,
        "title": title,
        "date": date,
        "kind": kind,
        "done": raw.get("done") is True,
        "created_at": created,
        "updated_at": updated,
    }

    if clock and _valid_clock(clock):
        row["time"] = clock
    if detail:
        row["detail"] = detail

    source = _clean_text(raw.get("source"), 32)
    if source:
        row["source"] = source

    return row


def _as_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def new_id() -> str:
    return f"sched-{secrets.token_hex(6)}"


def sort_items(items: Iterable[dict]) -> list[dict]:
    """Date first, then clock (all-day rows lead their day), then title."""
    return sorted(
        items,
        key=lambda i: (str(i.get("date") or ""), str(i.get("time") or ""), str(i.get("title") or "")),
    )


def load_items(home: Optional[Path] = None) -> list[dict]:
    """Every usable entry, sorted. A missing or malformed file reads as empty."""
    path = schedule_path(home)

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []

    rows = raw.get("items") if isinstance(raw, dict) else raw

    if not isinstance(rows, list):
        return []

    return sort_items(row for row in (normalize(entry) for entry in rows) if row is not None)


def save_items(items: Iterable[dict], home: Optional[Path] = None) -> list[dict]:
    """Validate + write the whole list atomically; returns what was stored."""
    rows = sort_items(row for row in (normalize(entry) for entry in items) if row is not None)
    path = schedule_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.dumps({"version": SCHEMA_VERSION, "items": rows}, indent=2, sort_keys=False)
    tmp = path.with_suffix(".json.tmp")

    tmp.write_text(payload + "\n", encoding="utf-8")
    os.replace(tmp, path)

    return rows


def upsert_item(fields: Any, home: Optional[Path] = None) -> Optional[dict]:
    """Create (empty/unknown ``id``) or patch an entry. ``None`` when it cannot be built.

    A patch only touches the keys it carries, so an edit that would empty the title or
    wreck the date is refused outright instead of silently blanking somebody's diary.
    """
    if not isinstance(fields, dict):
        return None

    existing = {item["id"]: item for item in load_items(home)}
    item_id = _clean_text(fields.get("id"), MAX_ID)
    current = existing.get(item_id)

    merged = dict(current or {})
    merged.update({key: value for key, value in fields.items() if value is not None})

    if current is not None:
        merged["id"] = current["id"]
        merged["created_at"] = current["created_at"]

    merged["updated_at"] = int(time.time())

    row = normalize(merged)

    if row is None:
        return None

    if current is None:
        row["created_at"] = int(time.time())

    rows = [item for item in load_items(home) if item["id"] != row["id"]]
    rows.append(row)
    save_items(rows, home)

    return row


def remove_item(item_id: str, home: Optional[Path] = None) -> bool:
    """Drop one entry by id; False when nothing matched."""
    wanted = _clean_text(item_id, MAX_ID)

    if not wanted:
        return False

    rows = load_items(home)
    remaining = [item for item in rows if item["id"] != wanted]

    if len(remaining) == len(rows):
        return False

    save_items(remaining, home)

    return True
