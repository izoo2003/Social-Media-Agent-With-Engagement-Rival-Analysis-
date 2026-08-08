'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ExternalLink, Lock, Unlock } from 'lucide-react';
import SocialPlatformIcon from '@/components/icons/SocialPlatformIcon';

const VISIT_PIN = '1562';
const MAX_UNLOCKS = 2;
const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const STORAGE_KEY = 'kafi-visit-accounts-unlocks';

/** Generic logged-in home/feed URLs — not tied to any brand account. */
const VISIT_LINKS = [
  {
    id: 'linkedin' as const,
    name: 'LinkedIn',
    description: 'Opens your LinkedIn home feed (whichever account is logged in).',
    href: 'https://www.linkedin.com/feed/',
  },
  {
    id: 'facebook' as const,
    name: 'Facebook',
    description: 'Opens your Facebook home feed (whichever account is logged in).',
    href: 'https://www.facebook.com/',
  },
  {
    id: 'instagram' as const,
    name: 'Instagram',
    description: 'Opens your Instagram home feed (whichever account is logged in).',
    href: 'https://www.instagram.com/',
  },
  {
    id: 'youtube' as const,
    name: 'YouTube',
    description: 'Opens your YouTube home feed (whichever account is logged in).',
    href: 'https://www.youtube.com/',
  },
];

function readUnlockTimestamps(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .map((value) => Number(value))
      .filter((ts) => Number.isFinite(ts) && now - ts < WINDOW_MS)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function writeUnlockTimestamps(timestamps: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timestamps));
}

function formatWaitMessage(oldestInWindow: number | undefined): string {
  if (!oldestInWindow) {
    return 'Come back after 12 hours.';
  }
  const unlockAt = oldestInWindow + WINDOW_MS;
  const msLeft = Math.max(0, unlockAt - Date.now());
  const hours = Math.floor(msLeft / (60 * 60 * 1000));
  const minutes = Math.ceil((msLeft % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) {
    return `Come back after 12 hours. Try again in about ${Math.max(1, minutes)} minute(s).`;
  }
  return `Come back after 12 hours. Try again in about ${hours}h ${minutes}m.`;
}

export default function VisitAccountsSection() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [unlockCount, setUnlockCount] = useState(() => readUnlockTimestamps().length);

  const remaining = useMemo(
    () => Math.max(0, MAX_UNLOCKS - unlockCount),
    [unlockCount],
  );

  const handleUnlock = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLimitMessage(null);

    const recent = readUnlockTimestamps();
    if (recent.length >= MAX_UNLOCKS) {
      setUnlocked(false);
      setUnlockCount(recent.length);
      setLimitMessage(formatWaitMessage(recent[0]));
      setPin('');
      return;
    }

    if (pin.trim() !== VISIT_PIN) {
      setError('Incorrect PIN. Try again.');
      return;
    }

    const next = [...recent, Date.now()];
    writeUnlockTimestamps(next);
    setUnlockCount(next.length);
    setUnlocked(true);
    setPin('');
  };

  const handleLock = () => {
    setUnlocked(false);
    setPin('');
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-slate-800 dark:border dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Visit Accounts
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            PIN-protected shortcuts to your logged-in social feeds. Generic links only — opens
            whichever account is signed in on that browser.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 rounded-full border border-slate-200 px-2.5 py-1 dark:border-slate-600">
          {remaining}/{MAX_UNLOCKS} unlocks left (12h)
        </span>
      </div>

      {!unlocked ? (
        <form onSubmit={handleUnlock} className="mt-4 space-y-3 max-w-sm">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Enter PIN to unlock
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Unlock className="h-4 w-4" />
              Unlock
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {limitMessage && (
            <p className="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
              {limitMessage}
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leaving Settings or refreshing locks this section again. Each successful unlock counts
            toward the 12-hour limit.
          </p>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5">
              <Unlock className="h-4 w-4" />
              Unlocked for this visit
            </p>
            <button
              type="button"
              onClick={handleLock}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <Lock className="h-3.5 w-3.5" />
              Lock now
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {VISIT_LINKS.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-slate-400"
              >
                <SocialPlatformIcon platform={link.id} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {link.name}
                    </p>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {link.description}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{link.href}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
