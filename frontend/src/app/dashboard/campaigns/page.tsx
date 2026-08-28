'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  CalendarPlus,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  Megaphone,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { API_ENDPOINTS, API_CONFIG, fetchWithTimeout } from '@/lib/api-client';
import type {
  Campaign,
  CampaignCommitResponse,
  CampaignListItem,
  CampaignProductInput,
} from '@/lib/types';

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'X / Twitter' },
] as const;

const ASSET_LABELS: Record<string, string> = {
  reel: 'Reel',
  post_image: 'Image post',
  story: 'Story',
  graphic: 'Graphic',
  animation: 'Animation',
  video: 'Video',
};

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatPkt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const dt = parseISO(iso);
    return `Asia/Karachi · ${format(dt, 'EEE MMM d, h:mm a')}`;
  } catch {
    return iso;
  }
}

function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function CampaignsPage() {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISODate);
  const [durationDays, setDurationDays] = useState('14');
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'facebook']);
  const [products, setProducts] = useState<CampaignProductInput[]>([
    { category: '', product: '' },
  ]);

  const [planning, setPlanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [active, setActive] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<CampaignListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CAMPAIGNS);
      if (!res.ok) throw new Error('Failed to load campaigns');
      const data = (await res.json()) as CampaignListItem[];
      setHistory(data);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not load campaigns'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const summaryEntries = useMemo(() => {
    if (!active?.plan_summary) return [];
    return Object.entries(active.plan_summary).sort((a, b) => b[1] - a[1]);
  }, [active]);

  const itemsByDay = useMemo(() => {
    if (!active?.items?.length) return [] as { day: string; items: Campaign['items'] }[];
    const map = new Map<string, Campaign['items']>();
    for (const item of active.items) {
      const key =
        item.scheduled_at_pkt?.slice(0, 10) ||
        item.scheduled_at_utc?.slice(0, 10) ||
        `day-${item.day_index}`;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, items]) => ({ day, items }));
  }, [active]);

  const togglePlatform = (value: string) => {
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  };

  const updateProduct = (index: number, patch: Partial<CampaignProductInput>) => {
    setProducts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addProductRow = () => {
    setProducts((prev) => [...prev, { category: '', product: '' }]);
  };

  const removeProductRow = (index: number) => {
    setProducts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const runCampaign = async () => {
    const cleaned = products
      .map((p) => ({
        category: (p.category || '').trim(),
        product: (p.product || '').trim() || null,
      }))
      .filter((p) => p.category);

    if (!cleaned.length) {
      toast.error('Add at least one category');
      return;
    }
    if (!platforms.length) {
      toast.error('Select at least one platform');
      return;
    }
    const days = Number.parseInt(durationDays, 10);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      toast.error('Duration must be between 1 and 90 days');
      return;
    }

    setPlanning(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CAMPAIGNS_PLAN, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || null,
          start_date: startDate,
          duration_days: days,
          platforms,
          products: cleaned,
        }),
        timeoutMs: API_CONFIG.timeout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to generate campaign',
        );
      }
      const data = (await res.json()) as Campaign;
      setActive(data);
      toast.success(`Plan ready — ${data.items?.length || 0} posts`);
      void loadHistory();
    } catch (e) {
      toast.error(errorDetail(e, 'Campaign planning failed'));
    } finally {
      setPlanning(false);
    }
  };

  const openCampaign = async (id: number) => {
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CAMPAIGN_DETAIL(id));
      if (!res.ok) throw new Error('Failed to load campaign');
      setActive((await res.json()) as Campaign);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not open campaign'));
    }
  };

  const commitCampaign = async () => {
    if (!active) return;
    if (active.status === 'committed') {
      toast.error('Already committed to the calendar');
      return;
    }
    setCommitting(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CAMPAIGN_COMMIT(active.id), {
        method: 'POST',
        timeoutMs: API_CONFIG.timeout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to commit campaign',
        );
      }
      const data = (await res.json()) as CampaignCommitResponse;
      setActive(data.campaign);
      toast.success(data.message || 'Committed to calendar');
      void loadHistory();
    } catch (e) {
      toast.error(errorDetail(e, 'Commit failed'));
    } finally {
      setCommitting(false);
    }
  };

  const deleteCampaign = async (id: number) => {
    if (!confirm('Delete this campaign? Calendar events (if committed) are kept.')) return;
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CAMPAIGN_DETAIL(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      if (active?.id === id) setActive(null);
      toast.success('Campaign deleted');
      void loadHistory();
    } catch (e) {
      toast.error(errorDetail(e, 'Could not delete campaign'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-brand-700" />
          Campaigns
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Plan multi-product timelines with PKT posting times, then commit drafts to the
          Content Calendar and attach media before publish.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Builder */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-lg shadow p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Campaign builder
            </h2>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Name (optional)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spice launch Q3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Duration (days)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={durationDays}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setDurationDays(next);
                  }}
                  onBlur={() => {
                    if (!durationDays) setDurationDays('14');
                  }}
                  placeholder="14"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                Platforms
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => {
                  const on = platforms.includes(p.value);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => togglePlatform(p.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        on
                          ? 'bg-brand-700 text-white border-brand-700'
                          : 'bg-white text-gray-600 border-slate-300 hover:border-brand-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600">
                  Products & categories
                </label>
                <button
                  type="button"
                  onClick={addProductRow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add row
                </button>
              </div>
              <div className="space-y-2">
                {products.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start"
                  >
                    <input
                      value={row.category || ''}
                      onChange={(e) => updateProduct(index, { category: e.target.value })}
                      placeholder="Category *"
                      className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30"
                    />
                    <input
                      value={row.product || ''}
                      onChange={(e) => updateProduct(index, { product: e.target.value })}
                      placeholder="Product (optional)"
                      className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => removeProductRow(index)}
                      disabled={products.length <= 1}
                      className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Category is required. Product is optional — you can run a category-only
                campaign.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void runCampaign()}
              disabled={planning}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-lg"
            >
              {planning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {planning ? 'Generating plan…' : 'Run Campaign'}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">
              Past campaigns
            </h2>
            {historyLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400">No campaigns yet.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 hover:border-brand-300"
                  >
                    <button
                      type="button"
                      onClick={() => void openCampaign(c.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {c.start_date} · {c.duration_days}d · {c.item_count} posts ·{' '}
                        <span className="capitalize">{c.status}</span>
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCampaign(c.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Plan preview */}
        <div className="xl:col-span-2 space-y-4">
          {!active ? (
            <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
              <Megaphone className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">
                Configure products/categories and click <strong>Run Campaign</strong> to
                generate a full post breakdown and PKT timeline.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{active.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {active.start_date} · {active.duration_days} days ·{' '}
                      {active.timezone} ·{' '}
                      <span className="capitalize font-semibold">{active.status}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Platforms:{' '}
                      {active.platforms.map((p) => p).join(', ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {active.status !== 'committed' && (
                      <button
                        type="button"
                        onClick={() => void commitCampaign()}
                        disabled={committing}
                        className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm"
                      >
                        {committing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CalendarPlus className="h-4 w-4" />
                        )}
                        Commit to Calendar
                      </button>
                    )}
                    {active.status === 'committed' && (
                      <Link
                        href="/dashboard/calendar"
                        className="inline-flex items-center gap-2 border border-brand-700 text-brand-800 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-50"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Open Calendar
                      </Link>
                    )}
                  </div>
                </div>

                {summaryEntries.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {summaryEntries.map(([type, count]) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700"
                      >
                        {ASSET_LABELS[type] || type}
                        <span className="text-brand-800">{count}</span>
                      </span>
                    ))}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gold-100 text-xs font-semibold text-gold-900">
                      Total {active.items.length}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow p-5">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">
                  Timeline (Pakistan Standard Time)
                </h3>
                <div className="space-y-6">
                  {itemsByDay.map(({ day, items }) => (
                    <div key={day}>
                      <p className="text-xs font-bold text-brand-800 mb-2 sticky top-0 bg-white py-1">
                        {day}
                      </p>
                      <ul className="space-y-3">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="border border-gray-200 rounded-lg p-3 hover:border-brand-300"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-900 text-[11px] font-bold uppercase">
                                {ASSET_LABELS[item.asset_type] || item.asset_type}
                              </span>
                              <span className="text-xs font-semibold text-gray-700">
                                {formatPkt(item.scheduled_at_pkt)}
                              </span>
                              <span className="text-[11px] text-gray-400 capitalize">
                                {item.platforms.join(' · ')}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-800">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {[item.category, item.product].filter(Boolean).join(' · ')}
                              {item.topic ? ` · ${item.topic}` : ''}
                            </p>
                            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-4">
                              {item.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
