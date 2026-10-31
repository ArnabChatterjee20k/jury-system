import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ErrorAlert, Spinner } from "../components/ui";

function StepIcon({ status }) {
  if (status === "done") return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">✓</span>;
  if (status === "failed") return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white">✕</span>;
  if (status === "running") return <span className="flex h-7 w-7 items-center justify-center text-indigo-600"><Spinner className="h-6 w-6" /></span>;
  return <span className="h-7 w-7 rounded-full border-2 border-slate-300" />;
}

export default function Processing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setCase] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [retryError, setRetryError] = useState(null);
  const [run, setRun] = useState(0); // bumped on retry to restart polling

  useEffect(() => {
    let stop = false;
    let timer;
    async function poll() {
      try {
        const data = await api.getCase(id);
        if (stop) return;
        setCase(data);
        setFetchError(null);
        if (data.status === "completed") return navigate(`/cases/${id}`, { replace: true });
        if (data.status === "failed") return;
      } catch (e) {
        if (stop) return;
        setFetchError(e);
        if (e.status === 404) return;
      }
      timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, navigate, run]);

  async function retry() {
    setRetryError(null);
    try {
      await api.retryCase(id);
      setRun((n) => n + 1);
      setCase((s) => ({ ...s, status: "queued", error: null, steps: s.steps.map((x) => ({ ...x, status: "pending", detail: undefined })) }));
    } catch (e) {
      setRetryError(e);
    }
  }

  const done = c?.steps?.filter((s) => s.status === "done").length || 0;
  const pct = c?.steps ? Math.round((done / c.steps.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{c?.title || "Analysing case…"}</h1>
        <p className="text-sm text-slate-500">
          {c?.status === "failed" ? "The analysis stopped because of an error." : "Multiple AI agents are analysing your documents independently."}
        </p>
      </div>

      <ErrorAlert error={fetchError} title="Could not load case status" />

      {c && (
        <div className="card space-y-5">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full transition-all duration-500 ${c.status === "failed" ? "bg-red-500" : "bg-indigo-600"}`} style={{ width: `${pct}%` }} />
          </div>
          <ol className="space-y-3">
            {c.steps.map((s) => (
              <li key={s.key} className="flex items-start gap-3">
                <StepIcon status={s.status} />
                <div className="pt-0.5">
                  <p className={`text-sm font-medium ${s.status === "pending" ? "text-slate-400" : "text-slate-800"}`}>
                    {s.label}{s.status === "running" && "…"}
                  </p>
                  {s.status === "failed" && s.detail && <p className="text-xs text-red-600">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
          {c.documents?.some((d) => d.warning) && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {c.documents.filter((d) => d.warning).map((d) => <p key={d.id}><b>{d.filename}:</b> {d.warning}</p>)}
            </div>
          )}
        </div>
      )}

      {c?.status === "failed" && (
        <ErrorAlert error={c.error || { message: "Analysis failed." }} title="Analysis failed" onRetry={retry} retryLabel="Retry analysis" />
      )}
      <ErrorAlert error={retryError} title="Retry failed" />
      <Link to="/reports" className="text-sm text-indigo-700 hover:underline">← All reports</Link>
    </div>
  );
}
