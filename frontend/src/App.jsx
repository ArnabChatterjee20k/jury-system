import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { HealthProvider } from "./components/health";
import Landing from "./pages/Landing";
import Upload from "./pages/Upload";
import Processing from "./pages/Processing";
import CaseDashboard from "./pages/CaseDashboard";
import Reports from "./pages/Reports";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <HealthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="upload" element={<Upload />} />
          <Route path="cases/:id/processing" element={<Processing />} />
          <Route path="cases/:id" element={<CaseDashboard />} />
          <Route path="reports" element={<Reports />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="*" element={<p className="text-slate-500">Page not found.</p>} />
        </Route>
      </Routes>
    </HealthProvider>
  );
}
