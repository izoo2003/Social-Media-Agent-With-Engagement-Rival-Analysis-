'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_ENDPOINTS, apiFetch } from '@/lib/api-client';
import { formatFileSize, uploadMediaFile } from '@/lib/media-upload';
import { CalendarEvent, LinkedInAccountInfo } from '@/lib/types';

interface ContentItem {
  id: number;
  platform: string;
  title: string;
  body: string;
  status: string;
  media_type?: string | null;
}

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: (event: CalendarEvent) => void;
  initialDate?: Date | null;
  /** When provided, preselects this content item (e.g. opened from the generator). */
  initialContentId?: number | null;
  /** Caption overrides to apply to the preselected content (e.g. edits from preview). */
  initialOverrides?: { title?: string; body?: string };
  /** When provided, edits an existing event instead of creating a new one. */
  editEvent?: CalendarEvent | null;
}

type SourceMode = 'library' | 'upload';
type BusyPhase = 'processing' | 'uploading' | 'saving' | null;

const POSTABLE_PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  { id: 'facebook', name: 'Facebook', icon: '👍' },
  { id: 'instagram', name: 'Instagram', icon: '📷' },
  { id: 'youtube', name: 'YouTube', icon: '▶️' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
];

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼',
  facebook: '👍',
  instagram: '📷',
  youtube: '▶️',
  twitter: '𝕏',
  tiktok: '🎵',
  email: '✉️',
  whatsapp: '💬',
};

const MAX_MEDIA_UPLOAD_MB = 200;

