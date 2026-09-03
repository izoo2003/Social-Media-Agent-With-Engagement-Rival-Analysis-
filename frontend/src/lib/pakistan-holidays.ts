/**
 * Pakistan national & religious holidays for the Content Calendar.
 * Fixed Gregorian dates are generated per year; lunar holidays are listed
 * for nearby years (approximate official Pakistan observances).
 */

export type HolidayKind = 'national' | 'religious' | 'custom';

export type PakistanHoliday = {
  /** Stable id for dismiss storage, e.g. pakistan-day-2026 */
  id: string;
  name: string;
  /** Local calendar day YYYY-MM-DD (Pakistan) */
  date: string;
  kind: HolidayKind;
  tip: string;
  customId?: number;
};

export type CalendarHoliday = PakistanHoliday;

const FIXED: Array<{ month: number; day: number; name: string; tip: string }> = [
  {
    month: 2,
    day: 5,
    name: 'Kashmir Solidarity Day',
    tip: 'Consider a solidarity / awareness post for Kashmir.',
  },
  {
    month: 3,
    day: 23,
    name: 'Pakistan Day',
    tip: 'Plan a patriotic brand post for Pakistan Resolution Day.',
  },
  {
    month: 5,
    day: 1,
    name: 'Labour Day',
    tip: 'A worker appreciation or team culture post fits well.',
  },
  {
    month: 5,
    day: 28,
    name: 'Youm-e-Takbeer',
    tip: 'Optional commemorative / national pride creative.',
  },
  {
    month: 8,
    day: 14,
    name: 'Independence Day',
    tip: 'High-priority festive creative — green & white, Pakistan Day vibes.',
  },
  {
    month: 11,
    day: 9,
    name: 'Iqbal Day',
    tip: 'Literary / heritage post honouring Allama Iqbal.',
  },
  {
    month: 12,
    day: 25,
    name: "Quaid-e-Azam Day / Christmas",
    tip: 'Quaid tribute and/or inclusive Christmas greeting for audiences abroad.',
  },
];

/** Approximate Pakistan public observances for lunar holidays (update yearly as needed). */
const LUNAR_BY_YEAR: Record<
  number,
  Array<{ month: number; day: number; name: string; tip: string }>
