'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { API_ENDPOINTS, apiFetch } from '@/lib/api-client';
import type { SuggestContext, SuggestMode, SuggestResponse } from '@/lib/types';

interface TextSuggestionBarProps {
  value: string;
  onApply: (suggestion: string) => void;
  context: SuggestContext;
  language?: string;
  disabled?: boolean;
  className?: string;
}

export default function TextSuggestionBar({
  value,
  onApply,
  context,
  language = 'en',
  disabled = false,
  className = '',
}: TextSuggestionBarProps) {
  const [loadingMode, setLoadingMode] = useState<SuggestMode | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<SuggestMode | null>(null);

  const empty = !value.trim();
  const busy = loadingMode !== null;

  const requestSuggestion = async (mode: SuggestMode) => {
    if (empty || disabled || busy) return;

    setLoadingMode(mode);
    setSuggestion(null);
    setActiveMode(null);

    try {
      const res = await apiFetch(API_ENDPOINTS.CREATION_SUGGEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          mode,
          context,
          language,
        }),
      });

      if (!res.ok) {
        let detail = `Suggestion failed (${res.status})`;
        try {
          const err = await res.json();
          if (typeof err?.detail === 'string') detail = err.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const data = (await res.json()) as SuggestResponse;
      const next = (data.suggestion || '').trim();
      if (!next) {
        throw new Error('No suggestion returned. Try again.');
      }
      if (next === value.trim()) {
        toast.success(mode === 'fix' ? 'Looks good — no changes needed' : 'Already clear — no changes needed');
        return;
      }
      setSuggestion(next);
      setActiveMode(mode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get suggestion');
    } finally {
      setLoadingMode(null);
    }
  };

  const handleApply = () => {
    if (!suggestion) return;
    onApply(suggestion);
    setSuggestion(null);
    setActiveMode(null);
    toast.success('Suggestion applied');
  };

  const handleDismiss = () => {
    setSuggestion(null);
    setActiveMode(null);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => requestSuggestion('fix')}
          disabled={empty || disabled || busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {loadingMode === 'fix' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Fix spelling
        </button>
        <button
          type="button"
          onClick={() => requestSuggestion('improve')}
          disabled={empty || disabled || busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {loadingMode === 'improve' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Improve wording
        </button>
      </div>

      {suggestion && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-2 dark:border-slate-500 dark:bg-slate-700/50">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {activeMode === 'improve' ? 'Improved suggestion' : 'Spelling fix'}
          </p>
          <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{suggestion}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              <Check className="h-3.5 w-3.5" />
              Apply
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
