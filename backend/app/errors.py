"""Application errors that carry a user-facing message.

Anything raised as an AppError is shown verbatim in the UI, so messages should
tell the user what went wrong and how to fix it.
"""
from __future__ import annotations


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, *, hint: str | None = None):
        super().__init__(message)
        self.message = message
        self.hint = hint

    def to_dict(self) -> dict:
        return {"detail": self.message, "code": self.code, "hint": self.hint}


class ConfigError(AppError):
    status_code = 503
    code = "config_error"


class LLMError(AppError):
    status_code = 502
    code = "llm_error"


class DocumentError(AppError):
    status_code = 422
    code = "document_error"


class NotFound(AppError):
    status_code = 404
    code = "not_found"
