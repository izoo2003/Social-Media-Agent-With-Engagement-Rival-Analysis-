'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'button' | 'segmented';
  className?: string;
}

export function ThemeToggle({ variant = 'button', className = '' }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-600 dark:bg-slate-800 ${className}`}
        role="group"
        aria-label="Theme selection"
      >
        {(['light', 'dark'] as Theme[]).map((option) => {
          const active = theme === option;
          const Icon = option === 'light' ? Sun : Moon;
          const label = option === 'light' ? 'Light' : 'Night';

          return (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${className}`}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to night theme'}
      title={theme === 'dark' ? 'Light mode' : 'Night mode'}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-4 w-4 text-gold-400" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-brand-700" />
          <span>Night</span>
        </>
      )}
    </button>
  );
}
