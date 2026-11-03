"""JARVIS Mission Control contracts: the operator's diary.

``jarvis.schedule`` carries the Calendar & Schedule entries the desktop panel renders.
Field names are snake_case exactly as they travel; the panel maps them onto its own
camelCase store at the boundary.
"""

from __future__ import annotations

from .base import Params, Payload, Result, WireEnum
from .registry import method


class ScheduleKind(WireEnum):
    """What kind of commitment an entry is; drives its badge in the panel."""

    client = "client"
    deadline = "deadline"
    meeting = "meeting"
    task = "task"
    travel = "travel"


class ScheduleItem(Payload):
    """One diary entry. ``date`` is a local calendar day, ``time`` a local 24h clock."""

    id: str
    title: str
    date: str
    kind: ScheduleKind
    done: bool
    created_at: int
    updated_at: int
    detail: str | None = None
    time: str | None = None
    source: str | None = None


class ScheduleDraft(Payload):
    """An entry to write. ``id`` names an existing entry to patch; unknown keys are ignored."""

    date: str | None = None
    detail: str | None = None
    done: bool | None = None
    id: str | None = None
    kind: ScheduleKind | None = None
    source: str | None = None
    time: str | None = None
    title: str | None = None


class ScheduleParams(Params):
    """``action`` selects the verb; ``item`` is the upsert payload, ``id`` the remove target."""

    action: str = "list"
    id: str | None = None
    item: ScheduleDraft | None = None


class ScheduleResult(Result):
    """The refreshed list always travels back, so a client never needs a second round trip."""

    items: list[ScheduleItem]
    item: ScheduleItem | None = None
    removed: bool | None = None


method("jarvis.schedule", params=ScheduleParams, result=ScheduleResult,
       doc="List, add, edit or delete the operator's diary entries for this home.")
