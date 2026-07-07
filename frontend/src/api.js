const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  getCampaigns: () => request("/campaigns"),
  getHistory: (city, limit = 50) =>
    request(`/history?city=${encodeURIComponent(city)}&limit=${limit}`),
  getSystemStatus: () => request("/system-status"),
  triggerSync: () => request("/weather/sync", { method: "POST" }),
  override: (city, creativeId) =>
    request("/override", {
      method: "POST",
      body: JSON.stringify({ city, creativeId }),
    }),
  resumeAutomation: (city) =>
    request("/resume-automation", {
      method: "POST",
      body: JSON.stringify({ city }),
    }),
};

export { API_BASE_URL };
