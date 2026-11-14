import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { Role, User } from '../domain/types';

export const roleHome: Record<Role, string> = {
  MAIN_ADMIN: '/admin',
  SUB_ADMIN: '/sub-admin',
  EMPLOYEE: '/app',
};

export const roleLabel: Record<Role, string> = {
  MAIN_ADMIN: 'Super Admin',
  SUB_ADMIN: 'Sub-Admin',
  EMPLOYEE: 'Employee',
};

interface SessionValue {
  user: User | null;
  signIn: (identifier: string, password: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User }>('/auth/me').then(({ user }) => setUser(user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const { user } = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
    setUser(user);
    return user;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const { user } = await api<{ user: User }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    setUser(user);
    return user;
  }, []);

  const signOut = useCallback(() => {
    void api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, changePassword, signOut }), [user, signIn, changePassword, signOut]);
  return <SessionContext.Provider value={value}>{ready ? children : <div className="loading-screen">Loading portal…</div>}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** For pages rendered inside a role layout, where a user is guaranteed. */
export function useCurrentUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('No signed-in user');
  return user;
}
