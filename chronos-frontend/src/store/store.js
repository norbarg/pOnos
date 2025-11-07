// chronos-frontend/src/store/store.js
import { createStore, combineReducers, applyMiddleware, compose } from 'redux';
import { thunk as thunkMiddleware } from 'redux-thunk';
import { authReducer } from '../features/auth/authReducer';

const rootReducer = combineReducers({
  auth: authReducer,
});

// DevTools, если доступны
const composeEnhancers =
  (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) || compose;

export const store = createStore(rootReducer, composeEnhancers(applyMiddleware(thunkMiddleware)));