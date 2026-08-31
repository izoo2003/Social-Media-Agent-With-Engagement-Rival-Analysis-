'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart3,
  CalendarDays,
  Globe,
  ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  PenLine,
  Send,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { API_CONFIG, API_ENDPOINTS, fetchWithTimeout } from '@/lib/api-client';
import { formatKpiPeriod, periodKey, pktTodayISO, startOfPktMonth, startOfPktWeek, type KpiGranularity } from '@/lib/kpi-dates';
import type {
  KpiCounts,
  KpiDailyRow,
  KpiReportResponse,
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

function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function emptyCounts(): KpiCounts {
  return { auto: 0, manual: 0, total: 0 };
}

type SeriesRow = {
  period: string;
  auto: number;
  manual: number;
  total: number;
  image: number;
  video: number;
};

function seriesForMetric(
  daily: KpiDailyRow[],
  granularity: KpiGranularity,
  getter: (row: KpiDailyRow) => KpiCounts | undefined,
): SeriesRow[] {
  const map = new Map<string, SeriesRow>();
  const order: string[] = [];
  for (const row of daily) {
    const period = periodKey(row.date, granularity);
    if (!map.has(period)) {
      map.set(period, { period, auto: 0, manual: 0, total: 0, image: 0, video: 0 });
      order.push(period);
    }
    const cell = getter(row) || emptyCounts();
    const bucket = map.get(period)!;
    bucket.auto += cell.auto || 0;
    bucket.manual += cell.manual || 0;
    bucket.total += cell.total || 0;
    bucket.image += cell.breakdown?.image || 0;
    bucket.video += cell.breakdown?.video || 0;
  }
  return order.map((period) => map.get(period)!);
}

export default function KpiReportsPage() {
  const today = useMemo(() => pktTodayISO(), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [granularity, setGranularity] = useState<KpiGranularity>('daily');
  const [summary, setSummary] = useState<KpiSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<KpiReportResponse | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const loadSummary = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_SUMMARY(from, to));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to load KPI reports',
        );
      }
      setSummary((await res.json()) as KpiSummaryResponse);
    } catch (e) {
      toast.error(errorDetail(e, 'Could not load KPI reports'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(fromDate, toDate);
    setReport(null);
  }, [fromDate, toDate, loadSummary]);

  const applyPreset = (preset: KpiGranularity) => {
    const now = pktTodayISO();
    setGranularity(preset);
    if (preset === 'daily') {
      setFromDate(now);
      setToDate(now);
      return;
    }
    if (preset === 'weekly') {
      setFromDate(startOfPktWeek(now));
      setToDate(now);
      return;
    }
    setFromDate(startOfPktMonth(now));
    setToDate(now);
  };

  const generateSummary = async () => {
    setSummarizing(true);
    const pending = toast.loading('Generating KPI summary…');
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_REPORTS_SUMMARY(fromDate, toDate), {
        method: 'POST',
        timeoutMs: API_CONFIG.timeout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : `Summary failed (${res.status})`,
        );
      }
      const data = (await res.json()) as KpiReportResponse;
      setReport(data);
      toast.success(data.period_label || 'Summary ready', { id: pending });
    } catch (e) {
      toast.error(errorDetail(e, 'Could not generate KPI summary'), { id: pending });
    } finally {
      setSummarizing(false);
    }
  };

  const catalog = summary?.catalog ?? [];
  const namedCards = summary?.custom ?? [];
  const customCards = namedCards.filter((c) => (c.kind || 'custom') !== 'website_maintenance');
  const websiteCards = namedCards.filter((c) => c.kind === 'website_maintenance');
  const daily = summary?.daily ?? [];
  const groupingLabel =
    granularity === 'daily' ? 'Day' : granularity === 'weekly' ? 'Week' : 'Month';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-gold-300">
            Designer
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            <BarChart3 className="h-7 w-7 text-brand-700 dark:text-gold-400" />
            KPI Reports
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Each KPI is tracked on its own. Daily is the default. Switch to weekly or monthly, or
            pick a From–To range. Days use Asia/Karachi.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            {(
              [
                ['daily', 'Daily'],
                ['weekly', 'Weekly'],
                ['monthly', 'Monthly'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
                  granularity === id
                    ? 'bg-brand-800 text-white dark:bg-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-brand-700 dark:text-gold-400" />
              Generate summary
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Build a detailed breakdown for the selected day, week, month, or custom From–To range.
              Auto vs Manual is kept separate for every KPI.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generateSummary()}
            disabled={summarizing || loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {report ? 'Generate again' : 'Generate summary'}
          </button>
        </div>
      </div>

      {report ? (
        <section className="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm dark:border-slate-600 dark:bg-brand-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-800 dark:text-gold-300">
            {report.period_label}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {report.overview}
          </p>
          {report.highlights.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {report.highlights.map((item, idx) => (
                <li key={`${idx}-${item.slice(0, 32)}`}>{item}</li>
              ))}
            </ul>
          ) : null}
          {report.message ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{report.message}</p>
          ) : null}
        </section>
      ) : null}

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading KPI reports…
        </div>
      ) : null}

      {catalog.map((metric) => {
        const rows = seriesForMetric(daily, granularity, (row) => row.catalog[metric.key]);
        const Icon = CATALOG_ICONS[metric.key] || Target;
        return (
          <MetricReport
            key={metric.key}
            title={metric.label}
            description={metric.description || ''}
            icon={Icon}
            groupingLabel={groupingLabel}
            granularity={granularity}
            auto={metric.auto}
            manual={metric.manual}
            total={metric.total}
            showMediaSplit={metric.key === 'posts_published'}
            imageCount={metric.breakdown?.image}
            videoCount={metric.breakdown?.video}
            rows={rows}
          />
        );
      })}

      {customCards.map((card) => (
        <MetricReport
          key={`custom-${card.id}`}
          title={card.name}
          description="Custom KPI — manual entries only."
          icon={Target}
          groupingLabel={groupingLabel}
          granularity={granularity}
          auto={card.auto}
          manual={card.manual}
          total={card.total}
          rows={seriesForMetric(daily, granularity, (row) => row.custom[String(card.id)])}
        />
      ))}

      {websiteCards.map((card) => (
        <MetricReport
          key={`website-${card.id}`}
          title={card.name}
          description="Website Maintenance — manual entries only."
          icon={Globe}
          groupingLabel={groupingLabel}
          granularity={granularity}
          auto={card.auto}
          manual={card.manual}
          total={card.total}
          rows={seriesForMetric(daily, granularity, (row) => row.custom[String(card.id)])}
        />
      ))}
    </div>
  );
}

