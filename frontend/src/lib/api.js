import axios from 'axios';

/**
 * Axios instance for the CPH Leads CRM API.
 * - baseURL from VITE_API_BASE_URL, defaulting to '/api' (Vite proxies to the backend in dev).
 * - withCredentials true so the httpOnly refresh cookie (cph_rt) is sent.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

// In-memory access token (never persisted to storage).
let accessToken = null;

/**
 * Store the current access token (or null to clear it).
 * @param {string|null} token
 */
export function setAccessToken(token) {
  accessToken = token || null;
}

/** @returns {string|null} the current in-memory access token */
export function getAccessToken() {
  return accessToken;
}

// Handler invoked when authentication ultimately fails (refresh exhausted).
let onAuthFailure = null;

/**
 * Register a callback to run when auth fails irrecoverably.
 * @param {() => void} handler
 */
export function registerAuthFailureHandler(handler) {
  onAuthFailure = handler;
}

// Request interceptor: attach Bearer token when present.
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

function isAuthEndpoint(url = '') {
  return url.includes('/auth/login') || url.includes('/auth/refresh');
}

// A single in-flight refresh promise so concurrent 401s share one refresh call.
let refreshPromise = null;

function performRefresh() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((res) => {
        const newToken = res?.data?.data?.accessToken;
        if (!newToken) throw new Error('No access token in refresh response');
        setAccessToken(newToken);
        return newToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor: on 401 try a single refresh, then retry once.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const originalRequest = config || {};

    if (
      response &&
      response.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;
      try {
        const newToken = await performRefresh();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        if (typeof onAuthFailure === 'function') onAuthFailure();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extract a human-readable message from an axios error.
 * @param {unknown} error
 * @param {string} [fallback='Something went wrong']
 * @returns {string}
 */
export function getErrorMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default api;
