"""Multi-agent analysis pipeline built on LangGraph.

    nlp ──┬── evidence_agent ──────┐
          ├── contradiction_agent ─┼── consensus ── END
          └── legal_agent ─────────┘

The three agents run in parallel and independently over the same case file;
the consensus engine then reconciles their findings.
"""
from __future__ import annotations

import json
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from .extraction import extract_entities
from .llm import generate_json

DISCLAIMER = (
    "This is an AI-assisted analysis for organising case material. It is not legal advice and "
    "does not replace judicial decision-making. All findings, sections and citations must be "
    "verified by a qualified legal professional."
)

STEPS = [
    ("extract_text", "Extracting text from documents"),
    ("nlp", "Extracting entities (people, dates, sections)"),
    ("evidence_agent", "Running Evidence Agent"),
    ("contradiction_agent", "Checking contradictions"),
    ("legal_agent", "Running Legal Research Agent"),
    ("consensus", "Building consensus report"),
]

ProgressFn = Callable[[str, str, str | None], None]  # (step, status, detail)


class CaseState(TypedDict, total=False):
    title: str
    description: str
    documents: list[dict]  # [{filename, category, text, warning}]
    entities: dict
    evidence: dict
    contradictions: dict
    legal: dict
    consensus: dict


CATEGORY_LABEL = {
    "fir": "FIR",
    "witness": "Witness Statement",
    "arguments": "Arguments",
    "evidence": "Evidence",
}


def _case_file(state: CaseState) -> str:
    parts = [f"CASE TITLE: {state.get('title', '')}"]
    if state.get("description"):
        parts.append(f"CASE NOTES FROM USER: {state['description']}")
    for i, d in enumerate(state["documents"], 1):
        label = CATEGORY_LABEL.get(d["category"], d["category"])
        body = d["text"] if d["text"].strip() else f"(no text extracted — {d.get('warning') or 'empty'})"
        parts.append(f"\n===== DOCUMENT {i}: [{label}] {d['filename']} =====\n{body}")
    return "\n".join(parts)


def _entities_brief(entities: dict) -> str:
    brief = {k: [e["text"] for e in v[:15]] for k, v in entities.items() if isinstance(v, list)}
    return json.dumps(brief, ensure_ascii=False)


AGENT_SYSTEM = (
    "You are a specialised analyst in an AI-assisted legal analysis system for Indian courts. "
    "You assist, you do not judge. Ground every finding in the supplied documents and name the "
    "source document. Never invent facts. If something is uncertain, say so and lower your "
    "confidence. Respond ONLY with JSON matching the requested schema."
)

EVIDENCE_PROMPT = """You are the EVIDENCE AGENT. Assess the evidence in this case file:
- Is the evidence internally consistent?
- Which documents support or corroborate each other?
- What evidence is strong, what is weak, and what is missing that would normally be expected
  (e.g. medical report, post-mortem, forensic report, CCTV, seizure memo, independent witness)?

Return JSON:
{{
  "summary": "2-4 sentence overview",
  "strong_evidence": [{{"item": "...", "reason": "...", "source": "document name"}}],
  "weak_evidence":   [{{"item": "...", "reason": "...", "source": "document name"}}],
  "missing_evidence":[{{"item": "...", "reason": "why it matters"}}],
  "findings": ["key finding", "..."],
  "confidence": 0.0-1.0
}}

NLP-extracted entities (may be noisy): {entities}

CASE FILE:
{case_file}
"""

CONTRADICTION_PROMPT = """You are the CONTRADICTION AGENT. Examine the case file for:
- timeline mismatches (e.g. witness A says 9 PM, witness B says 11 PM)
- conflicting statements between witnesses, FIR, and arguments
- logical inconsistencies (impossible sequences, location conflicts, changed versions)
Also reconstruct the most likely timeline of events.

Return JSON:
{{
  "summary": "2-4 sentence overview",
  "contradictions": [{{
      "topic": "short label",
      "statement_a": {{"source": "document name", "claim": "..."}},
      "statement_b": {{"source": "document name", "claim": "..."}},
      "severity": "low|medium|high",
      "explanation": "why this matters"
  }}],
  "timeline": [{{"when": "date/time as stated", "event": "...", "source": "document name"}}],
  "findings": ["key finding", "..."],
  "confidence": 0.0-1.0
}}

NLP-extracted entities (may be noisy): {entities}

CASE FILE:
{case_file}
"""

LEGAL_PROMPT = """You are the LEGAL RESEARCH AGENT for Indian law. Identify:
- relevant sections under IPC and their Bharatiya Nyaya Sanhita (BNS, 2023) equivalents,
  plus procedural/evidence provisions (CrPC/BNSS, Evidence Act/BSA) where relevant
- well-known Indian judgments with similar facts or legal principles
- other legal references (doctrines, tests, principles)
Only cite judgments you are confident exist; mark uncertain ones with "verify": true.

Return JSON:
{{
  "summary": "2-4 sentence overview",
  "sections": [{{"code": "IPC|BNS|CrPC|BNSS|BSA|Other", "section": "302", "title": "...",
                 "applicability": "why it may apply, from the facts", "mentioned_in_documents": true}}],
  "similar_judgments": [{{"case_name": "...", "citation": "...", "principle": "...", "verify": false}}],
  "legal_references": ["..."],
  "findings": ["key finding", "..."],
  "confidence": 0.0-1.0
}}

NLP-extracted entities (may be noisy): {entities}

CASE FILE:
{case_file}
"""

