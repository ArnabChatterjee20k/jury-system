"""Thin Gemini wrapper that turns every failure into a clear, user-facing LLMError."""
from __future__ import annotations

import json
import logging
import re

from .config import get_settings
from .errors import ConfigError, LLMError

log = logging.getLogger(__name__)

MISSING_KEY_MSG = "GEMINI_API_KEY is not set, so the AI agents cannot run."
MISSING_KEY_HINT = (
    "Create backend/.env (copy backend/.env.example) and set GEMINI_API_KEY=<your key>. "
    "Get a key at https://aistudio.google.com/apikey. No restart needed — the key is re-read automatically."
)


def require_api_key() -> str:
    key = get_settings().gemini_api_key
    if not key:
        raise ConfigError(MISSING_KEY_MSG, hint=MISSING_KEY_HINT)
    return key


def _translate_api_error(exc, model: str) -> LLMError:
    code = getattr(exc, "code", None)
    msg = getattr(exc, "message", None) or str(exc)
    low = msg.lower()
    if "api key" in low or "api_key" in low or code in (401, 403):
        return LLMError(
            f"Gemini rejected the API key: {msg}",
            hint="Check GEMINI_API_KEY in backend/.env — it may be invalid, revoked, or missing API access.",
        )
    if code == 404 or "not found" in low:
        return LLMError(
            f"Gemini model '{model}' is not available: {msg}",
            hint="Set GEMINI_MODEL in backend/.env to a model your key can use (e.g. gemini-2.5-flash).",
        )
    if code == 429:
        return LLMError(
            f"Gemini rate limit / quota exceeded: {msg}",
            hint="Wait a minute and click Retry, or check your quota in Google AI Studio.",
        )
    if code and code >= 500:
        return LLMError(f"Gemini service error ({code}): {msg}", hint="This is usually temporary — click Retry.")
    return LLMError(f"Gemini request failed ({code}): {msg}")


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    raise LLMError("Gemini returned a response that was not valid JSON.", hint="Click Retry — this is usually transient.")


def generate_json(system: str, prompt: str, *, temperature: float = 0.2) -> dict:
    key = require_api_key()
    settings = get_settings()

    from google import genai
    from google.genai import errors, types

    client = genai.Client(api_key=key)
    try:
        resp = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json",
            ),
        )
    except errors.APIError as exc:
        log.warning("Gemini API error: %s", exc)
        raise _translate_api_error(exc, settings.gemini_model) from exc
    except Exception as exc:  # network errors, DNS, timeouts
        log.exception("Gemini call failed")
        raise LLMError(
            f"Could not reach Gemini: {type(exc).__name__}: {exc}",
            hint="Check the backend machine's internet connection, then Retry.",
        ) from exc

    if not resp.text:
        reason = None
        try:
            reason = resp.candidates[0].finish_reason
        except Exception:
            pass
        raise LLMError(
            f"Gemini returned an empty response (finish reason: {reason}).",
            hint="The content may have been blocked by safety filters. Try again or trim the documents.",
        )
    return _parse_json(resp.text)
