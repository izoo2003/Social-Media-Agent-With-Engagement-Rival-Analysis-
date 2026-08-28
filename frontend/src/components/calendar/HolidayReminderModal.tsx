'use client';

import { format } from 'date-fns';
import type { PakistanHoliday } from '@/lib/pakistan-holidays';

type ReminderHoliday = PakistanHoliday & { daysUntil: number };

interface HolidayReminderModalProps {
  holiday: ReminderHoliday | null;
  onDismiss: () => void;
  onRemindLater: () => void;
}

export default function HolidayReminderModal({
  holiday,
  onDismiss,
  onRemindLater,
}: HolidayReminderModalProps) {
  if (!holiday) return null;

  const when =
    holiday.daysUntil === 0
      ? 'today'
      : holiday.daysUntil === 1
        ? 'tomorrow'
        : `in ${holiday.daysUntil} days`;

  const dateLabel = format(
    new Date(`${holiday.date}T12:00:00`),
    'EEEE, d MMMM yyyy',
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden dark:bg-slate-800 dark:border dark:border-slate-700">
        <div className="bg-brand-700 px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Designer reminder
          </p>
          <h2 className="text-lg font-bold mt-0.5">Pakistan holiday coming up</h2>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {holiday.name}
            </p>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
              Falls on <span className="font-semibold">{dateLabel}</span> ({when}).
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-xs font-semibold text-amber-900 uppercase dark:text-amber-200">
              Create a special post
            </p>
            <p className="text-sm text-amber-900/90 mt-1 dark:text-amber-100/90">
              {holiday.tip} Schedule it on the Content Calendar before the day arrives.
            </p>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            {holiday.kind === 'religious'
              ? 'Religious date is approximate — confirm locally if needed.'
              : 'National fixed-date holiday in Pakistan.'}
          </p>
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex gap-2 dark:border-slate-600">
          <button
            type="button"
            onClick={onRemindLater}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
          >
            Remind later
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
