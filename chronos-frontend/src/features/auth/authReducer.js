// chronos-frontend/src/features/auth/authReducer.js
import {
  AUTH_LOGIN_REQUEST, AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILURE,
  AUTH_REGISTER_REQUEST, AUTH_REGISTER_SUCCESS, AUTH_REGISTER_FAILURE,
  AUTH_ME_REQUEST, AUTH_ME_SUCCESS, AUTH_ME_FAILURE,
  AUTH_LOGOUT, AUTH_CLEAR_ERROR
} from './authTypes';

const initialState = { user: null, status: 'idle', error: null };

export function authReducer(state = initialState, action) {
  switch (action.type) {
    case AUTH_LOGIN_REQUEST:
    case AUTH_REGISTER_REQUEST:
    case AUTH_ME_REQUEST:
      return { ...state, status: 'loading', error: null };

    case AUTH_LOGIN_SUCCESS:
    case AUTH_REGISTER_SUCCESS:
    case AUTH_ME_SUCCESS:
      return { ...state, status: 'succeeded', user: action.payload?.user || null, error: null };

    case AUTH_LOGIN_FAILURE:
    case AUTH_REGISTER_FAILURE:
    case AUTH_ME_FAILURE:
      if (action.silent) {
        return { ...state, status: 'idle', error: null };
      }
      return { ...state, status: 'failed', error: action.error || null };

    case AUTH_CLEAR_ERROR:
      return { ...state, error: null, status: state.status === 'failed' ? 'idle' : state.status };

    case AUTH_LOGOUT:
      return { ...state, user: null, status: 'idle', error: null };

    default:
      return state;
  }
}
