'use client';

interface MediaProcessingBarProps {
  percent: number;
  label?: string;
  compact?: boolean;
  /** Use on dark buttons (white text/bar). */
  onDark?: boolean;
}

/** Progress UI shown while a large video is being processed. */
export default function MediaProcessingBar({
  percent,
  label = 'Processing…',
  compact = false,
  onDark = false,
}: MediaProcessingBarProps) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className={compact ? 'w-full max-w-xs' : 'w-full max-w-sm px-4'}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span
          className={`text-sm font-semibold ${onDark ? 'text-white' : 'text-slate-800'}`}
        >
          {label}
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            onDark ? 'text-white/90' : 'text-slate-700'
          }`}
        >
          {safe}%
        </span>
      </div>
      <div
        className={`h-2.5 w-full overflow-hidden rounded-full ${
          onDark ? 'bg-white/25' : 'bg-slate-200'
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-out ${
            onDark ? 'bg-white' : 'bg-brand-700'
          }`}
          style={{ width: `${safe}%` }}
        />
      </div>
      {!compact && (
        <p
          className={`mt-2 text-xs text-center ${
            onDark ? 'text-white/80' : 'text-slate-500'
          }`}
        >
          Large videos can take a minute or two — hang tight.
        </p>
      )}
    </div>
  );
}
