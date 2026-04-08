// In production, set VITE_API_URL to the backend URL (e.g. https://backend.up.railway.app)
// In dev, Vite proxy handles /api and /ws so these stay empty.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const WS_URL = import.meta.env.VITE_WS_URL
  ?? (API_BASE
    ? `${API_BASE.replace(/^http/, 'ws')}/ws`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);
