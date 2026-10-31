import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useHealth } from "../components/health";
import { ConfidenceBar, ErrorAlert, StatusBadge } from "../components/ui";

function Stat({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Check({ ok, label, detail }) {
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span>{label}</span>
      <span className={ok ? "text-emerald-700" : "text-red-700"}>{ok ? "✓ " : "✕ "}{detail}</span>
    </li>
  );
}

export default function Dashboard() {
  const { health, error: healthError } = useHealth();
  const [cases, setCases] = useState([]);
  const [error, setError] = useState(null);

  const load = () => { setError(null); api.listCases().then(setCases).catch(setError); };
  useEffect(load, []);

  const completed = cases.filter((c) => c.status === "completed");
  const avg = completed.length ? completed.reduce((s, c) => s + (c.overall_confidence || 0), 0) / completed.length : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <ErrorAlert error={error} title="Could not load cases" onRetry={load} />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Total cases" value={cases.length} />
        <Stat label="Completed" value={completed.length} tone="text-emerald-700" />
        <Stat label="In progress" value={cases.filter((c) => ["queued", "processing"].includes(c.status)).length} tone="text-amber-600" />
        <Stat label="Failed" value={cases.filter((c) => c.status === "failed").length} tone="text-red-600" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="mb-3 font-semibold">Recent cases</h2>
          {!cases.length ? <p className="text-sm text-slate-500">No cases yet. <Link to="/upload" className="text-indigo-700 underline">Upload one</Link>.</p> : (
            <ul className="divide-y divide-slate-100">
              {cases.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <Link to={c.status === "completed" ? `/cases/${c.id}` : `/cases/${c.id}/processing`} className="truncate text-sm font-medium text-indigo-700 hover:underline">{c.title}</Link>
                  <div className="flex items-center gap-3">
                    {c.overall_confidence != null && <span className="text-xs text-slate-500">{Math.round(c.overall_confidence * 100)}%</span>}
                    <StatusBadge status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">Average confidence</h2>
            <ConfidenceBar value={avg} label={`${completed.length} completed case${completed.length === 1 ? "" : "s"}`} />
          </div>
          <div className="card">
            <h2 className="mb-1 font-semibold">System status</h2>
            {healthError ? <p className="text-sm text-red-700">{healthError.message}</p> : (
              <ul className="divide-y divide-slate-100">
                <Check ok={!!health} label="Backend" detail={health ? "online" : "checking…"} />
                <Check ok={health?.gemini?.configured} label="Gemini API key" detail={health?.gemini?.configured ? health.gemini.model : "missing"} />
                <Check ok={health?.database?.ok} label="Database" detail={health?.database?.kind} />
                <Check ok={health?.nlp?.spacy} label="spaCy NLP" detail={health?.nlp?.spacy ? "loaded" : "regex fallback"} />
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
