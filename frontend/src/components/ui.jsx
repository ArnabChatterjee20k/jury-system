export function ErrorAlert({ error, title, onRetry, retryLabel = "Retry" }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message || error.detail;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <p className={title ? "" : "font-semibold"}>{message}</p>
      {error.hint && <p className="mt-1 text-red-700">{error.hint}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  completed: "bg-emerald-100 text-emerald-800",
  processing: "bg-amber-100 text-amber-800",
  queued: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] || STATUS_STYLE.queued}`}>
      {status}
    </span>
  );
}

export function ConfidenceBar({ value, label }) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>{label}</span>
          <span className="font-semibold">{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Section({ title, subtitle, children, right }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children = "None reported." }) {
  return <p className="text-sm italic text-slate-400">{children}</p>;
}
