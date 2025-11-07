// chronos-frontend/src/api/axios.js
import axios from 'axios';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_ORIGIN,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chronos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
