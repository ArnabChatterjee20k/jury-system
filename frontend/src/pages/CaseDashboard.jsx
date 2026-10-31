import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ConfidenceBar, Empty, ErrorAlert, Section, Spinner } from "../components/ui";

const SEVERITY = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

function Field({ label, value }) {
  const v = Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{v || "—"}</p>
    </div>
  );
}

function EvidenceList({ title, items, tone }) {
  const tones = { good: "border-emerald-200 bg-emerald-50", weak: "border-amber-200 bg-amber-50", missing: "border-red-200 bg-red-50" };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="mb-2 text-sm font-semibold">{title} <span className="text-slate-500">({items?.length || 0})</span></p>
      {!items?.length ? <Empty /> : (
        <ul className="space-y-2">
          {items.map((e, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium text-slate-900">{e.item}</p>
              <p className="text-slate-600">{e.reason}</p>
              {e.source && <p className="text-xs text-slate-400">Source: {e.source}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bullets({ items }) {
  if (!items?.length) return <Empty />;
  return <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function AgentCard({ name, icon, agent }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="mb-2 font-semibold text-slate-900">{icon} {name}</p>
      <ConfidenceBar value={agent?.confidence} label="Confidence" />
      <p className="mt-3 text-sm text-slate-600">{agent?.summary}</p>
      <div className="mt-3"><Bullets items={agent?.findings} /></div>
    </div>
  );
}

export default function CaseDashboard() {
  const { id } = useParams();
  const [c, setCase] = useState(null);
  const [error, setError] = useState(null);

  const load = () => { setError(null); api.getCase(id).then(setCase).catch(setError); };
  useEffect(load, [id]);

  if (error) return <ErrorAlert error={error} title="Could not load case" onRetry={load} />;
  if (!c) return <p className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</p>;
  if (c.status !== "completed") return <Navigate to={`/cases/${id}/processing`} replace />;

  const { consensus: con = {}, agents = {}, disclaimer } = c.result || {};
  const cs = con.case_summary || {};
  const ev = agents.evidence || {}, ct = agents.contradictions || {}, lg = agents.legal || {};
  const timeline = con.timeline?.length ? con.timeline : ct.timeline || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/reports" className="text-sm text-indigo-700 hover:underline">← Reports</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{c.title}</h1>
          <p className="text-sm text-slate-500">
            {c.documents.length} documents · analysed {new Date(c.updated_at).toLocaleString()} · NLP: {c.entities?.engine}
          </p>
        </div>
        <a href={api.reportUrl(id)} className="btn-primary">⬇ Download PDF Report</a>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{disclaimer}</div>

      {/* 1. Case summary */}
      <Section title="1. Case Summary" right={<div className="w-48"><ConfidenceBar value={con.overall_confidence} label="Overall confidence" /></div>}>
        <p className="mb-4 text-sm leading-relaxed text-slate-700">{cs.overview}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Accused" value={cs.accused} />
          <Field label="Complainant / Victim" value={cs.complainants_victims} />
          <Field label="Witnesses" value={cs.witnesses} />
          <Field label="Incident date" value={cs.incident_date} />
          <Field label="Location" value={cs.location} />
          <Field label="Sections involved" value={cs.sections_involved} />
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Timeline</h3>
        {!timeline.length ? <Empty /> : (
          <ol className="relative ml-2 space-y-3 border-l-2 border-indigo-200 pl-5">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-indigo-500" />
                <p className="text-xs font-semibold text-indigo-700">{t.when}</p>
                <p className="text-sm text-slate-800">{t.event}</p>
                {t.source && <p className="text-xs text-slate-400">{t.source}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* 2. Evidence */}
      <Section title="2. Evidence Analysis" subtitle={ev.summary}>
        <div className="grid gap-4 md:grid-cols-3">
          <EvidenceList title="Strong evidence" items={ev.strong_evidence} tone="good" />
          <EvidenceList title="Weak evidence" items={ev.weak_evidence} tone="weak" />
          <EvidenceList title="Missing evidence" items={ev.missing_evidence} tone="missing" />
        </div>
      </Section>

      {/* 3. Contradictions */}
      <Section title="3. Contradictions Found" subtitle={ct.summary}>
        {!ct.contradictions?.length ? <Empty>No contradictions detected.</Empty> : (
          <div className="space-y-3">
            {ct.contradictions.map((x, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{x.topic}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY[x.severity] || SEVERITY.low}`}>{x.severity}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[x.statement_a, x.statement_b].map((st, j) => (
                    <div key={j} className="rounded-md bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">{st?.source}</p>
                      <p className="text-sm text-slate-800">“{st?.claim}”</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-slate-600">{x.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Legal research */}
      <Section title="Legal Observations" subtitle={lg.summary}>
        <div className="overflow-x-auto">
          {!lg.sections?.length ? <Empty /> : (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr><th className="py-2 pr-3">Code</th><th className="pr-3">Section</th><th className="pr-3">Title</th><th>Applicability</th></tr>
              </thead>
              <tbody>
                {lg.sections.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium">{s.code}</td>
                    <td className="pr-3">{s.section}</td>
                    <td className="pr-3">{s.title}</td>
                    <td className="text-slate-600">{s.applicability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Similar judgments <span className="font-normal text-slate-400">(verify before relying)</span></h3>
        {!lg.similar_judgments?.length ? <Empty /> : (
          <ul className="space-y-2">
            {lg.similar_judgments.map((j, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{j.case_name}</span> <span className="text-slate-500">{j.citation}</span>
                {j.verify && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">verify</span>}
                <p className="text-slate-600">{j.principle}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 4. Agent opinions */}
      <Section title="4. Agent Opinions" subtitle="Each agent analysed the case independently.">
        <div className="grid gap-4 md:grid-cols-3">
          <AgentCard name="Evidence Agent" icon="🧾" agent={ev} />
          <AgentCard name="Contradiction Agent" icon="🔀" agent={ct} />
          <AgentCard name="Legal Research Agent" icon="📚" agent={lg} />
        </div>
      </Section>

      {/* 5. Consensus */}
      <Section title="5. Final Consensus Report"
        subtitle={`Overall confidence ${Math.round((con.overall_confidence || 0) * 100)}% · agent mean ${Math.round((con.agent_mean_confidence || 0) * 100)}%`}>
        <p className="text-sm leading-relaxed text-slate-700">{con.overall_assessment}</p>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div><h3 className="mb-2 text-sm font-semibold">Agreement points</h3><Bullets items={con.agreement_points} /></div>
          <div><h3 className="mb-2 text-sm font-semibold">Disagreements / uncertainty</h3><Bullets items={con.disagreements} /></div>
          <div><h3 className="mb-2 text-sm font-semibold">Key observations</h3><Bullets items={con.key_observations} /></div>
          <div><h3 className="mb-2 text-sm font-semibold">Recommended next steps</h3><Bullets items={con.recommended_next_steps} /></div>
        </div>
      </Section>

      {/* Extracted entities + documents */}
      <Section title="NLP Extracted Entities" subtitle={`Engine: ${c.entities?.engine}`}>
        <div className="grid gap-4 md:grid-cols-3">
          {["people", "places", "dates", "times", "sections", "fir_numbers"].map((k) => (
            <div key={k}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{k.replace("_", " ")}</p>
              <div className="flex flex-wrap gap-1">
                {(c.entities?.[k] || []).slice(0, 15).map((e) => (
                  <span key={e.text} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">{e.text}</span>
                ))}
                {!c.entities?.[k]?.length && <Empty>—</Empty>}
              </div>
            </div>
          ))}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Documents</h3>
        <ul className="text-sm text-slate-600">
          {c.documents.map((d) => (
            <li key={d.id}><span className="font-medium uppercase text-slate-500">{d.category}</span> · {d.filename} · {d.char_count.toLocaleString()} chars
              {d.warning && <span className="text-amber-700"> — {d.warning}</span>}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
