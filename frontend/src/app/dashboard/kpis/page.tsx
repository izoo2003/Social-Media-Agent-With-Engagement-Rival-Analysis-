'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  PenLine,
  Plus,
  Send,
  Target,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { API_ENDPOINTS, fetchWithTimeout } from '@/lib/api-client';
import {
  formatKpiDay,
  pktTodayISO,
  startOfPktMonth,
  startOfPktWeek,
} from '@/lib/kpi-dates';
import type {
  KpiCatalogMetric,
  KpiManualEntry,
  KpiSummaryResponse,
} from '@/lib/types';

const CATALOG_ICONS: Record<string, LucideIcon> = {
  posts_published: Send,
  posts_scheduled: CalendarDays,
  images_generated: ImageIcon,
  voiceovers_generated: Mic,
  scripts_generated: PenLine,
  campaigns_started: Megaphone,
  rivals_added: Users,
};

const SHORT_LABELS: Record<string, string> = {
  posts_published: 'Published',
  posts_scheduled: 'Scheduled',
  images_generated: 'Images',
  voiceovers_generated: 'Voice',
  scripts_generated: 'Scripts',
  campaigns_started: 'Campaigns',
  rivals_added: 'Rivals',
};

function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function KpisPage() {
  const today = useMemo(() => pktTodayISO(), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [summary, setSummary] = useState<KpiSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [manualTarget, setManualTarget] = useState('catalog:posts_published');
  const [manualQty, setManualQty] = useState('1');
  const [manualDate, setManualDate] = useState(today);
  const [manualNote, setManualNote] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [customName, setCustomName] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);

  const loadSummary = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_SUMMARY(from, to));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to load KPIs',
        );
      }
      setSummary((await res.json()) as KpiSummaryResponse);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not load KPIs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(fromDate, toDate);
  }, [fromDate, toDate, loadSummary]);

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const now = pktTodayISO();
    if (preset === 'today') {
      setFromDate(now);
      setToDate(now);
      setManualDate(now);
      return;
    }
    if (preset === 'week') {
      setFromDate(startOfPktWeek(now));
      setToDate(now);
      return;
    }
    setFromDate(startOfPktMonth(now));
    setToDate(now);
  };

  const parseTarget = (value: string): { metric_key?: string; custom_definition_id?: number } => {
    if (value.startsWith('custom:')) {
      return { custom_definition_id: Number(value.slice(7)) };
    }
    return { metric_key: value.replace(/^catalog:/, '') };
  };

  const submitManual = async () => {
    const qty = Number.parseInt(manualQty, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    setSavingManual(true);
    try {
      const payload = {
        ...parseTarget(manualTarget),
        quantity: qty,
        note: manualNote.trim() || null,
        occurred_on: manualDate,
      };
      const url =
        editingId != null
          ? API_ENDPOINTS.KPI_MANUAL_DETAIL(editingId)
          : API_ENDPOINTS.KPI_MANUAL;
      const res = await fetchWithTimeout(url, {
        method: editingId != null ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to save manual KPI',
        );
      }
      toast.success(editingId != null ? 'Manual entry updated' : 'Manual entry added');
      setManualQty('1');
      setManualNote('');
      setEditingId(null);
      await loadSummary(fromDate, toDate);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not save manual KPI'));
    } finally {
      setSavingManual(false);
    }
  };

  const startEdit = (entry: KpiManualEntry) => {
    if (entry.custom_definition_id) {
      setManualTarget(`custom:${entry.custom_definition_id}`);
    } else {
      setManualTarget(`catalog:${entry.metric_key || 'posts_published'}`);
    }
    setManualQty(String(entry.quantity));
    setManualDate(entry.occurred_on);
    setManualNote(entry.note || '');
    setEditingId(entry.id);
  };

  const deleteManual = async (id: number) => {
    if (!confirm('Delete this manual KPI entry?')) return;
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_MANUAL_DETAIL(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      if (editingId === id) setEditingId(null);
      toast.success('Entry deleted');
      await loadSummary(fromDate, toDate);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not delete entry'));
    }
  };

  const createCustom = async () => {
    const name = customName.trim();
    if (!name) {
      toast.error('Enter a name for the custom KPI');
      return;
    }
    setSavingCustom(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_CUSTOM, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to create KPI',
        );
      }
      const created = (await res.json()) as { id: number };
      setCustomName('');
      setManualTarget(`custom:${created.id}`);
      toast.success('Custom KPI added');
      await loadSummary(fromDate, toDate);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not create custom KPI'));
    } finally {
      setSavingCustom(false);
    }
  };

  const archiveCustom = async (id: number) => {
    if (!confirm('Archive this custom KPI? Past manual entries are kept.')) return;
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_CUSTOM_DETAIL(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Archive failed');
      toast.success('Custom KPI archived');
      await loadSummary(fromDate, toDate);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not archive KPI'));
    }
  };

  const catalog = summary?.catalog ?? [];
  const custom = summary?.custom ?? [];
  const daily = summary?.daily ?? [];
  const entries = summary?.manual_entries ?? [];
  const isSingleDay = fromDate === toDate;

  const metricLabel = (entry: KpiManualEntry) => {
    if (entry.custom_name) return entry.custom_name;
    const found = catalog.find((c) => c.key === entry.metric_key);
    return found?.label || entry.metric_key || 'KPI';
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-gold-300">
            Designer
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            <Target className="h-7 w-7 text-brand-700 dark:text-gold-400" />
            KPIs
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Auto counts work done in this agent. Add manual numbers for work done in
            other tools. Totals are Auto + Manual. Days use Asia/Karachi.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            {(
              [
                ['today', 'Today'],
                ['week', 'This week'],
                ['month', 'This month'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              From
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              To
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={today}
                onChange={(e) => setToDate(e.target.value)}
                className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>
        </div>
      </header>

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading KPIs…
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            Auto catalog
          </h2>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {catalog.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              Manual entry
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Log work done outside this agent (Canva, Photoshop, third-party tools).
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                KPI
                <select
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {catalog.map((m) => (
                    <option key={m.key} value={`catalog:${m.key}`}>
                      {m.label}
                    </option>
                  ))}
                  {custom.map((c) => (
                    <option key={c.id} value={`custom:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Date
                  <input
                    type="date"
                    value={manualDate}
                    max={today}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Note (optional)
                <input
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="e.g. 4 Canva posts for spice launch"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void submitManual()}
                  disabled={savingManual}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-800 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingId != null ? 'Update entry' : 'Add entry'}
                </button>
                {editingId != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setManualQty('1');
                      setManualNote('');
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              Custom KPI
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add a named card for work this agent cannot count automatically.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Canva graphics"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void createCustom()}
                disabled={savingCustom}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-800 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-2">
          {custom.length > 0 ? (
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Custom cards
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {custom.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{card.name}</h3>
                      <button
                        type="button"
                        onClick={() => void archiveCustom(card.id)}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                        title="Archive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {card.total}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Manual only · {card.manual} in range
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              Manual log
            </h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                No manual entries in this range.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        +{entry.quantity} {metricLabel(entry)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatKpiDay(entry.occurred_on)}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="text-xs font-semibold text-brand-700 hover:underline dark:text-gold-300"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteManual(entry.id)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
          {isSingleDay ? `Daily report · ${formatKpiDay(fromDate)}` : 'Daily report'}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Totals per day (Auto + Manual). Scroll sideways on smaller screens.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="whitespace-nowrap py-2 pr-4 font-semibold">Date</th>
                {catalog.map((m) => (
                  <th key={m.key} className="whitespace-nowrap py-2 px-2 font-semibold">
                    {SHORT_LABELS[m.key] || m.label}
                  </th>
                ))}
                {custom.map((c) => (
                  <th key={c.id} className="whitespace-nowrap py-2 px-2 font-semibold">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr
                  key={row.date}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-700"
                >
                  <td className="whitespace-nowrap py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                    {formatKpiDay(row.date)}
                  </td>
                  {catalog.map((m) => (
                    <td key={m.key} className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                      {row.catalog[m.key]?.total ?? 0}
                    </td>
                  ))}
                  {custom.map((c) => (
                    <td key={c.id} className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                      {row.custom[String(c.id)]?.total ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ metric }: { metric: KpiCatalogMetric }) {
  const Icon = CATALOG_ICONS[metric.key] || Target;
  const imageCount = metric.breakdown?.image;
  const videoCount = metric.breakdown?.video;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{metric.label}</h3>
        <Icon className="h-4 w-4 text-brand-700 dark:text-gold-400" />
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">{metric.total}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Auto {metric.auto} · Manual {metric.manual}
      </p>
      {metric.key === 'posts_published' && (imageCount != null || videoCount != null) ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Images {imageCount ?? 0} · Reels/video {videoCount ?? 0}
        </p>
      ) : null}
    </div>
  );
}
