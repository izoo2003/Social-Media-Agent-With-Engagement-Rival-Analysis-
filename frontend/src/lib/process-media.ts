/**
 * Large-video processing before Railway upload.
 *
 * Prefer CloudConvert (free API key, fast server encode) when configured.
 * Fall back to browser ffmpeg.wasm (slower) when CloudConvert is unset/fails.
 *
 * UI should say "Processing" — never "compressing".
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { API_ENDPOINTS, apiFetch } from './api-client';

/** Target size after browser processing (~10–20 MB). */
export const SAFE_UPLOAD_BYTES = 18 * 1024 * 1024;

/** Start processing when a video is larger than this. */
export const PROCESS_VIDEO_ABOVE_BYTES = 40 * 1024 * 1024;

const FFMPEG_CORE_BASE =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

export type ProcessMediaProgress = {
  percent: number;
  label: string;
  elapsedSec?: number;
};

export type ProcessMediaOptions = {
  onProgress?: (progress: ProcessMediaProgress) => void;
};

/** Result after processing — either a local File or already stored on the server. */
export type PreparedMedia =
  | { mode: 'file'; file: File }
  | {
      mode: 'stored';
      media_path: string;
      media_type: string;
      media_original_name: string;
      media_url?: string;
      /** Local blob URL for preview (caller should revoke). */
      previewFile?: File;
    };

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let processConfigCache: { provider: string; at: number } | null = null;

async function getProcessProvider(): Promise<'cloudconvert' | 'browser'> {
  const now = Date.now();
  if (processConfigCache && now - processConfigCache.at < 60_000) {
    return processConfigCache.provider === 'cloudconvert' ? 'cloudconvert' : 'browser';
  }
  try {
    const res = await apiFetch(API_ENDPOINTS.MEDIA_PROCESS_CONFIG);
    if (!res.ok) return 'browser';
    const data = await res.json();
    const provider = data.provider === 'cloudconvert' ? 'cloudconvert' : 'browser';
    processConfigCache = { provider, at: now };
    return provider;
  } catch {
    return 'browser';
  }
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
}

export function needsVideoProcessing(file: File): boolean {
  return isVideoFile(file) && file.size > PROCESS_VIDEO_ABOVE_BYTES;
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(0, i) : name;
}

async function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(0);
    };
    video.src = url;
  });
}

async function getFFmpeg(
  onProgress?: (progress: ProcessMediaProgress) => void,
): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  onProgress?.({ percent: 2, label: 'Downloading tools…', elapsedSec: 0 });

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    onProgress?.({ percent: 6, label: 'Downloading tools…', elapsedSec: 0 });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  }
}

type EncodePass = {
  scaleHeight: number;
  crf: number;
  audioKbps: number;
  maxFps: number;
};

