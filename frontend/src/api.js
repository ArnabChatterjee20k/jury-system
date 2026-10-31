// All backend calls go through here so every failure becomes a readable ApiError.

export class ApiError extends Error {
  constructor(message, { hint, code, status } = {}) {
    super(message);
    this.hint = hint;
    this.code = code;
    this.status = status;
  }
}

const OFFLINE = new ApiError("Cannot reach the NyayaAI backend.", {
  code: "backend_offline",
  hint: "Start it with: cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000",
});

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw OFFLINE;
  }
  if (res.status === 204) return null;
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    // The Vite proxy answers with a non-JSON 5xx when the backend is down.
    if (res.status >= 500) throw OFFLINE;
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, { status: res.status });
    return res;
  }
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.detail || `Request failed (${res.status})`, {
      hint: data.hint,
      code: data.code,
      status: res.status,
    });
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  listCases: () => request("/cases"),
  getCase: (id) => request(`/cases/${id}`),
  createCase: (formData) => request("/cases", { method: "POST", body: formData }),
  retryCase: (id) => request(`/cases/${id}/retry`, { method: "POST" }),
  deleteCase: (id) => request(`/cases/${id}`, { method: "DELETE" }),
  reportUrl: (id) => `/api/cases/${id}/report.pdf`,
};
