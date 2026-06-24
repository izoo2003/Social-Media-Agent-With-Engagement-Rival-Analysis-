'use client';

import { useState } from 'react';
import { API_ENDPOINTS, apiFetch } from '@/lib/api-client';
import { CalendarEvent } from '@/lib/types';

interface EventDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (event: CalendarEvent) => void;
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼',
  facebook: '👍',
  instagram: '📷',
  youtube: '▶️',
  twitter: '𝕏',
  tiktok: '🎵',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  publishing: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  partial: 'bg-orange-100 text-orange-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-600',
};

export default function EventDetailModal({
  event,
  onClose,
  onChanged,
  onEdit,
}: EventDetailModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!event) return null;

  const isFinal = ['published'].includes(event.status);
  const canPublishNow = ['pending', 'failed', 'partial'].includes(event.status);
  const canCancel = ['pending', 'failed'].includes(event.status);

  const run = async (
    key: string,
    fn: () => Promise<Response>,
    closeAfter = false
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Request failed');
      }
      onChanged();
      if (closeAfter) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  };

  const publishNow = () =>
    run('publish', () =>
      apiFetch(API_ENDPOINTS.CALENDAR_PUBLISH_NOW(event.id), { method: 'POST' })
    );

  const cancelEvent = () =>
    run('cancel', () =>
      apiFetch(API_ENDPOINTS.CALENDAR_EVENT(event.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
    );

  const deleteEvent = () =>
    run(
      'delete',
      () => apiFetch(API_ENDPOINTS.CALENDAR_EVENT(event.id), { method: 'DELETE' }),
      true
    );

  const scheduledLocal = new Date(event.scheduled_date).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-lg font-bold text-slate-900">Scheduled Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                STATUS_STYLES[event.status] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {event.status}
            </span>
            {event.draft_mode && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gold-100 text-gold-800">
                Draft mode
              </span>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">When</p>
            <p className="text-sm text-gray-800">{scheduledLocal}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {event.platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-sm text-gray-700 capitalize"
                >
                  <span>{PLATFORM_ICONS[p] || '📝'}</span>
                  {p}
                </span>
              ))}
            </div>
          </div>

          {event.content_title && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Title</p>
              <p className="text-sm font-medium text-gray-800">{event.content_title}</p>
            </div>
          )}

          {event.content_body && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Caption</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.content_body}</p>
              </div>
            </div>
          )}

          {event.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Notes</p>
              <p className="text-sm text-gray-700">{event.notes}</p>
            </div>
          )}

          {event.error_message && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-600 uppercase mb-1">Error</p>
              <p className="text-sm text-red-700">{event.error_message}</p>
            </div>
          )}

          {event.results && event.results.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Results</p>
              <div className="space-y-1">
                {event.results.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm gap-2">
                    <span className="capitalize text-gray-700">
                      {r.platform}
                      {r.account_label ? ` (${r.account_label})` : ''}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.status === 'published'
                          ? 'bg-green-100 text-green-800'
                          : r.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 px-6 py-4 space-y-2 sticky bottom-0 bg-white rounded-b-xl">
          {!isFinal && (
            <div className="flex gap-2">
              {canPublishNow && (
                <button
                  onClick={publishNow}
                  disabled={!!busy}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400"
                >
                  {busy === 'publish' ? 'Publishing…' : '⚡ Publish now'}
                </button>
              )}
              <button
                onClick={() => onEdit(event)}
                disabled={!!busy}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold text-gray-800 bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
              >
                ✏️ Reschedule
              </button>
              {canCancel && (
                <button
                  onClick={cancelEvent}
                  disabled={!!busy}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 disabled:opacity-50"
                >
                  {busy === 'cancel' ? '…' : 'Cancel'}
                </button>
              )}
            </div>
          )}
          <button
            onClick={deleteEvent}
            disabled={!!busy}
            className="w-full py-2 px-3 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
          >
            {busy === 'delete' ? 'Deleting…' : '🗑️ Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
