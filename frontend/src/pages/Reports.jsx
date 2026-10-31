import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ErrorAlert, Spinner, StatusBadge } from "../components/ui";

export default function Reports() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);

  const load = () => { setError(null); api.listCases().then(setCases).catch(setError); };
  useEffect(load, []);

  async function remove(id) {
    try {
      await api.deleteCase(id);
      setCases((l) => l.filter((c) => c.id !== id));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <Link to="/upload" className="btn-primary">+ New Case</Link>
      </div>
      <ErrorAlert error={error} title="Could not load reports" onRetry={load} />
      {!cases && !error && <p className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</p>}
      {cases?.length === 0 && (
        <div className="card text-center text-slate-500">No cases yet. <Link to="/upload" className="text-indigo-700 underline">Upload one</Link>.</div>
      )}
      {cases?.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Case</th><th>Status</th><th>Docs</th><th>Contradictions</th><th>Confidence</th><th>Created</th><th /></tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={c.status === "completed" ? `/cases/${c.id}` : `/cases/${c.id}/processing`} className="font-medium text-indigo-700 hover:underline">{c.title}</Link>
                    {c.status === "failed" && c.error && <p className="max-w-md truncate text-xs text-red-600">{c.error.detail}</p>}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.document_count}</td>
                  <td>{c.status === "completed" ? c.contradiction_count : "—"}</td>
                  <td>{c.overall_confidence != null ? `${Math.round(c.overall_confidence * 100)}%` : "—"}</td>
                  <td className="text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="space-x-3 pr-5 text-right">
                    {c.status === "completed" && <a href={api.reportUrl(c.id)} className="text-indigo-700 hover:underline">PDF</a>}
                    <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