/** Format a Date as a value suitable for <input type="datetime-local"> in local time. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function defaultDateTime(initial?: Date | null): string {
  const base = initial ? new Date(initial) : new Date();
  if (initial) {
    base.setHours(12, 0, 0, 0);
  } else {
    base.setHours(base.getHours() + 1, 0, 0, 0);
  }
  return toLocalInputValue(base);
}

export default function ScheduleModal({
  open,
  onClose,
  onScheduled,
  initialDate,
  initialContentId,
  initialOverrides,
  editEvent,
}: ScheduleModalProps) {
  const isEdit = !!editEvent;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceMode, setSourceMode] = useState<SourceMode>('library');
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [whenLocal, setWhenLocal] = useState<string>(defaultDateTime(initialDate));
  const [draftMode, setDraftMode] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyPhase, setBusyPhase] = useState<BusyPhase>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload-new fields
  const [manualTitle, setManualTitle] = useState('');
  const [manualBody, setManualBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [mediaProcessing, setMediaProcessing] = useState(false);

  // LinkedIn multi-account selection
  const [linkedinAccounts, setLinkedinAccounts] = useState<LinkedInAccountInfo[]>([]);
  const [selectedLinkedinAccounts, setSelectedLinkedinAccounts] = useState<string[]>([]);
  const [loadingLinkedinAccounts, setLoadingLinkedinAccounts] = useState(false);

  const hasLinkedin = platforms.includes('linkedin');
  const useUpload = !isEdit && sourceMode === 'upload';

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    setMediaProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Reset / hydrate form whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusyPhase(null);
    clearMedia();
    setManualTitle('');
    setManualBody('');

    if (editEvent) {
      setSourceMode('library');
      setSelectedContentId(editEvent.content_id);
      setPlatforms(editEvent.platforms || []);
      setWhenLocal(toLocalInputValue(new Date(editEvent.scheduled_date)));
      setDraftMode(editEvent.draft_mode);
      setNotes(editEvent.notes || '');
      setSelectedLinkedinAccounts(editEvent.linkedin_account_labels || []);
    } else {
      setSourceMode(initialContentId ? 'library' : 'library');
      setSelectedContentId(initialContentId ?? null);
      setPlatforms([]);
      setWhenLocal(defaultDateTime(initialDate));
      setDraftMode(false);
      setNotes('');
      setSelectedLinkedinAccounts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearMedia is local helper
  }, [open, editEvent, initialDate, initialContentId]);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // Load configured LinkedIn accounts when LinkedIn is a chosen platform
  useEffect(() => {
    if (!open || !hasLinkedin) return;
    let cancelled = false;
    setLoadingLinkedinAccounts(true);
    apiFetch(API_ENDPOINTS.LINKEDIN_ACCOUNTS)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((accs: LinkedInAccountInfo[]) => {
        if (cancelled) return;
        setLinkedinAccounts(accs);
        setSelectedLinkedinAccounts((prev) =>
          prev.length > 0 ? prev : accs.map((a) => a.label)
        );
      })
      .catch(() => {
        if (!cancelled) setLinkedinAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLinkedinAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, hasLinkedin]);

  const toggleLinkedinAccount = (label: string) => {
    setSelectedLinkedinAccounts((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  // Default platforms to the preselected content's own platform once loaded
  useEffect(() => {
    if (!open || isEdit || useUpload || !selectedContentId || platforms.length > 0) return;
    const c = contents.find((x) => x.id === selectedContentId);
    if (c && POSTABLE_PLATFORMS.some((p) => p.id === c.platform)) {
      setPlatforms([c.platform]);
    }
  }, [open, isEdit, useUpload, selectedContentId, contents, platforms.length]);

  // Load content history when opening (so the user can pick what to schedule)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingContents(true);
    apiFetch(API_ENDPOINTS.CONTENT_HISTORY + '?limit=100')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: ContentItem[]) => {
        if (!cancelled) setContents(data);
      })
      .catch(() => {
        if (!cancelled) setContents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingContents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedContent = useMemo(
    () => contents.find((c) => c.id === selectedContentId) || null,
    [contents, selectedContentId]
  );

  const handleSelectContent = (id: number) => {
    setSelectedContentId(id);
    if (!isEdit) {
      const c = contents.find((x) => x.id === id);
      if (c && POSTABLE_PLATFORMS.some((p) => p.id === c.platform)) {
        setPlatforms([c.platform]);
      }
    }
  };

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setMediaType(isImage ? 'image' : 'video');
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    const immediatePreview = URL.createObjectURL(file);
    setMediaPreview(immediatePreview);
    setMediaFile(file);

    try {
      const { needsVideoProcessing, prepareMediaForUpload } = await import('@/lib/process-media');
      if (!needsVideoProcessing(file)) {
        return;
      }
      setMediaProcessing(true);
      const readyFile = await prepareMediaForUpload(file);
      URL.revokeObjectURL(immediatePreview);
      setMediaPreview(URL.createObjectURL(readyFile));
      setMediaFile(readyFile);
      setMediaType('video');
    } catch (err) {
      URL.revokeObjectURL(immediatePreview);
      clearMedia();
      setError(err instanceof Error ? err.message : 'Processing failed. Try another file.');
    } finally {
      setMediaProcessing(false);
    }
  };

  const createContentFromUpload = async (): Promise<number> => {
    if (!manualTitle.trim() || !manualBody.trim()) {
      throw new Error('Enter a title and caption for the new post.');
    }
    if (platforms.length === 0) {
      throw new Error('Select at least one platform to publish to.');
    }

    let mediaMeta: {
      media_path: string;
      media_type: string;
      media_original_name: string;
    } | null = null;

    if (mediaFile) {
      setBusyPhase('uploading');
      mediaMeta = await uploadMediaFile(mediaFile);
    }

    setBusyPhase('saving');
    const primaryPlatform = platforms[0];
    const res = await apiFetch(API_ENDPOINTS.CONTENT_MANUAL, {
      method: 'POST',
      body: JSON.stringify({
        platform: primaryPlatform,
        title: manualTitle.trim(),
        body: manualBody.trim(),
        ...(mediaMeta
          ? {
              media_path: mediaMeta.media_path,
              media_type: mediaMeta.media_type,
              media_original_name: mediaMeta.media_original_name,
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create content');
    }
    const created = await res.json();
    return created.content_id as number;
  };

  const handleSubmit = async () => {
    setError(null);

    if (mediaProcessing) {
      setError('Please wait until media processing finishes.');
      return;
    }

    if (platforms.length === 0) {
      setError('Select at least one platform to publish to.');
      return;
    }
    if (hasLinkedin && linkedinAccounts.length > 0 && selectedLinkedinAccounts.length === 0) {
      setError('Select at least one LinkedIn account to publish to.');
      return;
    }
    if (!whenLocal) {
      setError('Please pick a date and time.');
      return;
    }

    if (!useUpload && !selectedContentId) {
      setError('Please choose a content item to schedule, or switch to Upload new.');
      return;
    }

    const scheduledIso = new Date(whenLocal).toISOString();

    setSubmitting(true);
    try {
      let contentId = selectedContentId;

      if (useUpload) {
        contentId = await createContentFromUpload();
      }

      setBusyPhase('saving');

      const url = isEdit
        ? API_ENDPOINTS.CALENDAR_EVENT(editEvent!.id)
        : API_ENDPOINTS.CALENDAR_EVENTS;
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        platforms,
        draft_mode: draftMode,
        scheduled_date: scheduledIso,
        notes: notes || null,
      };
      if (hasLinkedin && linkedinAccounts.length > 0) {
        body.linkedin_account_labels = selectedLinkedinAccounts;
      }
      if (!isEdit) {
        body.content_id = contentId;
        if (
          !useUpload &&
          initialOverrides &&
          selectedContentId === initialContentId
        ) {
          if (initialOverrides.title) body.override_title = initialOverrides.title;
          if (initialOverrides.body) body.override_body = initialOverrides.body;
        }
      }
      if (isEdit) body.status = 'pending';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to schedule post');
      }

      const event: CalendarEvent = await res.json();
      onScheduled(event);
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to schedule post';
      const looksLikeNetworkDrop =
        /failed to fetch|networkerror|load failed|http2|err_http/i.test(message) ||
        (e instanceof TypeError && /fetch/i.test(message));
      setError(
        looksLikeNetworkDrop
          ? 'Connection dropped while uploading. Try again or use a shorter video.'
          : message,
      );
    } finally {
      setSubmitting(false);
      setBusyPhase(null);
    }
  };

  if (!open) return null;

  const submitLabel = submitting
    ? busyPhase === 'uploading'
      ? 'Uploading...'
      : 'Saving…'
    : isEdit
    ? '💾 Save Changes'
    : '🗓️ Schedule Post';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? '✏️ Reschedule Post' : '🗓️ Schedule a Post'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Source: library vs upload */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content source
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('library');
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                    sourceMode === 'library'
                      ? 'border-brand-600 bg-brand-50 text-brand-900'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  From drafts / library
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('upload');
                    setSelectedContentId(null);
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                    sourceMode === 'upload'
                      ? 'border-brand-600 bg-brand-50 text-brand-900'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Upload new post
                </button>
              </div>
            </div>
          )}

          {/* Library picker */}
          {!useUpload && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content to publish *
              </label>
              {loadingContents ? (
                <p className="text-sm text-gray-500">Loading your content…</p>
              ) : contents.length === 0 ? (
                <p className="text-sm text-amber-700">
                  No content found. Switch to <strong>Upload new post</strong> or generate captions
                  first.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                  {contents.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectContent(c.id)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                        selectedContentId === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl">{PLATFORM_ICONS[c.platform] || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                        <p className="text-xs text-gray-500 capitalize">
                          {c.platform}
                          {c.media_type ? ` • ${c.media_type}` : ''}
                        </p>
                      </div>
                      {selectedContentId === c.id && (
                        <span className="text-blue-600 font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Caption preview (library) */}
          {!useUpload && selectedContent && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Caption preview</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                {selectedContent.body}
              </p>
            </div>
          )}

          {/* Upload new: caption + media */}
          {useUpload && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Post title *
                </label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Short title for this post"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Caption *
                </label>
                <textarea
                  value={manualBody}
                  onChange={(e) => setManualBody(e.target.value)}
                  placeholder="Write the caption that will be published…"
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Media (optional)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {!mediaPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-purple-300 rounded-xl p-6 text-center hover:bg-purple-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-700">Click to upload image or video</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Large videos are processed automatically as soon as you select them
                    </p>
                  </button>
                ) : (
                  <div className="relative border border-gray-200 rounded-xl overflow-hidden">
                    {mediaProcessing && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <span className="animate-spin inline-block w-4 h-4 border-2 border-brand-700 border-t-transparent rounded-full" />
                          Processing...
                        </span>
                      </div>
                    )}
                    {mediaType === 'video' ? (
                      <video
                        src={mediaPreview}
                        className="w-full max-h-48 object-contain bg-black"
                        controls={!mediaProcessing}
                      />
                    ) : (
                      <img
                        src={mediaPreview}
                        alt="Media preview"
                        className="w-full max-h-48 object-contain bg-gray-50"
                      />
                    )}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{mediaFile?.name}</p>
                        <p className="text-xs text-gray-500">
                          {mediaProcessing
                            ? 'Processing...'
                            : mediaFile
                            ? formatFileSize(mediaFile.size)
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearMedia}
                        disabled={mediaProcessing}
                        className="text-sm text-red-600 hover:underline ml-3 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Platforms */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Publish to *
            </label>
            <div className="flex flex-wrap gap-2">
              {POSTABLE_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                    platforms.includes(p.id)
                      ? 'border-green-400 bg-green-50 text-gray-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{p.icon}</span>
                  <span className="text-sm font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* LinkedIn account picker */}
          {hasLinkedin && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">💼 LinkedIn Accounts</h3>
                {linkedinAccounts.length > 1 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedLinkedinAccounts(linkedinAccounts.map((a) => a.label))
                      }
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLinkedinAccounts([])}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {loadingLinkedinAccounts ? (
                <p className="text-sm text-gray-500">Loading LinkedIn accounts…</p>
              ) : linkedinAccounts.length === 0 ? (
                <p className="text-sm text-amber-700">
                  No LinkedIn accounts configured. Add tokens in the backend{' '}
                  <code className="text-xs">.env</code>.
                </p>
              ) : (
                <div className="space-y-2">
                  {linkedinAccounts.map((account) => (
                    <label
                      key={account.label}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedLinkedinAccounts.includes(account.label)
                          ? 'border-blue-400 bg-white'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLinkedinAccounts.includes(account.label)}
                        onChange={() => toggleLinkedinAccount(account.label)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-800">{account.label}</span>
                        <span className="text-xs text-gray-500 ml-2">Account {account.index}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date & time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date &amp; time *
              </label>
              <input
                type="datetime-local"
                value={whenLocal}
                onChange={(e) => setWhenLocal(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Uses your local time. The post fires automatically when this time arrives.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode</label>
              <button
                type="button"
                onClick={() => setDraftMode(!draftMode)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg border-2 ${
                  draftMode
                    ? 'border-gold-300 bg-gold-50'
                    : 'border-emerald-300 bg-emerald-50'
                }`}
              >
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    draftMode ? 'bg-gold-500' : 'bg-emerald-500'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      draftMode ? 'translate-x-1' : 'translate-x-6'
                    }`}
                  />
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {draftMode ? '🔒 Draft (simulated)' : '🌐 Live posting'}
                </span>
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Tied to the EU trade fair announcement"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4 sticky bottom-0 bg-white rounded-b-xl">
          <button
            onClick={handleSubmit}
            disabled={submitting || mediaProcessing}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-white transition-all ${
              submitting || mediaProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-brand-700 hover:bg-brand-800'
            }`}
          >
            {mediaProcessing ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                Processing...
              </span>
            ) : submitting ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                {submitLabel}
              </span>
            ) : (
              submitLabel
            )}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
