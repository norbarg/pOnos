// chronos-frontend/src/api/axios.js
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
/* 👇 ДОБАВЬ ЭТО */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const cfg = error?.config || {};

        // урл без baseURL (axios для относительных путей сохраняет так)
        const url = cfg.url || '';

        const isAuthEndpoint =
            url.includes('/auth/login') || url.includes('/auth/register');

        if (status === 401 && !isAuthEndpoint) {
            // токен либо отсутствует, либо протух
            try {
                localStorage.removeItem('chronos_token');
            } catch {}

            // Простейший вариант — жёстко уходим на /login
            // (перезагрузит приложение и очистит стейт Redux)
            window.location.href = '/login';
        }

        return Promise.reject(error);
    }
);
