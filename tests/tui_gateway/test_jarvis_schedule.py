"""``jarvis.schedule``: the operator's diary — validation, patch semantics, atomic writes.

The panel renders whatever this store returns, so the cases that matter are the ones a
human can produce by hand: a bad date, an edited file, a patch that would blank a title.
"""

from __future__ import annotations

import json

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A profile home this test owns; the store resolves it at call time."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    return tmp_path


def call(params: dict) -> dict:
    from tui_gateway import server

    resp = server.handle_request({"jsonrpc": "2.0", "id": 1, "method": "jarvis.schedule", "params": params})
    assert "error" not in resp, resp

    return resp["result"]


def test_empty_home_lists_nothing(home):
    assert call({"action": "list"})["items"] == []


def test_upsert_stores_a_validated_row_and_lists_it_sorted(home):
    call({"action": "upsert", "item": {
        "title": "Return to Ahmedabad", "date": "2026-11-14", "time": "21:30", "kind": "travel"}})
    call({"action": "upsert", "item": {
        "title": "Fly to Kolkata — BNPL client", "date": "2026-11-09", "time": "05:05",
        "kind": "travel", "detail": "Akasa QP 1925, PNR BE9D7R"}})
    call({"action": "upsert", "item": {"title": "BNPL kickoff", "date": "2026-11-10", "kind": "client"}})

    items = call({"action": "list"})["items"]

    assert [i["date"] for i in items] == ["2026-11-09", "2026-11-10", "2026-11-14"]
    assert items[0]["time"] == "05:05"
    assert items[0]["detail"] == "Akasa QP 1925, PNR BE9D7R"
    assert items[1]["kind"] == "client"
    assert all(i["done"] is False and i["id"] for i in items)
    # The document is versioned, so a future shape change can migrate instead of guess.
    on_disk = json.loads((home / "jarvis" / "schedule.json").read_text())
    assert on_disk["version"] == 1
    assert len(on_disk["items"]) == 3


def test_upsert_without_a_real_date_or_title_is_refused(home):
    from tui_gateway import server

    for item in (
        {"title": "Impossible day", "date": "2026-02-31"},
        {"title": "   ", "date": "2026-11-09"},
        {"title": "No date"},
    ):
        resp = server.handle_request({
            "jsonrpc": "2.0", "id": 1, "method": "jarvis.schedule", "params": {"action": "upsert", "item": item}})
        assert resp["error"]["code"] == 5072, resp
    assert call({"action": "list"})["items"] == []


def test_a_patch_keeps_identity_and_timestamps_and_cannot_blank_a_title(home):
    from tui_gateway import server

    created = call({"action": "upsert", "item": {"title": "Sign the BNPL MSA", "date": "2026-11-12"}})["item"]

    patched = call({"action": "upsert", "item": {"id": created["id"], "done": True}})["item"]

    assert patched["id"] == created["id"]
    assert patched["created_at"] == created["created_at"]
    assert patched["done"] is True

    refused = server.handle_request({
        "jsonrpc": "2.0", "id": 2, "method": "jarvis.schedule",
        "params": {"action": "upsert", "item": {"id": created["id"], "title": "  "}}})
    assert refused["error"]["code"] == 5072, refused
    assert call({"action": "list"})["items"][0]["title"] == "Sign the BNPL MSA"


def test_remove_reports_whether_anything_went(home):
    created = call({"action": "upsert", "item": {"title": "Cancel this", "date": "2026-11-20"}})["item"]

    removed = call({"action": "remove", "id": created["id"]})

    assert removed["removed"] is True
    assert removed["items"] == []
    assert call({"action": "remove", "id": "sched-nope"})["removed"] is False


def test_an_unknown_action_is_refused(home):
    from tui_gateway import server

    resp = server.handle_request({
        "jsonrpc": "2.0", "id": 1, "method": "jarvis.schedule", "params": {"action": "explode"}})

    assert resp["error"]["code"] == 5072, resp


def test_a_hand_edited_file_loses_broken_rows_instead_of_breaking_the_panel(home):
    (home / "jarvis").mkdir()
    (home / "jarvis" / "schedule.json").write_text(json.dumps({"version": 1, "items": [
        {"title": "Survivor", "date": "2026-11-20"},
        {"title": "Bad day", "date": "2026-02-31"},
        {"title": "", "date": "2026-11-21"},
        {"title": "Odd fields", "date": "2026-11-22", "kind": "gallivanting", "time": "99:99"},
        "not an object",
    ]}))

    items = call({"action": "list"})["items"]

    assert [i["title"] for i in items] == ["Survivor", "Odd fields"]
    # Unknown kind falls back to `task`; a malformed clock is dropped, not kept.
    assert items[1]["kind"] == "task"
    assert "time" not in items[1]


def test_a_missing_or_malformed_file_reads_as_empty(home):
    assert call({"action": "list"})["items"] == []
    (home / "jarvis").mkdir()
    (home / "jarvis" / "schedule.json").write_text("{ not json")

    assert call({"action": "list"})["items"] == []