CONSENSUS_SYSTEM = (
    "You are the CONSENSUS ENGINE of a multi-agent legal analysis system for Indian courts. "
    "You receive independent reports from an Evidence Agent, a Contradiction Agent and a Legal "
    "Research Agent. Reconcile them: keep points that are supported, flag disagreements, and "
    "weigh each agent by its confidence. Do not introduce facts absent from the inputs. "
    "Respond ONLY with JSON."
)

CONSENSUS_PROMPT = """Combine the agent reports into a final structured analysis.

Return JSON:
{{
  "case_summary": {{
     "title": "...",
     "overview": "4-6 sentence neutral summary of the case",
     "accused": ["..."],
     "complainants_victims": ["..."],
     "witnesses": ["..."],
     "incident_date": "...",
     "location": "...",
     "sections_involved": ["Section 302 IPC / 103 BNS", "..."]
  }},
  "timeline": [{{"when": "...", "event": "...", "source": "..."}}],
  "agreement_points": ["points where agents agree"],
  "disagreements": ["points where agents differ or are uncertain"],
  "key_observations": ["..."],
  "recommended_next_steps": ["investigative / evidentiary steps for the human reviewer"],
  "overall_assessment": "neutral reasoning paragraph combining all agents; no verdict",
  "overall_confidence": 0.0-1.0
}}

NLP ENTITIES: {entities}

EVIDENCE AGENT REPORT:
{evidence}

CONTRADICTION AGENT REPORT:
{contradictions}

LEGAL RESEARCH AGENT REPORT:
{legal}

ORIGINAL CASE FILE (for reference):
{case_file}
"""


def _clamp(x: Any) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.5


def build_graph(progress: ProgressFn):
    def tracked(step: str, fn: Callable[[CaseState], dict]):
        def node(state: CaseState) -> dict:
            progress(step, "running", None)
            try:
                out = fn(state)
            except Exception as exc:
                progress(step, "failed", str(exc))
                raise
            progress(step, "done", None)
            return out

        return node

    def nlp(state: CaseState) -> dict:
        return {"entities": extract_entities(state["documents"])}

    def agent(key: str, template: str):
        def run(state: CaseState) -> dict:
            out = generate_json(
                AGENT_SYSTEM,
                template.format(entities=_entities_brief(state["entities"]), case_file=_case_file(state)),
            )
            out["confidence"] = _clamp(out.get("confidence"))
            return {key: out}

        return run

    def consensus(state: CaseState) -> dict:
        out = generate_json(
            CONSENSUS_SYSTEM,
            CONSENSUS_PROMPT.format(
                entities=_entities_brief(state["entities"]),
                evidence=json.dumps(state["evidence"], ensure_ascii=False),
                contradictions=json.dumps(state["contradictions"], ensure_ascii=False),
                legal=json.dumps(state["legal"], ensure_ascii=False),
                case_file=_case_file(state)[:40_000],
            ),
        )
        # Deterministic confidence-weighted score alongside the LLM's own estimate.
        confs = [state[k]["confidence"] for k in ("evidence", "contradictions", "legal")]
        out["agent_mean_confidence"] = round(sum(confs) / len(confs), 3)
        out["overall_confidence"] = _clamp(out.get("overall_confidence", out["agent_mean_confidence"]))
        return {"consensus": out}

    g = StateGraph(CaseState)
    g.add_node("nlp", tracked("nlp", nlp))
    g.add_node("evidence_agent", tracked("evidence_agent", agent("evidence", EVIDENCE_PROMPT)))
    g.add_node("contradiction_agent", tracked("contradiction_agent", agent("contradictions", CONTRADICTION_PROMPT)))
    g.add_node("legal_agent", tracked("legal_agent", agent("legal", LEGAL_PROMPT)))
    g.add_node("consensus", tracked("consensus", consensus))

    g.add_edge(START, "nlp")
    for a in ("evidence_agent", "contradiction_agent", "legal_agent"):
        g.add_edge("nlp", a)
    g.add_edge(["evidence_agent", "contradiction_agent", "legal_agent"], "consensus")
    g.add_edge("consensus", END)
    return g.compile()


def run_pipeline(state: CaseState, progress: ProgressFn) -> CaseState:
    return build_graph(progress).invoke(state)


def assemble_result(state: CaseState) -> dict:
    return {
        "consensus": state["consensus"],
        "agents": {
            "evidence": state["evidence"],
            "contradictions": state["contradictions"],
            "legal": state["legal"],
        },
        "disclaimer": DISCLAIMER,
    }
