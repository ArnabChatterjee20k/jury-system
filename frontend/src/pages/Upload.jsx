import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useHealth } from "../components/health";
import { ErrorAlert, Spinner } from "../components/ui";

const CATEGORIES = [
  { key: "fir", label: "FIR", icon: "🚨", help: "First Information Report" },
  { key: "witness", label: "Witness Statements", icon: "🗣️", help: "One file per witness works best" },
  { key: "arguments", label: "Arguments", icon: "⚖️", help: "Prosecution / defence submissions" },
  { key: "evidence", label: "Evidence Files", icon: "🧾", help: "Medical, forensic, seizure memos, exhibits" },
];
const ACCEPT = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.mp4,.mov";

function fmtSize(b) {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

function DropZone({ cat, files, onAdd, onRemove }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onAdd([...e.dataTransfer.files]); }}
      className={`card border-2 border-dashed transition ${over ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-slate-900">{cat.icon} {cat.label}</p>
          <p className="text-xs text-slate-500">{cat.help}</p>
        </div>
        <button type="button" onClick={() => input.current.click()} className="btn-secondary px-3 py-1.5 text-xs">
          Browse
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { onAdd([...e.target.files]); e.target.value = ""; }} />
      </div>
      {files.length === 0 ? (
        <p className="mt-4 text-center text-sm text-slate-400">Drag & drop files here</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
              <span className="truncate">{f.name} <span className="text-xs text-slate-400">({fmtSize(f.size)})</span></span>
              <button type="button" onClick={() => onRemove(i)} className="ml-2 text-slate-400 hover:text-red-600">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const { geminiReady, loaded, error: healthError } = useHealth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState({ fir: [], witness: [], arguments: [], evidence: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const total = Object.values(files).reduce((n, l) => n + l.length, 0);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError({ message: "Please enter a case title." });
    if (!total) return setError({ message: "Add at least one document." });
    const fd = new FormData();
    fd.append("title", title);
    fd.append("description", description);
    for (const [cat, list] of Object.entries(files)) list.forEach((f) => fd.append(cat, f));
    setSubmitting(true);
    try {
      const { id } = await api.createCase(fd);
      navigate(`/cases/${id}/processing`);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upload Case Documents</h1>
        <p className="text-sm text-slate-500">PDF, DOCX and TXT are text-analysed. Images/audio/video are recorded as exhibits.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Case title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="State vs. Ramesh Kumar (FIR 123/2024)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Anything the agents should focus on…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIES.map((cat) => (
          <DropZone key={cat.key} cat={cat} files={files[cat.key]}
            onAdd={(added) => setFiles((s) => ({ ...s, [cat.key]: [...s[cat.key], ...added] }))}
            onRemove={(i) => setFiles((s) => ({ ...s, [cat.key]: s[cat.key].filter((_, j) => j !== i) }))} />
        ))}
      </div>

      <ErrorAlert error={error} title="Could not start the analysis" />
      {loaded && !healthError && !geminiReady && !error && (
        <ErrorAlert error={{ message: "Analysis is disabled until GEMINI_API_KEY is configured on the backend.",
          hint: "See the red banner above for how to fix it." }} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{total} file{total === 1 ? "" : "s"} selected</p>
        <button type="submit" disabled={submitting} className="btn-primary px-6">
          {submitting ? <><Spinner /> Uploading…</> : "Analyse Case →"}
        </button>
      </div>
    </form>
  );
}
