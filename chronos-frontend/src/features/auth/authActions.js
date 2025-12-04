import { api } from '../../api/axios';
import {
    AUTH_LOGIN_REQUEST,
    AUTH_LOGIN_SUCCESS,
    AUTH_LOGIN_FAILURE,
    AUTH_REGISTER_REQUEST,
    AUTH_REGISTER_SUCCESS,
    AUTH_REGISTER_FAILURE,
    AUTH_ME_REQUEST,
    AUTH_ME_SUCCESS,
    AUTH_ME_FAILURE,
    AUTH_LOGOUT,
    AUTH_CLEAR_ERROR,
} from './authTypes';

export const clearAuthError = () => ({ type: AUTH_CLEAR_ERROR });

const FLASH_MS = 4000;

export const fetchMe = () => async (dispatch) => {
    try {
        dispatch({ type: AUTH_ME_REQUEST });
        const { data } = await api.get('/auth/me');
        dispatch({ type: AUTH_ME_SUCCESS, payload: data });
        return { ok: true, data };
    } catch (err) {
        const status = err?.response?.status;

        dispatch({ type: AUTH_ME_FAILURE, error: null, silent: true });
        return { ok: false, status };
    }
};

export const register = (payload) => async (dispatch) => {
    try {
        dispatch({ type: AUTH_REGISTER_REQUEST });
        const { data } = await api.post('/auth/register', payload);
        if (data?.token) localStorage.setItem('chronos_token', data.token);

        if (!data?.user) {
            await dispatch(fetchMe());
        } else {
            dispatch({ type: AUTH_REGISTER_SUCCESS, payload: data });
        }

        return { ok: true, data };
    } catch (err) {
        const error = err.response?.data?.error || 'Registration failed';
        dispatch({ type: AUTH_REGISTER_FAILURE, error });
        setTimeout(() => dispatch(clearAuthError()), FLASH_MS);
        return { ok: false, error };
    }
};

export const login = (payload) => async (dispatch) => {
    try {
        dispatch({ type: AUTH_LOGIN_REQUEST });
        const { data } = await api.post('/auth/login', payload);
        if (data?.token) localStorage.setItem('chronos_token', data.token);

        if (!data?.user) {
            await dispatch(fetchMe());
        } else {
            dispatch({ type: AUTH_LOGIN_SUCCESS, payload: data });
        }

        return { ok: true, data };
    } catch (err) {
        const error = err.response?.data?.error || 'Login failed';
        dispatch({ type: AUTH_LOGIN_FAILURE, error });
        setTimeout(() => dispatch(clearAuthError()), FLASH_MS);
        return { ok: false, error };
    }
};

export const logout = () => {
    localStorage.removeItem('chronos_token');
    return { type: AUTH_LOGOUT };
};
