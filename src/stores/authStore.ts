import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { saveLaLigaSession, loadLaLigaSession, deleteLaLigaSession } from '../services/laligaSession';

interface LaLigaUser {
  userId: string;
  username: string;
  name: string;
}

interface LaLigaTokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_on?: number;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  laligaTokens: LaLigaTokens | null;
  laligaAuthenticated: boolean;
  laligaUser: LaLigaUser | null;
  leagueId: string | null;
  leagueName: string | null;
  inflightRefresh: Promise<string | null> | null;

  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  initFromStorage: () => Promise<void>;
  loginLaLiga: (tokens: LaLigaTokens) => Promise<void>;
  logoutLaLiga: () => Promise<void>;
  setLeague: (id: string, name: string) => void;
  getBearerToken: () => string | null;
  refreshToken: () => Promise<string | null>;
}

async function fetchLaligaProfile(token: string): Promise<LaLigaUser | null> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  try {
    const res = await fetch(
      `${baseUrl}/api/v4/user/me?x-lang=es`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-lang': 'es',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const apiUser = data?.data || data;
    if (!apiUser) return null;
    return {
      userId: String(apiUser.id || apiUser.userId || apiUser.managerId || ''),
      username: apiUser.username || apiUser.managerName || apiUser.name || '',
      name: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name || '',
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      laligaTokens: null,
      laligaAuthenticated: false,
      laligaUser: null,
      leagueId: null,
      leagueName: null,

      login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return { error: error.message };
        set({
          user: data.user,
          session: data.session,
          isAuthenticated: true,
        });
        return {};
      },

      logout: async () => {
        await supabase.auth.signOut();
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          laligaTokens: null,
          laligaAuthenticated: false,
          laligaUser: null,
          leagueId: null,
          leagueName: null,
        });
      },

      initFromStorage: async () => {
        console.log('[Auth] initFromStorage started');
        // Restore Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth] Supabase session:', session ? 'found' : 'none');
        if (session) {
          set({
            user: session.user,
            session,
            isAuthenticated: true,
          });
        }

        // Restore LaLiga session from Supabase
        try {
          const laligaSession = await loadLaLigaSession();
          console.log('[Auth] loadLaLigaSession result:', laligaSession);
          if (laligaSession) {
            const expiresOn = laligaSession.expires_on || Math.floor(Date.now() / 1000) + 3600;
            if (expiresOn > Date.now() / 1000) {
              const laligaUser = laligaSession.laliga_user_id
                ? { userId: laligaSession.laliga_user_id, username: laligaSession.laliga_username || '', name: laligaSession.laliga_username || '' }
                : await fetchLaligaProfile(laligaSession.access_token);
              set({
                laligaTokens: { ...laligaSession, expires_on: expiresOn },
                laligaAuthenticated: true,
                laligaUser,
              });
            } else {
              console.log('[Auth] LaLiga session expired');
            }
          } else {
            console.log('[Auth] No LaLiga session found in Supabase');
          }
        } catch (e) {
          console.error('[Auth] Error loading LaLiga session:', e);
        }
      },

      loginLaLiga: async (tokens) => {
        const expiresOn = tokens.expires_on || Math.floor(Date.now() / 1000) + 3600;
        const token = tokens.access_token || tokens.id_token;

        // Try to fetch profile, but don't fail if proxy is down
        let laligaUser: LaLigaUser | null = null;
        try {
          laligaUser = token ? await fetchLaligaProfile(token) : null;
        } catch {
          // Proxy might be sleeping, save session anyway
        }

        // Save to Supabase (even without profile data)
        try {
          await saveLaLigaSession({
            access_token: tokens.access_token,
            id_token: tokens.id_token,
            refresh_token: tokens.refresh_token,
            expires_on: expiresOn,
            laliga_user_id: laligaUser?.userId,
            laliga_username: laligaUser?.username,
          });
        } catch (e) {
          console.error('Failed to save LaLiga session to Supabase:', e);
        }

        set({
          laligaTokens: { ...tokens, expires_on: expiresOn },
          laligaAuthenticated: true,
          laligaUser,
        });
      },

      logoutLaLiga: async () => {
        await deleteLaLigaSession();
        set({
          laligaTokens: null,
          laligaAuthenticated: false,
          laligaUser: null,
          leagueId: null,
          leagueName: null,
        });
      },

      setLeague: (id, name) => {
        set({ leagueId: id, leagueName: name });
      },

      getBearerToken: () => {
        const { laligaTokens } = get();
        if (!laligaTokens) return null;
        if (laligaTokens.expires_on && laligaTokens.expires_on < Date.now() / 1000) {
          return null;
        }
        return laligaTokens.access_token;
      },

      refreshToken: async () => {
        const existing = get().inflightRefresh;
        if (existing) return existing;

        const promise = (async () => {
          try {
            const state = get();
            const refreshTokenValue = state.laligaTokens?.refresh_token;
            if (!refreshTokenValue) throw new Error('No refresh token');

            const CLIENT_ID = import.meta.env.VITE_LALIGA_CLIENT_ID || '6457fa17-1224-416a-b21a-ee6ce76e9bc0';
            const TOKEN_ENDPOINT = import.meta.env.VITE_LALIGA_TOKEN_ENDPOINT || 'https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN';

            const params = new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshTokenValue,
              client_id: CLIENT_ID,
              scope: 'openid offline_access',
            });

            const response = await fetch(TOKEN_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              body: params.toString(),
            });

            if (!response.ok) {
              if (response.status === 400 || response.status === 401) {
                throw new Error('invalid_grant');
              }
              throw new Error(`Token refresh failed: ${response.status}`);
            }

            const result = await response.json();
            if (!result.id_token) throw new Error('No id_token received');

            const newTokens: LaLigaTokens = {
              access_token: result.id_token || result.access_token,
              id_token: result.id_token,
              refresh_token: result.refresh_token || refreshTokenValue,
              expires_on: Math.floor(Date.now() / 1000) + (result.id_token_expires_in || result.expires_in || 86400),
            };

            // Save to Supabase
            try {
              await saveLaLigaSession({
                access_token: newTokens.access_token,
                id_token: newTokens.id_token,
                refresh_token: newTokens.refresh_token,
                expires_on: newTokens.expires_on,
                laliga_user_id: state.laligaUser?.userId,
                laliga_username: state.laligaUser?.username,
              });
            } catch {}

            set({ laligaTokens: newTokens });
            return newTokens.access_token;
          } catch (error: any) {
            if (error.message?.includes('invalid_grant')) {
              // Refresh token expired - clear it but don't logout yet
              const state = get();
              if (state.laligaTokens) {
                set({ laligaTokens: { ...state.laligaTokens, refresh_token: undefined } });
              }
            }
            throw error;
          }
        })();

        set({ inflightRefresh: promise });
        try {
          const result = await promise;
          return result;
        } finally {
          set({ inflightRefresh: null });
        }
      },
    }),
    {
      name: 'fantasy-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        leagueId: state.leagueId,
        leagueName: state.leagueName,
      }),
    }
  )
);
