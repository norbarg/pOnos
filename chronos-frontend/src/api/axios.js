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
