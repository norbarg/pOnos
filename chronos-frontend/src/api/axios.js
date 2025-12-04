import axios from 'axios';
import { API_ORIGIN } from '../config/apiOrigin';

export const api = axios.create({
    baseURL: API_ORIGIN,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('chronos_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const cfg = error?.config || {};

        const url = cfg.url || '';

        const isAuthEndpoint =
            url.includes('/auth/login') || url.includes('/auth/register');

        if (status === 401 && !isAuthEndpoint) {
            try {
                localStorage.removeItem('chronos_token');
            } catch {}

            window.location.href = '/login';
        }

        return Promise.reject(error);
    }
);
