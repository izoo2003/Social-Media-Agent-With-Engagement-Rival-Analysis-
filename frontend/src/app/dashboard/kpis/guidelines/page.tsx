'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardCheck, Loader2, Sparkles } from 'lucide-react';

import { API_CONFIG, API_ENDPOINTS, fetchWithTimeout } from '@/lib/api-client';
import {
  formatKpiDay,
  pktTodayISO,
  startOfPktMonth,
  startOfPktWeek,
} from '@/lib/kpi-dates';
import type {
  KpiGuidelinesResponse,
  KpiGuidelinesSectionReview,
  KpiGuidelinesWorkValidity,
} from '@/lib/types';

function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function verdictClasses(verdict: string): string {
  if (verdict === 'enough') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (verdict === 'not_enough') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200';
  }
  return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100';
}

function validityClasses(status: string): string {
  if (status === 'valid') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (status === 'insufficient') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200';
  }
  return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100';
}

function validityLabel(status: string): string {
  if (status === 'valid') return 'Logged work looks valid';
  if (status === 'insufficient') return 'Not enough evidence the work is complete';
  return 'Logged work needs a closer look';
}

function priorityBadge(priority: string): string {
  const p = priority.toLowerCase();
  if (p === 'high') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200';
  }
  if (p === 'low') {
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100';
}

export default function KpiGuidelinesPage() {
  const today = useMemo(() => pktTodayISO(), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [review, setReview] = useState<KpiGuidelinesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const now = pktTodayISO();
    if (preset === 'today') {
      setFromDate(now);
      setToDate(now);
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

  const generate = async () => {
    setLoading(true);
    const pending = toast.loading('Reviewing KPI Reports, logged work, and recent posts…');
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.KPI_GUIDELINES(fromDate, toDate), {
        method: 'POST',
        timeoutMs: API_CONFIG.timeout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : `Guidelines failed (${res.status})`,
        );
      }
      const data = (await res.json()) as KpiGuidelinesResponse;
      setReview(data);
      if (data.message && !data.improvements.length) {
        toast(data.message, { id: pending });
      } else {
        toast.success(data.verdict_label || 'Guidelines ready', { id: pending });
      }
    } catch (e) {
      toast.error(errorDetail(e, 'Could not generate KPI guidelines'), { id: pending });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-gold-300">
            Designer
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            <ClipboardCheck className="h-7 w-7 text-brand-700 dark:text-gold-400" />
            KPI Guidelines
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Gemini reviews KPI Reports (every catalog, custom, and Website Maintenance
            card) plus recent published posts, then says if a 9-hour shift looks filled,
            whether the logged work is valid, and how the designer can improve.
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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              <ClipboardCheck className="h-4 w-4 text-brand-700 dark:text-gold-400" />
              Shift review
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Gemini uses the same in-depth numbers as{' '}
              <span className="font-semibold">KPI Reports</span> — Auto, Manual, totals, quiet
              days, and peaks for every card — plus published posts, judged against a{' '}
              <span className="font-semibold">9-hour designer shift</span> per day. Up to 3 images
              are sent for visual review; videos are judged from captions and type.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {review ? 'Review again' : 'Review KPIs'}
          </button>
        </div>
      </div>

      {!review && !loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pick a date range above, then Review KPIs. Use Today for one 9-hour shift, or a longer
          range to judge several days of work.
        </p>
      ) : null}

      {loading && !review ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating guidelines…
        </div>
      ) : null}

      {review ? (
        <>
          <div className={`rounded-xl border p-5 shadow-sm ${verdictClasses(review.verdict)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">Verdict</p>
            <p className="mt-1 text-xl font-bold">{review.verdict_label}</p>
            <p className="mt-2 text-sm opacity-90">
              {`${review.shift_days} day${review.shift_days === 1 ? '' : 's'} × ${review.shift_hours}-hour shift${review.shift_days === 1 ? '' : 's'}`}
              {review.images_reviewed
                ? ` · ${review.images_reviewed} image${review.images_reviewed === 1 ? '' : 's'} reviewed`
                : ''}
            </p>
            {review.summary ? <p className="mt-3 text-sm leading-relaxed">{review.summary}</p> : null}
            {review.message ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white/50 p-3 text-xs dark:bg-slate-900/40">
                {review.message}
              </p>
            ) : null}
          </div>

          <WorkValidityCard validity={review.work_validity} />

          {review.section_reviews && review.section_reviews.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Review by KPI section
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {review.section_reviews.map((item, idx) => (
                  <SectionReviewCard key={`${item.section}-${idx}`} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          {review.final_review ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Final detailed review
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {review.final_review}
              </p>
            </section>
          ) : null}

          {review.self_improvement && review.self_improvement.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                How to improve
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {review.self_improvement.map((item, idx) => (
                  <li key={`${idx}-${item.slice(0, 40)}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.more_needed.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Still needed
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {review.more_needed.map((item, idx) => (
                  <li key={`${idx}-${item.slice(0, 40)}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.improvements.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Improvements
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {review.improvements.map((item, idx) => (
                  <div
                    key={`${item.area}-${idx}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
                        {item.area}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${priorityBadge(item.priority)}`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{item.finding}</p>
                    <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950/40 dark:text-gold-200">
                      <span className="font-semibold">Do this:</span> {item.action}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {review.post_notes.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Notes on published posts
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
                {review.post_notes.map((note, idx) => (
                  <li key={`${note.content_id ?? 'n'}-${idx}`} className="py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {note.title || 'Post'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{note.comment}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.reviewed_posts.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                Posts included in this review
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
                {review.reviewed_posts.map((post) => (
                  <li key={post.id} className="py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {post.title || `Post #${post.id}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {post.occurred_on ? formatKpiDay(post.occurred_on) : ''}
                      {post.platform ? ` · ${post.platform}` : ''}
                      {post.media_type ? ` · ${post.media_type}` : ''}
                      {post.image_reviewed ? ' · image sent to Gemini' : ''}
                    </p>
                    {post.body_preview ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                        {post.body_preview}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : !loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No published posts in this range — the review is based on generation and scheduling
              KPIs only.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function WorkValidityCard({
  validity,
}: {
  validity?: KpiGuidelinesWorkValidity | null;
}) {
  if (!validity) return null;
  const status = validity.status || 'questionable';
  if (!validity.notes && status === 'questionable') {
    return null;
  }
  return (
    <section className={`rounded-xl border p-5 shadow-sm ${validityClasses(status)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">Work validity</p>
      <p className="mt-1 text-lg font-bold">{validityLabel(status)}</p>
      {validity.notes ? (
        <p className="mt-2 text-sm leading-relaxed opacity-90">{validity.notes}</p>
      ) : null}
    </section>
  );
}

function SectionReviewCard({ item }: { item: KpiGuidelinesSectionReview }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.section}</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            item.valid
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100'
          }`}
        >
          {item.valid ? 'Looks valid' : 'Check logging'}
        </span>
      </div>
      {item.assessment ? (
        <p className="text-sm text-slate-700 dark:text-slate-300">{item.assessment}</p>
      ) : null}
      {item.improve ? (
        <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950/40 dark:text-gold-200">
          <span className="font-semibold">Do this:</span> {item.improve}
        </p>
      ) : null}
    </div>
  );
}
