/**
 * Client-side media processing so large videos fit Railway upload limits.
 * UI should label this as "Processing" — never mention compression to the user.
 *
 * Runs as soon as a large video is selected (Content Posting + Calendar).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/** Target size after processing (~10–20 MB so Railway uploads stay reliable). */
export const SAFE_UPLOAD_BYTES = 18 * 1024 * 1024;

/** Start processing when a video is larger than this. */
export const PROCESS_VIDEO_ABOVE_BYTES = 40 * 1024 * 1024;

const FFMPEG_CORE_BASE =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg();
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
    'veryfast',
    '-crf',
    String(pass.crf),
    '-vf',
    `scale=-2:'min(${pass.scaleHeight},ih)'`,
    '-c:a',
    'aac',
    '-b:a',
    `${pass.audioKbps}k`,
    '-movflags',
    '+faststart',
    '-y',
    outputName,
  ];

  if (durationSec > 1) {
    const audioBits = pass.audioKbps * 1000;
    const totalBits = Math.max(200_000, Math.floor((targetBytes * 8) / durationSec) - audioBits);
    const videoKbps = Math.max(200, Math.floor(totalBits / 1000));
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
 * Call this as soon as the user picks a file (not only on submit).
 */
export async function prepareMediaForUpload(file: File): Promise<File> {
  if (!needsVideoProcessing(file)) {
    return file;
  }

  const ffmpeg = await getFFmpeg();
  const ext = extensionOf(file.name) || '.mp4';
  const inputName = `input${ext === '.mov' ? '.mov' : ext === '.webm' ? '.webm' : '.mp4'}`;
  const outputName = 'output.mp4';
  const durationSec = await readVideoDurationSeconds(file);

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Aggressive passes aimed at landing under SAFE_UPLOAD_BYTES (~18 MB).
  const passes: EncodePass[] = [
    { scaleHeight: 720, crf: 30, audioKbps: 96 },
    { scaleHeight: 720, crf: 32, audioKbps: 96 },
    { scaleHeight: 540, crf: 34, audioKbps: 64 },
    { scaleHeight: 480, crf: 36, audioKbps: 64 },
    { scaleHeight: 360, crf: 38, audioKbps: 48 },
  ];

  let best: Uint8Array | null = null;

  try {
    for (const pass of passes) {
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* output may not exist yet */
      }

      const data = await encodePass(
        ffmpeg,
        inputName,
        outputName,
        pass,
        durationSec,
        SAFE_UPLOAD_BYTES,
      );
      best = data;
      if (data.byteLength <= SAFE_UPLOAD_BYTES) {
        break;
      }
    }
  } finally {
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

  if (best.byteLength >= file.size) {
    return file;
  }

  const outName = `${baseName(file.name) || 'video'}.mp4`;
  const bytes = new Uint8Array(best);
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' });
  return new File([blob], outName, { type: 'video/mp4', lastModified: Date.now() });
}
