'use client';

import { useEffect, useState } from 'react';
import { API_ENDPOINTS, fetchWithTimeout } from '@/lib/api-client';
import type { CustomHoliday } from '@/lib/types';

interface HolidayFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editHoliday?: CustomHoliday | null;
  presetDate?: string | null;
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item: { msg?: string }) => item.msg)
        .filter(Boolean)
        .join(', ') || fallback;
    }
  } catch {
    // ignore unreadable bodies
  }
  return fallback;
}

export default function HolidayFormModal({
  open,
  onClose,
  onSaved,
  editHoliday,
  presetDate,
}: HolidayFormModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editHoliday) {
      setName(editHoliday.name);
      setDate(editHoliday.date.slice(0, 10));
      setNote(editHoliday.note || '');
    } else {
      setName('');
      setDate(presetDate || '');
      setNote('');
    }
  }, [open, editHoliday, presetDate]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !date) {
      setError('Name and date are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: trimmed,
        date,
        note: note.trim() || null,
      });
      const res = editHoliday
        ? await fetchWithTimeout(API_ENDPOINTS.CALENDAR_HOLIDAY(editHoliday.id), {
            method: 'PATCH',
            body,
          })
        : await fetchWithTimeout(API_ENDPOINTS.CALENDAR_HOLIDAYS, {
            method: 'POST',
            body,
          });
      if (!res.ok) {
        setError(await readApiError(res, 'Could not save holiday.'));
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save holiday.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editHoliday) return;
    if (!window.confirm('Delete this holiday? It will disappear for everyone.')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CALENDAR_HOLIDAY(editHoliday.id), {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError(await readApiError(res, 'Could not delete holiday.'));
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete holiday.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden dark:bg-slate-800 dark:border dark:border-slate-700"
      >
        <div className="bg-indigo-700 px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Content Calendar
          </p>
          <h2 className="text-lg font-bold mt-0.5">
            {editHoliday ? 'Edit holiday' : 'Add holiday'}
          </h2>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              required
              placeholder="Brand launch day"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              Date
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What to post, or a reminder for the designer"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex flex-wrap gap-2 dark:border-slate-600">
          {editHoliday && (
            <button
              type="button"
              onClick={remove}
              disabled={saving || deleting}
              className="py-2 px-3 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="ml-auto py-2 px-3 rounded-lg text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || deleting}
            className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : editHoliday ? 'Save changes' : 'Add holiday'}
          </button>
        </div>
      </form>
    </div>
  );
}
