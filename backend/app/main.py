"""NyayaAI FastAPI application."""
from __future__ import annotations

import logging
import re
import shutil
import threading
import traceback
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import agents
from .config import get_settings
from .db import Case, Document, SessionLocal, db_kind, init_db
from .errors import AppError, DocumentError, NotFound
from .extraction import EXHIBIT_EXTS, SUPPORTED_EXTS, extract_text, nlp_status
from .llm import MISSING_KEY_HINT, MISSING_KEY_MSG, require_api_key
from .report import build_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nyaya")

app = FastAPI(title="NyayaAI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

CATEGORIES = ("fir", "witness", "arguments", "evidence")
_progress_lock = threading.Lock()


# ------------------------------------------------------------ error handling
# Every error leaves the API as JSON {detail, code, hint} so the UI can show it.

@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    msgs = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=422, content={"detail": f"Invalid request — {msgs}", "code": "validation_error"})


@app.exception_handler(Exception)
async def unhandled_handler(_: Request, exc: Exception):
    log.error("Unhandled error: %s", traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}", "code": "internal_error",
                 "hint": "Check the backend terminal for the full traceback."},
    )


@app.on_event("startup")
def _startup():
    init_db()
    s = get_settings()
    if not s.gemini_api_key:
        log.warning("%s %s", MISSING_KEY_MSG, MISSING_KEY_HINT)
    # Recover cases that were mid-flight when the server stopped.
    with SessionLocal() as db:
        for c in db.query(Case).filter(Case.status.in_(["queued", "processing"])):
            c.status = "failed"
            c.error = {"detail": "The server restarted while this case was being analysed.",
                       "code": "interrupted", "hint": "Click Retry to run the analysis again."}
        db.commit()


# ------------------------------------------------------------ serialisation

def _summary(c: Case) -> dict:
    cs = ((c.result or {}).get("consensus") or {})
    return {
        "id": c.id,
        "title": c.title,
        "status": c.status,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
        "document_count": len(c.documents),
        "overall_confidence": cs.get("overall_confidence"),
        "contradiction_count": len(((c.result or {}).get("agents", {}).get("contradictions", {}) or {}).get("contradictions") or []),
        "error": c.error,
    }


def _detail(c: Case) -> dict:
    return {
        **_summary(c),
        "description": c.description,
        "progress": c.progress,
        "steps": [{"key": k, "label": label, **(c.progress or {}).get(k, {"status": "pending"})} for k, label in agents.STEPS],
        "documents": [
            {"id": d.id, "category": d.category, "filename": d.filename, "char_count": d.char_count, "warning": d.warning}
            for d in c.documents
        ],
        "entities": c.entities,
        "result": c.result,
    }


def _get_case(db, case_id: str) -> Case:
    c = db.get(Case, case_id)
    if not c:
        raise NotFound(f"Case '{case_id}' was not found.")
    return c


# ------------------------------------------------------------ pipeline

def _set_progress(case_id: str, step: str, status: str, detail: str | None = None):
    with _progress_lock, SessionLocal() as db:
        c = db.get(Case, case_id)
        if not c:
            return
        prog = dict(c.progress or {})
        prog[step] = {"status": status, **({"detail": detail} if detail else {})}
        c.progress = prog
        if status == "running":
            c.status = "processing"
        db.commit()


def _run_analysis(case_id: str):
    try:
        _set_progress(case_id, "extract_text", "running")
        with SessionLocal() as db:
            c = _get_case(db, case_id)
            for d in c.documents:
                if not d.text and not d.warning:
                    text, warning = extract_text(Path(d.path))
                    limit = get_settings().max_chars_per_doc
                    if len(text) > limit:
                        warning = f"Truncated to first {limit:,} of {len(text):,} characters."
                        text = text[:limit]
                    d.text, d.char_count, d.warning = text, len(text), warning
            db.commit()
            docs = [{"filename": d.filename, "category": d.category, "text": d.text, "warning": d.warning} for d in c.documents]
            state = {"title": c.title, "description": c.description, "documents": docs}

        if not any(d["text"].strip() for d in docs):
            raise DocumentError(
                "None of the uploaded documents contain readable text.",
                hint="Upload text-based PDFs, DOCX or TXT files (scanned PDFs need OCR first).",
            )
        _set_progress(case_id, "extract_text", "done")

        final = agents.run_pipeline(state, lambda step, status, detail: _set_progress(case_id, step, status, detail))

        with SessionLocal() as db:
            c = _get_case(db, case_id)
            c.entities = final["entities"]
            c.result = agents.assemble_result(final)
            c.status, c.error = "completed", None
            db.commit()
        log.info("Case %s completed", case_id)
    except Exception as exc:
        log.error("Case %s failed: %s", case_id, traceback.format_exc())
        err = exc.to_dict() if isinstance(exc, AppError) else {
            "detail": f"Analysis crashed: {type(exc).__name__}: {exc}",
            "code": "internal_error",
            "hint": "Check the backend terminal for the full traceback.",
        }
        with _progress_lock, SessionLocal() as db:
            c = db.get(Case, case_id)
            if c:
                prog = dict(c.progress or {})
                for k, v in prog.items():
                    if v.get("status") == "running":
                        prog[k] = {"status": "failed", "detail": err["detail"]}
                c.progress, c.status, c.error = prog, "failed", err
                db.commit()