> = {
  2025: [
    {
      month: 3,
      day: 31,
      name: 'Eid-ul-Fitr',
      tip: 'Eid greeting post — schedule early; feeds get crowded.',
    },
    {
      month: 6,
      day: 7,
      name: 'Eid-ul-Adha',
      tip: 'Eid-ul-Adha greeting / brand well-wishes post.',
    },
    {
      month: 7,
      day: 5,
      name: 'Ashura',
      tip: 'Respectful commemorative post if on-brand.',
    },
    {
      month: 9,
      day: 5,
      name: 'Eid Milad-un-Nabi',
      tip: 'Spiritual greeting creative for Milad-un-Nabi.',
    },
  ],
  2026: [
    {
      month: 3,
      day: 20,
      name: 'Eid-ul-Fitr',
      tip: 'Eid greeting post — schedule early; feeds get crowded.',
    },
    {
      month: 5,
      day: 27,
      name: 'Eid-ul-Adha',
      tip: 'Eid-ul-Adha greeting / brand well-wishes post.',
    },
    {
      month: 6,
      day: 26,
      name: 'Ashura',
      tip: 'Respectful commemorative post if on-brand.',
    },
    {
      month: 8,
      day: 25,
      name: 'Eid Milad-un-Nabi',
      tip: 'Spiritual greeting creative for Milad-un-Nabi.',
    },
  ],
  2027: [
    {
      month: 3,
      day: 10,
      name: 'Eid-ul-Fitr',
      tip: 'Eid greeting post — schedule early; feeds get crowded.',
    },
    {
      month: 5,
      day: 17,
      name: 'Eid-ul-Adha',
      tip: 'Eid-ul-Adha greeting / brand well-wishes post.',
    },
    {
      month: 6,
      day: 15,
      name: 'Ashura',
      tip: 'Respectful commemorative post if on-brand.',
    },
    {
      month: 8,
      day: 15,
      name: 'Eid Milad-un-Nabi',
      tip: 'Spiritual greeting creative for Milad-un-Nabi.',
    },
  ],
  2028: [
    {
      month: 2,
      day: 27,
      name: 'Eid-ul-Fitr',
      tip: 'Eid greeting post — schedule early; feeds get crowded.',
    },
    {
      month: 5,
      day: 5,
      name: 'Eid-ul-Adha',
      tip: 'Eid-ul-Adha greeting / brand well-wishes post.',
    },
    {
      month: 6,
      day: 3,
      name: 'Ashura',
      tip: 'Respectful commemorative post if on-brand.',
    },
    {
      month: 8,
      day: 3,
      name: 'Eid Milad-un-Nabi',
      tip: 'Spiritual greeting creative for Milad-un-Nabi.',
    },
  ],
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toHoliday(
  year: number,
  month: number,
  day: number,
  name: string,
  tip: string,
  kind: PakistanHoliday['kind'],
): PakistanHoliday {
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return {
    id: `${slug(name)}-${date}`,
    name,
    date,
    kind,
    tip,
  };
}

/** Holidays for a calendar year (fixed + lunar when known). */
export function getPakistanHolidaysForYear(year: number): PakistanHoliday[] {
  const list: PakistanHoliday[] = FIXED.map((h) =>
    toHoliday(year, h.month, h.day, h.name, h.tip, 'national'),
  );
  for (const h of LUNAR_BY_YEAR[year] || []) {
    list.push(toHoliday(year, h.month, h.day, h.name, h.tip, 'religious'));
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays overlapping an inclusive date range (YYYY-MM-DD via Date objects). */
export function getPakistanHolidaysInRange(start: Date, end: Date): PakistanHoliday[] {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startKey = `${startYear}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endKey = `${endYear}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const all: PakistanHoliday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    all.push(...getPakistanHolidaysForYear(y));
  }
  return all.filter((h) => h.date >= startKey && h.date <= endKey);
}

export function holidaysByDateMap(
  holidays: PakistanHoliday[],
): Map<string, PakistanHoliday[]> {
  const map = new Map<string, PakistanHoliday[]>();
  for (const h of holidays) {
    const list = map.get(h.date) || [];
    list.push(h);
    map.set(h.date, list);
  }
  return map;
}

export function customHolidayToCalendar(h: {
  id: number;
  name: string;
  date: string;
  note?: string | null;
}): CalendarHoliday {
  return {
    id: `custom-${h.id}`,
    name: h.name,
    date: h.date.slice(0, 10),
    kind: 'custom',
    tip: h.note?.trim() || 'Plan a special creative for this day.',
    customId: h.id,
  };
}

export function remindersFromHolidays(
  holidays: CalendarHoliday[],
  withinDays = 7,
  today = new Date(),
): Array<CalendarHoliday & { daysUntil: number }> {
  const startKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const end = new Date(today);
  end.setDate(end.getDate() + withinDays);
  const endKey = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

  return holidays
    .filter((h) => h.date >= startKey && h.date <= endKey)
    .map((h) => {
      const [yy, mm, dd] = h.date.split('-').map(Number);
      const holidayDate = new Date(yy, mm - 1, dd);
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysUntil = Math.round(
        (holidayDate.getTime() - todayMid.getTime()) / (24 * 60 * 60 * 1000),
      );
      return { ...h, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function getUpcomingHolidayReminders(
  withinDays = 7,
  today = new Date(),
): Array<PakistanHoliday & { daysUntil: number }> {
  const y = today.getFullYear();
  const pool = [
    ...getPakistanHolidaysForYear(y),
    ...getPakistanHolidaysForYear(y + 1),
  ];
  return remindersFromHolidays(pool, withinDays, today);
}

const DISMISS_PREFIX = 'pk-holiday-reminder:';

export function isHolidayReminderDismissed(holidayId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${holidayId}`) === '1';
  } catch {
    return false;
  }
}

export function dismissHolidayReminder(holidayId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${holidayId}`, '1');
  } catch {
    // ignore quota / private mode
  }
}
