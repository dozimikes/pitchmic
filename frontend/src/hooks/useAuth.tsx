'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import type { User, AuthTokens } from '@/lib/types';
import { UserRole } from '@/lib/types';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  USER_COOKIE,
  setAuthTokens,
  clearAuthCookies,
} from '@/lib/api';

const ACTIVE_ROLE_COOKIE = 'pm_active_role';

interface AuthState {
  user: User | null;
  activeRole: UserRole;
  isLoading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (tokens: AuthTokens, user: User) => void;
  logout: () => void;
  refreshUser: (user: User) => void;
  setActiveRole: (role: UserRole) => void;
  toggleRole: () => void;
  isAuthenticated: boolean;
  isStartup: boolean;
  isInvestor: boolean;
  isAccelerator: boolean;
  isAdmin: boolean;
  isAdminMode: boolean;
  isSuperUser: boolean;
  canSwitchRole: boolean;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/about',
  '/contact',
]);

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/sign-up/')) return true;
  if (pathname.startsWith('/verify/')) return true;
  if (pathname.startsWith('/forgot-password')) return true;
  if (pathname.startsWith('/reset-password')) return true;
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    activeRole: UserRole.STARTUP,
    isLoading: true,
    initialized: false,
  });
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    const hydrate = () => {
      try {
        const access = Cookies.get(ACCESS_TOKEN_COOKIE);
        const rawUser = Cookies.get(USER_COOKIE);
        const savedRole = Cookies.get(ACTIVE_ROLE_COOKIE) as UserRole | undefined;
        const validRoles = new Set([UserRole.STARTUP, UserRole.INVESTOR, UserRole.ACCELERATOR, UserRole.ADMIN]);

        if (access && rawUser) {
          const user: User = JSON.parse(rawUser);
          // Ensure superuser flags are immediate for superuser accounts
          if (user.email === 'dozimikes@gmail.com' || user.role === UserRole.ADMIN) {
            user.is_superuser = true;
            user.is_staff = true;
          }
          const effectiveRole = savedRole && validRoles.has(savedRole)
            ? savedRole
            : (user.role || UserRole.STARTUP);

          setState({
            user,
            activeRole: effectiveRole,
            isLoading: false,
            initialized: true,
          });

          // Silently refresh user profile so is_superuser/is_staff are always current
          // (the cookie may have been set before these fields were added to the serializer)
          if (access) {
            fetch('/api/auth/me', { headers: { Authorization: `Bearer ${access}` }, credentials: 'include' })
              .then((r) => r.ok ? r.json() : null)
              .then((fresh: User | null) => {
                if (fresh && (fresh.is_superuser !== user.is_superuser || fresh.is_staff !== user.is_staff || fresh.avatar_url !== user.avatar_url)) {
                  const updated = { ...user, ...fresh };
                  Cookies.set(USER_COOKIE, JSON.stringify(updated), { expires: 30, path: '/', sameSite: 'lax' });
                  setState((prev) => ({ ...prev, user: updated }));
                }
              })
              .catch(() => { /* non-critical */ });
          }
        } else {
          setState({
            user: null,
            activeRole: UserRole.STARTUP,
            isLoading: false,
            initialized: true,
          });
        }
      } catch {
        setState({
          user: null,
          activeRole: UserRole.STARTUP,
          isLoading: false,
          initialized: true,
        });
      }
    };

    hydrate();
  }, []);

  React.useEffect(() => {
    if (!state.initialized) return;
    const token = Cookies.get(ACCESS_TOKEN_COOKIE);
    const isPublic = isPublicPath(pathname);
    if (!token && !isPublic) {
      const redirect = encodeURIComponent(pathname ?? '/newsfeed');
      router.replace(`/sign-in?next=${redirect}`);
    } else if (token && (pathname === '/sign-in' || pathname?.startsWith('/sign-up'))) {
      router.replace('/newsfeed');
    }
  }, [state.initialized, pathname, router]);

  const login = React.useCallback(
    (tokens: AuthTokens, user: User) => {
      setAuthTokens(tokens.access, tokens.refresh);
      Cookies.set(USER_COOKIE, JSON.stringify(user), {
        expires: 30,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      const initialRole = user.role || UserRole.STARTUP;
      Cookies.set(ACTIVE_ROLE_COOKIE, initialRole, { expires: 30, path: '/' });
      setState({ user, activeRole: initialRole, isLoading: false, initialized: true });
    },
    []
  );

  const logout = React.useCallback(() => {
    clearAuthCookies();
    Cookies.remove(ACTIVE_ROLE_COOKIE);
    setState({ user: null, activeRole: UserRole.STARTUP, isLoading: false, initialized: true });
  }, []);

  const refreshUser = React.useCallback((user: User) => {
    Cookies.set(USER_COOKIE, JSON.stringify(user), {
      expires: 30,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    setState((prev) => ({ ...prev, user }));
  }, []);

  const setActiveRole = React.useCallback((role: UserRole) => {
    Cookies.set(ACTIVE_ROLE_COOKIE, role, { expires: 30, path: '/' });
    setState((prev) => ({ ...prev, activeRole: role }));
  }, []);

  const toggleRole = React.useCallback(() => {
    setState((prev) => {
      let nextRole: UserRole;
      if (prev.activeRole === UserRole.STARTUP) {
        nextRole = UserRole.INVESTOR;
      } else if (prev.activeRole === UserRole.INVESTOR) {
        nextRole = UserRole.ACCELERATOR;
      } else if (prev.activeRole === UserRole.ACCELERATOR) {
        nextRole = UserRole.ADMIN;
      } else {
        nextRole = UserRole.STARTUP;
      }
      Cookies.set(ACTIVE_ROLE_COOKIE, nextRole, { expires: 30, path: '/' });
      return { ...prev, activeRole: nextRole };
    });
  }, []);

  const isAuthenticated = !!state.user && !!Cookies.get(ACCESS_TOKEN_COOKIE);
  const isSuperUser = !!state.user?.is_superuser || state.user?.role === UserRole.ADMIN || !!state.user?.is_staff || state.user?.email === 'dozimikes@gmail.com';
  const isAdmin = state.user?.role === UserRole.ADMIN || isSuperUser;
  // Expose switcher for superusers, staff, admins, or in development mode
  const canSwitchRole = isSuperUser || isAdmin || !!state.user?.is_staff || state.user?.email === 'dozimikes@gmail.com' || process.env.NODE_ENV === 'development';

  // Active role determines the active dashboard mode
  const isStartup = state.activeRole === UserRole.STARTUP;
  const isInvestor = state.activeRole === UserRole.INVESTOR;
  const isAccelerator = state.activeRole === UserRole.ACCELERATOR;
  const isAdminMode = state.activeRole === UserRole.ADMIN;
  const hasRole = (role: UserRole) => state.user?.role === role || (canSwitchRole && state.activeRole === role);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshUser,
    setActiveRole,
    toggleRole,
    isAuthenticated,
    isStartup,
    isInvestor,
    isAccelerator,
    isAdmin,
    isAdminMode,
    isSuperUser,
    canSwitchRole,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);

  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = React.useState<User | null>(null);
  const [activeRole, setActiveRoleState] = React.useState<UserRole>(UserRole.STARTUP);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (ctx) return;
    try {
      const rawUser = Cookies.get(USER_COOKIE);
      const savedRole = Cookies.get(ACTIVE_ROLE_COOKIE) as UserRole | undefined;
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        setUser(parsed);
        setActiveRoleState(savedRole || parsed.role || UserRole.STARTUP);
      }
    } catch {
      /* ignore */
    }
    setInitialized(true);
  }, [ctx]);

  const login = React.useCallback(
    (tokens: AuthTokens, u: User) => {
      setAuthTokens(tokens.access, tokens.refresh);
      Cookies.set(USER_COOKIE, JSON.stringify(u), {
        expires: 30,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      const initialRole = u.role || UserRole.STARTUP;
      Cookies.set(ACTIVE_ROLE_COOKIE, initialRole, { expires: 30, path: '/' });
      setUser(u);
      setActiveRoleState(initialRole);
    },
    []
  );

  const logout = React.useCallback(() => {
    clearAuthCookies();
    Cookies.remove(ACTIVE_ROLE_COOKIE);
    setUser(null);
    if (!isPublicPath(pathname)) {
      router.replace('/sign-in');
    }
  }, [router, pathname]);

  const refreshUser = React.useCallback((u: User) => {
    Cookies.set(USER_COOKIE, JSON.stringify(u), {
      expires: 30,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    setUser(u);
  }, []);

  const setActiveRole = React.useCallback((role: UserRole) => {
    Cookies.set(ACTIVE_ROLE_COOKIE, role, { expires: 30, path: '/' });
    setActiveRoleState(role);
  }, []);

  const toggleRole = React.useCallback(() => {
    setActiveRoleState((prev) => {
      let nextRole: UserRole;
      if (prev === UserRole.STARTUP) {
        nextRole = UserRole.INVESTOR;
      } else if (prev === UserRole.INVESTOR) {
        nextRole = UserRole.ACCELERATOR;
      } else if (prev === UserRole.ACCELERATOR) {
        nextRole = UserRole.ADMIN;
      } else {
        nextRole = UserRole.STARTUP;
      }
      Cookies.set(ACTIVE_ROLE_COOKIE, nextRole, { expires: 30, path: '/' });
      return nextRole;
    });
  }, []);

  if (ctx) return ctx;

  const isSuperUser = !!user?.is_superuser || user?.role === UserRole.ADMIN || !!user?.is_staff || user?.email === 'dozimikes@gmail.com';
  const isAdmin = user?.role === UserRole.ADMIN || isSuperUser;
  const canSwitchRole = isSuperUser || isAdmin || !!user?.is_staff || user?.email === 'dozimikes@gmail.com' || process.env.NODE_ENV === 'development';

  return {
    user,
    activeRole,
    isLoading: false,
    initialized,
    login,
    logout,
    refreshUser,
    setActiveRole,
    toggleRole,
    isAuthenticated: !!user && !!Cookies.get(ACCESS_TOKEN_COOKIE),
    isStartup: activeRole === UserRole.STARTUP,
    isInvestor: activeRole === UserRole.INVESTOR,
    isAccelerator: activeRole === UserRole.ACCELERATOR,
    isAdmin,
    isAdminMode: activeRole === UserRole.ADMIN,
    isSuperUser,
    canSwitchRole,
    hasRole: (role: UserRole) => user?.role === role || (canSwitchRole && activeRole === role),
  };
}

export async function signInWithPassword(params: {
  email: string;
  password: string;
}): Promise<{ tokens: AuthTokens; user: User }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = 'Sign-in failed';
    try {
      const err = await res.json();
      if (err && typeof err === 'object') {
        const first = Object.values(err)[0];
        msg = Array.isArray(first) ? String(first[0]) : String(err?.detail ?? err?.message ?? msg);
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return { tokens: data.tokens, user: data.user };
}

export async function signUpWithPassword(
  params: Record<string, unknown>
): Promise<{ tokens: AuthTokens; user: User }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = 'Registration failed';
    try {
      const err = await res.json();
      if (err && typeof err === 'object') {
        const first = Object.values(err)[0];
        msg = Array.isArray(first) ? String(first[0]) : String(err?.detail ?? err?.message ?? msg);
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return { tokens: data.tokens, user: data.user };
}
