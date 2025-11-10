/// chronos-frontend/src/config/apiOrigin.js
// Единый источник правды для origin бэка
const RAW =
    import.meta.env.VITE_API_ORIGIN ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000';

export const API_ORIGIN = String(RAW).replace(/\/+$/, '');

export function absUrl(u) {
    if (!u) return null;
    const s = String(u).replace(/\\/g, '/'); // <- нормализуем обратные слэши
    if (/^https?:\/\//i.test(s)) return s;
    const path = s.startsWith('/') ? s : `/${s}`;
    return `${API_ORIGIN}${path}`;
}
