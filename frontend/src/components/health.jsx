import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api";

const HealthContext = createContext(null);

export function HealthProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setHealth(await api.health());
      setError(null);
    } catch (e) {
      setHealth(null);
      setError(e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const geminiReady = !!health?.gemini?.configured;
  return (
    <HealthContext.Provider value={{ health, error, refresh, geminiReady, loaded: !!(health || error) }}>
      {children}
    </HealthContext.Provider>
  );
}

export const useHealth = () => useContext(HealthContext);

/** Global banner: shows backend-offline and configuration problems on every page. */
export function BackendStatusBanner() {
  const { health, error, refresh } = useHealth();
  const problems = error
    ? [{ detail: error.message, hint: error.hint }]
    : health?.issues || [];
  if (!problems.length) return null;

  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-6 py-3 text-sm text-red-800">
        <span className="mt-0.5 text-lg leading-none">⚠</span>
        <div className="flex-1 space-y-1">
          {problems.map((p, i) => (
            <div key={i}>
              <p className="font-semibold">{p.detail}</p>
              {p.hint && <p className="text-red-700">{p.hint}</p>}
            </div>
          ))}
        </div>
        <button onClick={refresh} className="rounded-md border border-red-300 px-2 py-1 text-xs hover:bg-red-100">
          Re-check
        </button>
      </div>
    </div>
  );
}