# ------------------------------------------------------------ routes

@app.get("/api/health")
def health():
    s = get_settings()
    db_ok, db_error = True, None
    try:
        with SessionLocal() as db:
            db.query(Case).limit(1).all()
    except Exception as exc:
        db_ok, db_error = False, str(exc)
    issues = []
    if not s.gemini_api_key:
        issues.append({"code": "missing_api_key", "detail": MISSING_KEY_MSG, "hint": MISSING_KEY_HINT})
    if not db_ok:
        issues.append({"code": "db_error", "detail": f"Database unavailable: {db_error}", "hint": "Check DATABASE_URL in backend/.env."})
    return {
        "status": "ok" if not issues else "degraded",
        "gemini": {"configured": bool(s.gemini_api_key), "model": s.gemini_model},
        "database": {"ok": db_ok, "kind": db_kind()},
        "nlp": nlp_status(),
        "accepted_extensions": sorted(SUPPORTED_EXTS | EXHIBIT_EXTS),
        "issues": issues,
    }


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


@app.post("/api/cases", status_code=201)
async def create_case(
    background: BackgroundTasks,
    title: str = Form(...),
    description: str = Form(""),
    fir: list[UploadFile] = File(default=[]),
    witness: list[UploadFile] = File(default=[]),
    arguments: list[UploadFile] = File(default=[]),
    evidence: list[UploadFile] = File(default=[]),
):
    require_api_key()  # fail fast with a clear message instead of queueing a doomed job
    if not title.strip():
        raise DocumentError("Please give the case a title.")
    uploads = [(cat, f) for cat, files in zip(CATEGORIES, (fir, witness, arguments, evidence)) for f in files if f.filename]
    if not uploads:
        raise DocumentError("Upload at least one document.", hint="An FIR or witness statement is a good start.")
    allowed = SUPPORTED_EXTS | EXHIBIT_EXTS
    bad = [f.filename for _, f in uploads if Path(f.filename).suffix.lower() not in allowed]
    if bad:
        raise DocumentError(f"Unsupported file type: {', '.join(bad)}", hint=f"Allowed: {', '.join(sorted(allowed))}")

    with SessionLocal() as db:
        c = Case(title=title.strip(), description=description.strip(), status="queued",
                 progress={k: {"status": "pending"} for k, _ in agents.STEPS})
        db.add(c)
        db.flush()
        case_dir = get_settings().upload_dir / c.id
        case_dir.mkdir(parents=True, exist_ok=True)
        for i, (cat, f) in enumerate(uploads):
            dest = case_dir / f"{i:02d}_{cat}_{_SAFE.sub('_', Path(f.filename).name)}"
            with dest.open("wb") as out:
                shutil.copyfileobj(f.file, out)
            db.add(Document(case_id=c.id, category=cat, filename=f.filename, path=str(dest)))
        db.commit()
        case_id = c.id

    background.add_task(_run_analysis, case_id)
    return {"id": case_id}


@app.get("/api/cases")
def list_cases():
    with SessionLocal() as db:
        return [_summary(c) for c in db.query(Case).order_by(Case.created_at.desc()).all()]


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    with SessionLocal() as db:
        return _detail(_get_case(db, case_id))


@app.post("/api/cases/{case_id}/retry")
def retry_case(case_id: str, background: BackgroundTasks):
    require_api_key()
    with SessionLocal() as db:
        c = _get_case(db, case_id)
        if c.status in ("queued", "processing"):
            raise AppError("This case is already being analysed.")
        c.status, c.error, c.result = "queued", None, None
        c.progress = {k: {"status": "pending"} for k, _ in agents.STEPS}
        db.commit()
    background.add_task(_run_analysis, case_id)
    return {"id": case_id}


@app.delete("/api/cases/{case_id}", status_code=204)
def delete_case(case_id: str):
    with SessionLocal() as db:
        c = _get_case(db, case_id)
        shutil.rmtree(get_settings().upload_dir / c.id, ignore_errors=True)
        db.delete(c)
        db.commit()
    return Response(status_code=204)


@app.get("/api/cases/{case_id}/report.pdf")
def download_report(case_id: str):
    with SessionLocal() as db:
        c = _get_case(db, case_id)
        if c.status != "completed":
            raise AppError("The report is only available once the analysis has completed.")
        pdf = build_pdf(c)
        name = _SAFE.sub("_", c.title)[:60] or "case"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="NyayaAI_{name}.pdf"'})
