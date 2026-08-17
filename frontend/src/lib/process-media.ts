/**
 * Client-side media processing so large videos fit Railway upload limits.
 * UI should label this as "Processing" — never mention compression to the user.
 *
 * Runs as soon as a large video is selected (Content Posting + Calendar).
 *
 * Note: encoding in the browser (ffmpeg.wasm) is much slower than native ffmpeg.
 * We optimize for speed (ultrafast, few passes) and report progress from media time
 * so the bar keeps moving instead of sitting near ~19%.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/** Target size after processing (~10–20 MB so Railway uploads stay reliable). */
export const SAFE_UPLOAD_BYTES = 18 * 1024 * 1024;

/** Start processing when a video is larger than this. */
export const PROCESS_VIDEO_ABOVE_BYTES = 40 * 1024 * 1024;

const FFMPEG_CORE_BASE =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

export type ProcessMediaProgress = {
  /** 0–100 overall progress */
  percent: number;
  /** Short status for the UI (never says "compress") */
  label: string;
  /** Seconds elapsed since processing started */
  elapsedSec?: number;
};

export type ProcessMediaOptions = {
  onProgress?: (progress: ProcessMediaProgress) => void;
};

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

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

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(0, i) : name;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
}

export function needsVideoProcessing(file: File): boolean {
  return isVideoFile(file) && file.size > PROCESS_VIDEO_ABOVE_BYTES;
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
  // ultrafast + capped fps: browser WASM is ~10–50× slower than native ffmpeg
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

/**
 * If the file is a large video, re-encode it down toward ~10–20 MB.
 * Images and small videos are returned unchanged.
 */
export async function prepareMediaForUpload(
  file: File,
  options: ProcessMediaOptions = {},
): Promise<File> {
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

  if (!needsVideoProcessing(file)) {
    report(100, 'Ready');
    return file;
  }

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

  // Two aggressive passes only — prefer finishing in pass 1.
  // Pass 1 owns most of the progress bar (18 → 88) so it visibly moves.
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
    // Prefer media timestamp (µs) — much steadier than ratio early in the encode.
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
        /* output may not exist yet */
      }

      // Pass 1: 18–88, Pass 2: 88–96
      const passBase = i === 0 ? 18 : 88;
      const passWidth = i === 0 ? 70 : 8;

      const tick = setInterval(() => {
        // Soft floor so the bar never looks frozen at ~19% for minutes
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
    return file;
  }

  const outName = `${baseName(file.name) || 'video'}.mp4`;
  const bytes = new Uint8Array(best);
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' });
  report(100, 'Ready');
  return new File([blob], outName, { type: 'video/mp4', lastModified: Date.now() });
}
