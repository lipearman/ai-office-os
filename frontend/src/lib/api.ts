import axios from "axios";

// "" = same-origin (relative) → goes through the Next /api rewrite to the backend.
// Works on localhost and behind a single public tunnel without CORS/mixed-content.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refresh,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          // also sync the auth store so subscribers (e.g. the WebSocket manager,
          // which connects with the store's token) reconnect with the fresh token.
          // dynamic import avoids a circular dependency (auth store imports api).
          try {
            const { useAuthStore } = await import("@/store/auth");
            useAuthStore.setState({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            });
          } catch { /* noop */ }
          err.config.headers.Authorization = `Bearer ${data.access_token}`;
          return api.request(err.config);
        } catch {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
