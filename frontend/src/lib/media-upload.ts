/**
 * Shared media upload helper (Railway /content/media/upload).
 */

import { API_ENDPOINTS, API_CONFIG, apiFetch } from './api-client';

export async function uploadMediaFile(file: File): Promise<{
  media_path: string;
  media_type: string;
  media_original_name: string;
  media_url?: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.uploadTimeout);
  try {
    const uploadRes = await apiFetch(API_ENDPOINTS.MEDIA_UPLOAD, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!uploadRes.ok) {
      const errorData = await uploadRes.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to upload media');
    }
    const uploaded = await uploadRes.json();
    return {
      media_path: uploaded.media_path,
      media_type: uploaded.media_type,
      media_original_name: uploaded.media_original_name,
      media_url: uploaded.media_url,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Upload timed out. Try a shorter video.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
