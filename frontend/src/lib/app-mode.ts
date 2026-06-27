/**
 * Access control for the dashboard.
 *
 * Two layers (most restrictive wins):
 * 1. Deployment — NEXT_PUBLIC_APP_MODE=creation-only (optional env override)
 * 2. User tier — chosen at login: senior (full) | junior (Prompt Studio only)
 */

export type AccessTier = 'senior' | 'junior';
export type EffectiveMode = 'full' | 'creation-only';

export const TIER_COOKIE = 'dashboard_tier';
export const TIER_PREF_KEY = 'dashboard_tier_preference';

const CREATION_HOME = '/dashboard/creation';

export function isDeploymentCreationOnly(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === 'creation-only';
}

export function parseAccessTier(value: string | null | undefined): AccessTier | null {
  if (value === 'junior' || value === 'senior') {
    return value;
  }
  return null;
}

/** Read tier from document.cookie (client only). */
export function getAccessTierFromCookie(): AccessTier | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TIER_COOKIE}=(junior|senior)(?:;|$)`),
  );
  return parseAccessTier(match?.[1]);
}

export function getEffectiveMode(tier?: AccessTier | null): EffectiveMode {
  if (isDeploymentCreationOnly()) {
    return 'creation-only';
  }
  const resolved = tier ?? getAccessTierFromCookie() ?? 'senior';
  return resolved === 'junior' ? 'creation-only' : 'full';
}

export function isCreationOnlyMode(tier?: AccessTier | null): boolean {
  return getEffectiveMode(tier) === 'creation-only';
}

export function isJuniorTier(tier?: AccessTier | null): boolean {
  return getEffectiveMode(tier) === 'creation-only';
}

export function getDefaultDashboardPath(tier?: AccessTier | null): string {
  return isCreationOnlyMode(tier) ? CREATION_HOME : '/dashboard';
}

/** @deprecated use getDefaultDashboardPath */
export const DEFAULT_DASHBOARD_PATH = getDefaultDashboardPath();

export interface NavItem {
  href: string;
  label: string;
  locked: boolean;
}

const FULL_NAV_ITEMS: Omit<NavItem, 'locked'>[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/creation', label: 'Content Creation' },
  { href: '/dashboard/generator', label: 'Content Posting' },
  { href: '/dashboard/calendar', label: 'Calendar' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/qa', label: 'QA Checker' },
  { href: '/dashboard/rivals', label: 'Rival Review' },
];

export function getNavItems(tier?: AccessTier | null): NavItem[] {
  const creationOnly = isCreationOnlyMode(tier);

  return FULL_NAV_ITEMS.map((item) => ({
    ...item,
    locked: creationOnly && item.href !== CREATION_HOME,
  }));
}

export function isDashboardPathAllowed(
  pathname: string,
  tier?: AccessTier | null,
): boolean {
  if (!isCreationOnlyMode(tier)) {
    return true;
  }

  if (pathname === '/dashboard') {
    return false;
  }

  return pathname === CREATION_HOME || pathname.startsWith(`${CREATION_HOME}/`);
}

export function getAppDisplayName(tier?: AccessTier | null): string {
  return isCreationOnlyMode(tier)
    ? 'Kafi Prompt Studio'
    : process.env.NEXT_PUBLIC_APP_NAME || 'Kafi Social Agent';
}

export function getAppSubtitle(tier?: AccessTier | null): string {
  return isCreationOnlyMode(tier)
    ? 'Essence product prompt studio for Meta AI visuals'
    : 'Social Media Agent';
}

export function getTierLabel(tier: AccessTier): string {
  return tier === 'junior' ? 'Junior Developer' : 'Senior Developer';
}
