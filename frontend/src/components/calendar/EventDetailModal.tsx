'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API_ENDPOINTS, API_BASE_URL, apiFetch } from '@/lib/api-client';
import { uploadMediaFile } from '@/lib/media-upload';
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

const MAX_MEDIA_UPLOAD_MB = 200;

function resolveMediaUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const cleaned = pathOrUrl.replace(/^\/?uploads\//, '');
  return `${API_BASE_URL}/uploads/${cleaned}`;
}

export default function EventDetailModal({
  event,
  onClose,
  onChanged,
  onEdit,
}: EventDetailModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localMediaType, setLocalMediaType] = useState<string | null>(null);
  const [attachSuccess, setAttachSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    setBusy(null);
    setAttachSuccess(false);
    setLocalPreview(null);
    setLocalMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [event?.id]);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  if (!event) return null;

  const isFinal = ['published'].includes(event.status);
  const canPublishNow = ['pending', 'failed', 'partial'].includes(event.status);
  const canCancel = ['pending', 'failed'].includes(event.status);
  const canAttachMedia =
    !isFinal && event.status !== 'cancelled' && Boolean(event.content_id);

  const existingMediaUrl = resolveMediaUrl(event.media_url || event.media_path);
  const previewUrl = localPreview || existingMediaUrl;
  const previewType = localMediaType || event.media_type;
  const showNeedsMedia = Boolean(event.needs_media) && !attachSuccess && !localPreview;

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
        const detail = err.detail;
        throw new Error(
          typeof detail === 'string' ? detail : 'Request failed'
        );
      }
      onChanged();
      if (closeAfter) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  };

  const publishNow = () => {
    if (event.needs_media && !event.media_path && !attachSuccess) {
      setError('Attach media before publishing this campaign post.');
      return;
    }
    return run('publish', () =>
      apiFetch(API_ENDPOINTS.CALENDAR_PUBLISH_NOW(event.id), { method: 'POST' })
    );
  };

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

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !event.content_id) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Please select an image or video file (JPG, PNG, GIF, MP4, MOV, etc.)');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_MEDIA_UPLOAD_MB * 1024 * 1024) {
      setError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(0)} MB). Max is ${MAX_MEDIA_UPLOAD_MB} MB.`
      );
      e.target.value = '';
      return;
    }

    setError(null);
    setAttachSuccess(false);
    setBusy('media');

    if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
    const immediatePreview = URL.createObjectURL(file);
    setLocalPreview(immediatePreview);
    setLocalMediaType(isImage ? 'image' : 'video');

    try {
      let mediaMeta: {
        media_path: string;
        media_type: string;
        media_original_name: string;
        media_url?: string;
      };

      const { needsVideoProcessing, prepareMediaForUpload } = await import(
        '@/lib/process-media'
      );
      if (needsVideoProcessing(file)) {
        const prepared = await prepareMediaForUpload(file);
        if (prepared.mode === 'stored') {
          mediaMeta = {
            media_path: prepared.media_path,
            media_type: prepared.media_type,
            media_original_name: prepared.media_original_name,
            media_url: prepared.media_url,
          };
        } else {
          mediaMeta = await uploadMediaFile(prepared.file);
        }
      } else {
        mediaMeta = await uploadMediaFile(file);
      }

      const attachRes = await apiFetch(
        API_ENDPOINTS.CONTENT_ATTACH_MEDIA(event.content_id),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_path: mediaMeta.media_path,
            media_type: mediaMeta.media_type,
            media_original_name: mediaMeta.media_original_name,
          }),
        }
      );
      if (!attachRes.ok) {
        const err = await attachRes.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string' ? err.detail : 'Failed to attach media'
        );
      }

      if (mediaMeta.media_url) {
        if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
        setLocalPreview(resolveMediaUrl(mediaMeta.media_url));
      }
      setAttachSuccess(true);
      toast.success(
        'Media attached — this post stays scheduled and will auto-publish at the set time.'
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach media');
      if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      setLocalMediaType(null);
    } finally {
      setBusy(null);
      e.target.value = '';
    }
  };

  const scheduledLocal = new Date(event.scheduled_date).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Scheduled Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
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
            {showNeedsMedia && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                Needs media
              </span>
            )}
            {(attachSuccess || (event.media_path && !event.needs_media)) && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Media ready
              </span>
            )}
            {event.asset_type && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                {event.asset_type.replace(/_/g, ' ')}
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

          {/* Media attach */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Media</p>
            {previewUrl && (
              <div className="mb-3 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {previewType === 'video' ? (
                  <video
                    src={previewUrl}
                    controls
                    className="w-full max-h-48 object-contain bg-black"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Attached media"
                    className="w-full max-h-48 object-contain"
                  />
                )}
              </div>
            )}

            {canAttachMedia && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(ev) => void handleMediaSelect(ev)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!!busy}
                  className="w-full py-2.5 px-3 rounded-lg text-sm font-semibold border-2 border-dashed border-brand-300 text-brand-800 bg-brand-50 hover:bg-brand-100 disabled:opacity-50"
                >
                  {busy === 'media'
                    ? 'Uploading & linking…'
                    : previewUrl
                      ? 'Replace media'
                      : 'Attach image or video'}
                </button>
                <p className="text-[11px] text-gray-500">
                  After attach, this post stays on the calendar and auto-publishes at the
                  scheduled time (max {MAX_MEDIA_UPLOAD_MB} MB).
                </p>
              </div>
            )}

            {!canAttachMedia && !previewUrl && (
              <p className="text-sm text-gray-400">No media attached.</p>
            )}
          </div>

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