function MetricReport({
  title,
  description,
  icon: Icon,
  groupingLabel,
  granularity,
  auto,
  manual,
  total,
  showMediaSplit,
  imageCount,
  videoCount,
  rows,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  groupingLabel: string;
  granularity: KpiGranularity;
  auto: number;
  manual: number;
  total: number;
  showMediaSplit?: boolean;
  imageCount?: number;
  videoCount?: number;
  rows: SeriesRow[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            <Icon className="h-4 w-4 text-brand-700 dark:text-gold-400" />
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        <div className="text-left sm:text-right">
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Auto {auto} · Manual {manual}
          </p>
          {showMediaSplit ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Images {imageCount ?? 0} · Reels/video {videoCount ?? 0}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="whitespace-nowrap py-2 pr-4 font-semibold">{groupingLabel}</th>
              <th className="whitespace-nowrap py-2 px-2 font-semibold">Auto</th>
              <th className="whitespace-nowrap py-2 px-2 font-semibold">Manual</th>
              <th className="whitespace-nowrap py-2 px-2 font-semibold">Total</th>
              {showMediaSplit ? (
                <>
                  <th className="whitespace-nowrap py-2 px-2 font-semibold">Images</th>
                  <th className="whitespace-nowrap py-2 px-2 font-semibold">Reels/video</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.period}
                className="border-b border-slate-100 last:border-0 dark:border-slate-700"
              >
                <td className="whitespace-nowrap py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  {formatKpiPeriod(row.period, granularity)}
                </td>
                <td className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                  {row.auto}
                </td>
                <td className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                  {row.manual}
                </td>
                <td className="whitespace-nowrap py-2 px-2 font-medium text-slate-800 dark:text-slate-200">
                  {row.total}
                </td>
                {showMediaSplit ? (
                  <>
                    <td className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                      {row.image}
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-slate-700 dark:text-slate-300">
                      {row.video}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
