/**
 * Dashboard session — JWT stored in localStorage + cookies for Next.js middleware.
 */

import type { AccessTier } from '@/lib/app-mode';
import { TIER_COOKIE, TIER_PREF_KEY } from '@/lib/app-mode';

const TOKEN_KEY = 'dashboard_token';
const SESSION_COOKIE = 'dashboard_session';

function cookieFlags(maxAgeSeconds: number): string {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? '; Secure'
    : '';
  return `; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function setSession(
  token: string,
  expiresInSeconds: number,
  tier: AccessTier = 'senior',
): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TIER_PREF_KEY, tier);

  const flags = cookieFlags(expiresInSeconds);
  document.cookie = `${SESSION_COOKIE}=1${flags}`;
  document.cookie = `${TIER_COOKIE}=${tier}${flags}`;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${TIER_COOKIE}=; path=/; max-age=0`;
}

export function isLoggedIn(): boolean {
  return Boolean(getAuthToken());
}

export function logout(): void {
  clearSession();
  window.location.href = '/login';
}
