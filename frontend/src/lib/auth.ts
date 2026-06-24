/**
 * Dashboard session — JWT stored in localStorage + session cookie for Next.js middleware.
 */

const TOKEN_KEY = 'dashboard_token';
const SESSION_COOKIE = 'dashboard_session';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function setSession(token: string, expiresInSeconds: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${expiresInSeconds}; SameSite=Lax${secure}`;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export function isLoggedIn(): boolean {
  return Boolean(getAuthToken());
}

export function logout(): void {
  clearSession();
  window.location.href = '/login';
}
