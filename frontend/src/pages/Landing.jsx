import { Link } from "react-router-dom";

const FLOW = [
  ["📄", "Upload", "FIR, witness statements, arguments, evidence"],
  ["🔍", "NLP Extraction", "People, dates, times, IPC/BNS sections"],
  ["🤖", "3 AI Agents", "Evidence · Contradiction · Legal Research"],
  ["🤝", "Consensus", "Confidence-weighted combined findings"],
  ["📊", "Report", "Dashboard + downloadable PDF"],
];

export default function Landing() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-br from-indigo-900 to-indigo-700 px-8 py-14 text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-200">AI-assisted legal analysis</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">NyayaAI</h1>
        <p className="mt-3 max-w-2xl text-lg text-indigo-100">
          A multi-agent system that organises case documents, analyses evidence, detects contradictions and
          surfaces relevant law for Indian courts — to support, never replace, human judgment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/upload" className="btn bg-white text-indigo-900 hover:bg-indigo-50">Upload Case</Link>
          <Link to="/reports" className="btn border border-indigo-300 text-white hover:bg-indigo-800">View Reports</Link>
          <Link to="/dashboard" className="btn border border-indigo-300 text-white hover:bg-indigo-800">Dashboard</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">How it works</h2>
        <div className="grid gap-4 md:grid-cols-5">
          {FLOW.map(([icon, title, text], i) => (
            <div key={title} className="card relative">
              <div className="text-2xl">{icon}</div>
              <p className="mt-2 text-xs font-semibold text-indigo-600">STEP {i + 1}</p>
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
