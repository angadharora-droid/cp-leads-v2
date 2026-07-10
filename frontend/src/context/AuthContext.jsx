import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import api, {
  setAccessToken,
  registerAuthFailureHandler,
} from '@/lib/api';

const AuthContext = createContext(null);

// Non-sensitive marker that a refresh session *might* exist. The refresh token
// itself is an httpOnly cookie JS can't read, so we use this flag to avoid
// firing /auth/refresh (and logging a 401) on a logged-out first visit.
const SESSION_HINT_KEY = 'cph_has_session';
const hasSessionHint = () => {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
};
const setSessionHint = (on) => {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* storage unavailable — refresh-on-load just falls back to a 401 */
  }
};

// One-time silent session restore, deduped at module scope. React 18 StrictMode
// double-mounts effects in dev (and tabs/HMR can remount the provider); sharing
// a SINGLE promise guarantees exactly one /auth/refresh call — which both avoids
// refresh-token rotation tripping reuse-detection and prevents the stuck spinner
// a per-mount cancel flag would otherwise cause. Resolves to the user (or null).
let bootstrapPromise = null;
function bootstrapAuth() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      if (!hasSessionHint()) return null;
      try {
        const refreshRes = await api.post('/auth/refresh');
        const token = refreshRes?.data?.data?.accessToken;
        if (!token) throw new Error('No access token');
        setAccessToken(token);
        const meRes = await api.get('/auth/me');
        return meRes?.data?.data?.user ?? null;
      } catch {
        // No valid session (never logged in, or cookie expired) — stay logged out.
        setAccessToken(null);
        setSessionHint(false);
        return null;
      }
    })();
  }
  return bootstrapPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Clear auth state (used by the global auth-failure handler and logout).
  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setSessionHint(false);
  }, []);

  // Register the handler that api.js calls when a refresh ultimately fails.
  useEffect(() => {
    registerAuthFailureHandler(() => {
      clearAuth();
    });
  }, [clearAuth]);

  // On mount: restore any existing session via the single deduped attempt.
  // StrictMode may mount this twice; both share one /auth/refresh and whichever
  // mount is still alive when it resolves clears the loading state.
  useEffect(() => {
    let cancelled = false;
    bootstrapAuth().then((restoredUser) => {
      if (cancelled) return;
      setUser(restoredUser);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { accessToken, user: loggedInUser } = res?.data?.data ?? {};
    setAccessToken(accessToken ?? null);
    setUser(loggedInUser ?? null);
    setSessionHint(true);
    return loggedInUser ?? null;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore — clear local state regardless */
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  }, []);

  const refreshUser = useCallback(async () => {
    const meRes = await api.get('/auth/me');
    const nextUser = meRes?.data?.data?.user ?? null;
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    changePassword,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
