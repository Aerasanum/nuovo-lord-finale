"""Per-request fields for error logs (spec.observability.structured_log_fields).

Every error the API returns already carries a `trace_id`, but until now that id existed only in the response body:
a player quoting the code on their screen had nothing on the server to match it against, and for a 500 the id in
the body was not even the one next to the stack trace in the log. The spec asks for trace_id, world_id, player_id,
action_type and entity_id on the log line; the ones the request discovers about itself are collected here and
emitted when it fails.

A ContextVar is the right holder because Starlette runs each request in its own task, which gets its own copy of
the context — one request's player id can never bleed into another's log line.
"""
from __future__ import annotations

from contextvars import ContextVar

_fields: ContextVar[dict[str, str]] = ContextVar("request_fields", default={})


def bind(**fields: str | None) -> None:
    """Record what this request turned out to be about. Values that are None are left out."""
    _fields.set({**_fields.get(), **{k: str(v) for k, v in fields.items() if v is not None}})


def describe(trace_id: str, action_type: str) -> str:
    """The fields as `key=value` pairs, trace_id first so it leads the log line."""
    return " ".join(f"{k}={v}" for k, v in {"trace_id": trace_id, "action_type": action_type, **_fields.get()}.items())
