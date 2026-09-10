"""Deterministic ApiError: code stable, message, details {}, retryable, trace_id (Bible §25)."""
import uuid


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict | None = None, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}
        self.retryable = retryable
        self.trace_id = uuid.uuid4().hex

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "retryable": self.retryable,
            "trace_id": self.trace_id,
        }


# Common stable error codes
def not_found(entity: str, entity_id: str = "") -> ApiError:
    return ApiError(f"{entity.upper()}_NOT_FOUND", f"{entity} not found", 404, {"id": entity_id})


def forbidden(message: str = "Forbidden") -> ApiError:
    return ApiError("FORBIDDEN", message, 403)


def unauthorized(message: str = "Unauthorized") -> ApiError:
    return ApiError("UNAUTHORIZED", message, 401)


def insufficient_resources(missing: dict) -> ApiError:
    return ApiError("INSUFFICIENT_RESOURCES", "Not enough resources", 409, {"missing": missing})


def queue_full() -> ApiError:
    return ApiError("REJECT_QUEUE_FULL", "All queues are busy", 409)


def spec_divergence(key: str, values: dict) -> ApiError:
    return ApiError("BLOCKED_SPEC_DIVERGENCE", f"Spec divergence on {key}", 500, {"key": key, **values})
