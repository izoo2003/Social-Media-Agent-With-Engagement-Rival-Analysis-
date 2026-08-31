/** Asia/Karachi calendar helpers for KPI Creation, Reports, and Guidelines. */

export type KpiGranularity = 'daily' | 'weekly' | 'monthly';

export function pktTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfPktWeek(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysISO(today, mondayOffset);
}

export function startOfPktMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export function formatKpiDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function periodKey(iso: string, granularity: KpiGranularity): string {
  if (granularity === 'monthly') return iso.slice(0, 7);
  if (granularity === 'weekly') return startOfPktWeek(iso);
  return iso;
}

export function formatKpiPeriod(key: string, granularity: KpiGranularity): string {
  if (granularity === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  if (granularity === 'weekly') {
    const start = key.length === 10 ? key : startOfPktWeek(key);
    return `${formatKpiDay(start)} – ${formatKpiDay(addDaysISO(start, 6))}`;
  }
  return formatKpiDay(key);
}