async function encodePass(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  pass: EncodePass,
  durationSec: number,
  targetBytes: number,
): Promise<Uint8Array> {
  const args = [
    '-i',
    inputName,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'fastdecode',
    '-crf',
    String(pass.crf),
    '-vf',
    `scale=-2:'min(${pass.scaleHeight},ih)',fps=${pass.maxFps}`,
    '-c:a',
    'aac',
    '-b:a',
    `${pass.audioKbps}k`,
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-y',
    outputName,
  ];

  if (durationSec > 1) {
    const audioBits = pass.audioKbps * 1000;
    const totalBits = Math.max(180_000, Math.floor((targetBytes * 8) / durationSec) - audioBits);
    const videoKbps = Math.max(180, Math.floor(totalBits / 1000));
    const crfIdx = args.indexOf('-crf');
    args.splice(crfIdx + 2, 0, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`);
  }

  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outputName);
  if (typeof data === 'string') {
    throw new Error('Unexpected text output while processing media');
  }
  return data as Uint8Array;
}

function uploadToCloudConvert(
  uploadUrl: string,
  parameters: Record<string, string>,
  file: File,
  onUploadProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(parameters || {})) {
      form.append(key, value);
    }
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Fast processing upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Fast processing upload failed (network)'));
    xhr.send(form);
  });
}

async function prepareViaCloudConvert(
  file: File,
  options: ProcessMediaOptions,
): Promise<PreparedMedia> {
  const { onProgress } = options;
  const startedAt = Date.now();
  const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
  const report = (percent: number, label: string) => {
    onProgress?.({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
      elapsedSec: elapsed(),
    });
  };

  report(3, 'Starting fast processing…');
  const startRes = await apiFetch(API_ENDPOINTS.MEDIA_PROCESS_START, {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || 'video/mp4',
      size_bytes: file.size,
    }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.detail || 'Could not start fast video processing');
  }
  const start = await startRes.json();

  report(8, 'Uploading…');
  await uploadToCloudConvert(
    start.upload_url,
    start.upload_parameters || {},
    file,
    (ratio) => report(8 + ratio * 52, 'Uploading…'),
  );

  report(62, 'Processing on server…');
  // Poll-complete: backend waits for CloudConvert then stores the result.
  // Keep UI alive with a soft crawl while waiting.
  let soft = 62;
  const tick = setInterval(() => {
    soft = Math.min(90, soft + 0.4);
    report(soft, 'Processing on server…');
  }, 1000);

  try {
    const completeRes = await apiFetch(API_ENDPOINTS.MEDIA_PROCESS_COMPLETE, {
      method: 'POST',
      body: JSON.stringify({
        job_id: start.job_id,
        original_filename: file.name,
      }),
    });
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.detail || 'Fast video processing failed');
    }
    const stored = await completeRes.json();
    report(100, 'Ready');
    return {
      mode: 'stored',
      media_path: stored.media_path,
      media_type: stored.media_type,
      media_original_name: stored.media_original_name,
      media_url: stored.media_url,
      previewFile: file,
    };
  } finally {
    clearInterval(tick);
  }
}

async function prepareViaBrowser(
  file: File,
  options: ProcessMediaOptions,
): Promise<PreparedMedia> {
  const { onProgress } = options;
  const startedAt = Date.now();
  const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
  const report = (percent: number, label: string) => {
    onProgress?.({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
      elapsedSec: elapsed(),
    });
  };

  report(3, 'Preparing…');
  const ffmpeg = await getFFmpeg((p) =>
    onProgress?.({ ...p, elapsedSec: elapsed() }),
  );
  const ext = extensionOf(file.name) || '.mp4';
  const inputName = `input${ext === '.mov' ? '.mov' : ext === '.webm' ? '.webm' : '.mp4'}`;
  const outputName = 'output.mp4';

  report(10, 'Reading video…');
  const durationSec = await readVideoDurationSeconds(file);

  report(14, 'Loading media…');
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const passes: EncodePass[] = [
    { scaleHeight: 540, crf: 32, audioKbps: 64, maxFps: 24 },
    { scaleHeight: 360, crf: 36, audioKbps: 48, maxFps: 24 },
  ];

  let best: Uint8Array | null = null;
  let currentPassProgress = 0;

  const progressHandler = ({
    progress,
    time,
  }: {
    progress: number;
    time: number;
  }) => {
    if (durationSec > 1 && Number.isFinite(time) && time > 0) {
      currentPassProgress = Math.min(0.99, time / 1_000_000 / durationSec);
      return;
    }
    if (Number.isFinite(progress)) {
      currentPassProgress = Math.max(0, Math.min(1, progress));
    }
  };

  ffmpeg.on('progress', progressHandler);

  try {
    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }

      const passBase = i === 0 ? 18 : 88;
      const passWidth = i === 0 ? 70 : 8;

      const tick = setInterval(() => {
        const softFloor = Math.min(0.08, elapsed() / 600);
        const p = Math.max(currentPassProgress, softFloor * 0.5);
        report(passBase + p * passWidth * 0.98, 'Processing…');
      }, 250);

      try {
        currentPassProgress = 0;
        report(passBase, 'Processing…');
        const data = await encodePass(
          ffmpeg,
          inputName,
          outputName,
          pass,
          durationSec,
          SAFE_UPLOAD_BYTES,
        );
        best = data;
        report(passBase + passWidth, 'Processing…');
        if (data.byteLength <= SAFE_UPLOAD_BYTES) {
          break;
        }
      } finally {
        clearInterval(tick);
      }
    }
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
  }

  if (!best) {
    throw new Error('Processing failed. Try a shorter clip or generate without media.');
  }

  report(97, 'Finishing…');
  if (best.byteLength >= file.size) {
    report(100, 'Ready');
    return { mode: 'file', file };
  }

  const outName = `${baseName(file.name) || 'video'}.mp4`;
  const bytes = new Uint8Array(best);
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' });
  report(100, 'Ready');
  return {
    mode: 'file',
    file: new File([blob], outName, { type: 'video/mp4', lastModified: Date.now() }),
  };
}

/**
 * Process a large video for upload. Uses CloudConvert when configured (fast),
 * otherwise browser ffmpeg (slower).
 */
export async function prepareMediaForUpload(
  file: File,
  options: ProcessMediaOptions = {},
): Promise<PreparedMedia> {
  if (!needsVideoProcessing(file)) {
    options.onProgress?.({ percent: 100, label: 'Ready', elapsedSec: 0 });
    return { mode: 'file', file };
  }

  const provider = await getProcessProvider();
  if (provider === 'cloudconvert') {
    try {
      return await prepareViaCloudConvert(file, options);
    } catch (err) {
      console.warn('CloudConvert processing failed; falling back to browser.', err);
      options.onProgress?.({
        percent: 5,
        label: 'Switching to local processing…',
        elapsedSec: 0,
      });
    }
  }

  return prepareViaBrowser(file, options);
}
