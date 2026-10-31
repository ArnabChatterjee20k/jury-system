# NyayaAI ⚖️

**AI-powered multi-agent legal analysis system for Indian courts.**

NyayaAI helps organise and analyse legal case documents using several independent AI agents (powered by Google Gemini) and a consensus engine. It **does not replace judges**. It is an assistive tool for summarising cases, analysing evidence, detecting contradictions and surfacing relevant law. Every output must be verified by a qualified legal professional.

```
Upload Case Documents
        ↓
NLP Extraction Layer (spaCy + legal regexes)
        ↓
Multiple AI Agents Analyse Independently (LangGraph, run in parallel)
   ├─ Evidence Agent        — consistency, strong / weak / missing evidence
   ├─ Contradiction Agent   — timeline mismatches, conflicting statements
   └─ Legal Research Agent  — IPC/BNS sections, similar judgments, references
        ↓
Consensus Engine combines findings (confidence-weighted)
        ↓
Final Legal Analysis Report → Dashboard + downloadable PDF
```

## Tech stack

| Layer          | Tech                                                             |
| -------------- | ---------------------------------------------------------------- |
| Frontend       | React 19, Vite, Tailwind CSS v4, React Router                    |
| Backend        | Python 3.12, FastAPI                                             |
| AI layer       | LangGraph + Google Gemini (`google-genai`)                       |
| NLP            | spaCy (`en_core_web_sm`) + regex extraction of sections, dates, FIR numbers |
| Database       | SQLite by default; PostgreSQL via `DATABASE_URL`                 |
| PDF processing | pdfplumber (input), python-docx (DOCX), ReportLab (report output)|

## Screens

1. **Landing**: Upload Case, View Reports, Dashboard
2. **Case Upload**: drag-and-drop zones for FIR, witness statements, arguments and evidence files
3. **Processing**: live step-by-step progress ("Extracting entities…", "Running Evidence Agent…", "Checking contradictions…"), with any errors shown inline and a Retry button
4. **Case Dashboard**: case summary and timeline, evidence analysis, contradictions, legal observations, agent opinions with confidence scores, the final consensus report and a PDF download
5. **Reports / Dashboard**: all cases, stats and system status

## Prerequisites

- **Python 3.12** (spaCy does not support 3.14 yet). The easiest route is [uv](https://docs.astral.sh/uv/), which downloads 3.12 for you.
- **Node.js 18+** and npm
- A **Gemini API key** from https://aistudio.google.com/apikey

## Setup

### 1. Backend

```bash
cd backend

# Create a Python 3.12 virtual env and install dependencies
uv venv --python 3.12 .venv
uv pip install --python .venv -r requirements.txt
uv pip install --python .venv "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"

# Configure
cp .env.example .env
# then edit .env and set GEMINI_API_KEY=...
```

<details>
<summary>Without uv (plain pip)</summary>

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
cp .env.example .env
```
</details>

### 2. Frontend

```bash
cd frontend
npm install
```

## Running

Open two terminals.

**Terminal 1: backend (http://localhost:8000)**

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Terminal 2: frontend (http://localhost:5173)**

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend. To use a different backend address, set `VITE_BACKEND_URL=http://host:port npm run dev`.

### Try it with the sample case

`sample_case/` holds a fictional murder case (FIR, two witness statements, a post-mortem summary and defence arguments) with deliberate contradictions (9 PM vs 11 PM, red jacket vs black hoodie, broken vs working street light). Upload each file into its matching category and click **Analyse Case**.

## Configuration (`backend/.env`)

| Variable            | Default                         | Description                                   |
| ------------------- | ------------------------------- | --------------------------------------------- |
| `GEMINI_API_KEY`    | (required)                      | Google Gemini API key                         |
| `GEMINI_MODEL`      | `gemini-2.5-flash`              | Any Gemini model your key can access          |
| `DATABASE_URL`      | `sqlite:///backend/nyaya.db`    | e.g. `postgresql+psycopg://user:pass@localhost:5432/nyaya` |
| `MAX_CHARS_PER_DOC` | `60000`                         | Longer documents are truncated (with a warning) |
| `UPLOAD_DIR`        | `backend/uploads`               | Where uploaded files are stored               |
| `CORS_ORIGINS`      | `http://localhost:5173`         | Comma-separated origins                       |

`.env` is re-read on every request, so adding or changing the Gemini key **takes effect without restarting** the backend.

### Using PostgreSQL

```bash
createdb nyaya
echo 'DATABASE_URL=postgresql+psycopg://localhost:5432/nyaya' >> backend/.env
```

Tables are created automatically on startup.

## Error handling

Backend failures are always shown in the UI, never just in the terminal:

- **Missing `GEMINI_API_KEY`**: a red banner appears on every page, the upload page blocks submission and explains the fix, and the API returns `503` with the message and a hint.
- **Backend not running**: the banner shows "Cannot reach the NyayaAI backend" with the command to start it.
- **Invalid key, wrong model, quota exceeded, network or safety-filter errors**: the analysis is marked *failed*, the failing agent step shows the reason on the Processing screen, and a **Retry** button re-runs the analysis (for example after you fix the key).
- **Unreadable or unsupported files** (corrupt files, scanned PDFs with no text): clear per-file messages.
- **Any unexpected crash**: returned as JSON `{detail, code, hint}` and shown in the UI. The full traceback stays in the backend terminal.

## API

| Method | Path                         | Description                                   |
| ------ | ---------------------------- | --------------------------------------------- |
| GET    | `/api/health`                | Gemini, DB and NLP status, plus any config issues |
| POST   | `/api/cases`                 | Multipart: `title`, `description`, files under `fir`, `witness`, `arguments`, `evidence` |
| GET    | `/api/cases`                 | List cases                                    |
| GET    | `/api/cases/{id}`            | Case detail, progress steps and results       |
| POST   | `/api/cases/{id}/retry`      | Re-run a failed analysis                      |
| GET    | `/api/cases/{id}/report.pdf` | Download the PDF report                       |
| DELETE | `/api/cases/{id}`            | Delete a case and its files                   |

Interactive docs: http://localhost:8000/docs

## Project structure

```
backend/
  app/
    main.py         FastAPI routes, background analysis, error handlers
    agents.py       LangGraph graph: NLP → 3 parallel agents → consensus
    llm.py          Gemini wrapper; turns API failures into user-facing errors
    extraction.py   PDF/DOCX/TXT text extraction + spaCy/regex entity extraction
    report.py       PDF report (ReportLab)
    db.py           SQLAlchemy models (Case, Document)
    config.py       Settings loaded from .env
    errors.py       Error types carrying message + hint
frontend/
  src/
    api.js          API client (normalises errors)
    components/     Layout, health banner, shared UI
    pages/          Landing, Upload, Processing, CaseDashboard, Reports, Dashboard
sample_case/        Fictional demo case documents
```

## Accuracy and limitations

This is an AI-assisted analysis prototype, not a replacement for judicial decision-making. Accuracy depends on the quality of the input documents and on the LLM's responses. LLMs **can hallucinate**, including section numbers and case citations. To improve reliability, NyayaAI uses several independent agents and a consensus engine that surfaces disagreements instead of hiding them, rather than relying on a single model output. Final legal interpretation and judgment must always remain under human supervision.
