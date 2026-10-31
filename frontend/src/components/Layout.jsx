import { NavLink, Outlet } from "react-router-dom";
import { BackendStatusBanner } from "./health";

const link = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-indigo-800 text-white" : "text-indigo-100 hover:bg-indigo-800/60"}`;

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-indigo-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-white">
            <span className="text-2xl">⚖️</span>
            <span className="text-lg font-bold tracking-tight">NyayaAI</span>
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/upload" className={link}>Upload Case</NavLink>
            <NavLink to="/reports" className={link}>Reports</NavLink>
            <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
          </nav>
        </div>
      </header>
      <BackendStatusBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        NyayaAI is an assistive analysis tool. It does not replace judicial decision-making; all output must be verified by a qualified professional.
      </footer>
    </div>
  );
}
