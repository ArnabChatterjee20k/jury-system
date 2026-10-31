"""Render a completed case analysis as a downloadable PDF report."""
from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .db import Case

_ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=_ss["Title"], fontSize=20, spaceAfter=4)
H2 = ParagraphStyle("H2", parent=_ss["Heading2"], textColor=colors.HexColor("#1e3a8a"), spaceBefore=10)
H3 = ParagraphStyle("H3", parent=_ss["Heading4"], spaceBefore=6)
BODY = ParagraphStyle("Body", parent=_ss["BodyText"], fontSize=9.5, leading=13)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8, textColor=colors.HexColor("#555555"))


def _p(text, style=BODY):
    return Paragraph(escape(str(text if text is not None else "—")).replace("\n", "<br/>"), style)


def _bullets(items):
    items = [i for i in (items or []) if i]
    if not items:
        return _p("None reported.", SMALL)
    return ListFlowable([ListItem(_p(i)) for i in items], bulletType="bullet", leftIndent=12)


def _table(header, rows, widths):
    if not rows:
        return _p("None reported.", SMALL)
    data = [[_p(h, SMALL) for h in header]] + [[_p(c) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7d2fe")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def build_pdf(case: Case) -> bytes:
    res = case.result or {}
    con = res.get("consensus", {})
    agents = res.get("agents", {})
    ev, ct, lg = agents.get("evidence", {}), agents.get("contradictions", {}), agents.get("legal", {})
    cs = con.get("case_summary", {})
    W = 180 * mm

    s = [
        Paragraph("NyayaAI — Case Analysis Report", H1),
        _p(f"{case.title}  ·  Generated {case.updated_at:%d %b %Y %H:%M} UTC  ·  Case ID {case.id}", SMALL),
        Spacer(1, 6),
        _p(res.get("disclaimer", ""), SMALL),
        Paragraph("1. Case Summary", H2),
        _p(cs.get("overview")),
        Spacer(1, 4),
        _table(
            ["Field", "Details"],
            [
                ["Accused", ", ".join(cs.get("accused") or []) or "—"],
                ["Complainant / Victim", ", ".join(cs.get("complainants_victims") or []) or "—"],
                ["Witnesses", ", ".join(cs.get("witnesses") or []) or "—"],
                ["Incident date", cs.get("incident_date") or "—"],
                ["Location", cs.get("location") or "—"],
                ["Sections involved", "; ".join(cs.get("sections_involved") or []) or "—"],
            ],
            [40 * mm, W - 40 * mm],
        ),
        Paragraph("Timeline", H3),
        _table(
            ["When", "Event", "Source"],
            [[t.get("when"), t.get("event"), t.get("source")] for t in con.get("timeline") or ct.get("timeline") or []],
            [35 * mm, 105 * mm, 40 * mm],
        ),
        Paragraph("2. Evidence Analysis", H2),
        _p(ev.get("summary")),
    ]
    for label, key in (("Strong evidence", "strong_evidence"), ("Weak evidence", "weak_evidence")):
        s += [
            Paragraph(label, H3),
            _table(["Item", "Reason", "Source"], [[e.get("item"), e.get("reason"), e.get("source")] for e in ev.get(key) or []],
                   [55 * mm, 85 * mm, 40 * mm]),
        ]
    s += [
        Paragraph("Missing evidence", H3),
        _table(["Item", "Why it matters"], [[e.get("item"), e.get("reason")] for e in ev.get("missing_evidence") or []],
               [60 * mm, 120 * mm]),
        Paragraph("3. Contradictions Found", H2),
        _p(ct.get("summary")),
        _table(
            ["Topic", "Statement A", "Statement B", "Severity"],
            [
                [
                    c.get("topic"),
                    f"{(c.get('statement_a') or {}).get('source', '')}: {(c.get('statement_a') or {}).get('claim', '')}",
                    f"{(c.get('statement_b') or {}).get('source', '')}: {(c.get('statement_b') or {}).get('claim', '')}",
                    c.get("severity"),
                ]
                for c in ct.get("contradictions") or []
            ],
            [30 * mm, 65 * mm, 65 * mm, 20 * mm],
        ),
        Paragraph("4. Legal Observations", H2),
        _p(lg.get("summary")),
        Paragraph("Relevant sections", H3),
        _table(
            ["Code", "Section", "Title", "Applicability"],
            [[x.get("code"), x.get("section"), x.get("title"), x.get("applicability")] for x in lg.get("sections") or []],
            [18 * mm, 18 * mm, 50 * mm, 94 * mm],
        ),
        Paragraph("Similar judgments (verify before relying)", H3),
        _table(
            ["Case", "Citation", "Principle"],
            [[j.get("case_name"), j.get("citation"), j.get("principle")] for j in lg.get("similar_judgments") or []],
            [50 * mm, 40 * mm, 90 * mm],
        ),
        Paragraph("5. Agent Opinions", H2),
        _table(
            ["Agent", "Confidence", "Key findings"],
            [
                [name, f"{round(a.get('confidence', 0) * 100)}%", "\n".join(f"• {f}" for f in a.get("findings") or [])]
                for name, a in (("Evidence Agent", ev), ("Contradiction Agent", ct), ("Legal Research Agent", lg))
            ],
            [38 * mm, 22 * mm, 120 * mm],
        ),
        Paragraph("6. Final Consensus Report", H2),
        _p(f"Overall confidence: {round(con.get('overall_confidence', 0) * 100)}% "
           f"(agent mean {round(con.get('agent_mean_confidence', 0) * 100)}%)", SMALL),
        _p(con.get("overall_assessment")),
        Paragraph("Points of agreement", H3), _bullets(con.get("agreement_points")),
        Paragraph("Disagreements / uncertainty", H3), _bullets(con.get("disagreements")),
        Paragraph("Key observations", H3), _bullets(con.get("key_observations")),
        Paragraph("Recommended next steps", H3), _bullets(con.get("recommended_next_steps")),
        Paragraph("Documents analysed", H2),
        _table(["Category", "File", "Characters"], [[d.category, d.filename, d.char_count] for d in case.documents],
               [35 * mm, 115 * mm, 30 * mm]),
    ]

    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm,
                      bottomMargin=15 * mm, title=f"NyayaAI — {case.title}").build(s)
    return buf.getvalue()
