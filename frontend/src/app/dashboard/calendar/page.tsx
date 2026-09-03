'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { API_ENDPOINTS, fetchWithTimeout } from '@/lib/api-client';
import { CalendarEvent, CustomHoliday } from '@/lib/types';
import ScheduleModal from '@/components/calendar/ScheduleModal';
import EventDetailModal from '@/components/calendar/EventDetailModal';
import HolidayReminderModal from '@/components/calendar/HolidayReminderModal';
import HolidayFormModal from '@/components/calendar/HolidayFormModal';
import {
  customHolidayToCalendar,
  dismissHolidayReminder,
  getPakistanHolidaysInRange,
  holidaysByDateMap,
  isHolidayReminderDismissed,
  remindersFromHolidays,
  type CalendarHoliday,
} from '@/lib/pakistan-holidays';

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼',
  facebook: '👍',
  instagram: '📷',
  youtube: '▶️',
  twitter: '𝕏',
  tiktok: '🎵',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  publishing: 'bg-blue-500',
  published: 'bg-green-500',
  partial: 'bg-orange-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
};

const STATUS_CHIP: Record<string, string> = {
  pending: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300',
  publishing: 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-300',
  published: 'bg-green-50 border-green-300 text-green-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300',
  partial: 'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-950/40 dark:border-orange-700 dark:text-orange-300',
  failed: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300',
  cancelled: 'bg-gray-50 border-gray-300 text-gray-500 line-through dark:bg-slate-800 dark:border-slate-600 dark:text-slate-500',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayCellClass(hasPk: boolean, hasCustom: boolean, inMonth: boolean): string {
  if (hasPk) {
    return inMonth
      ? 'bg-emerald-50/80 border-emerald-200 hover:border-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800'
      : 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900';
  }
  if (hasCustom) {
    return inMonth
      ? 'bg-indigo-50/80 border-indigo-200 hover:border-indigo-400 dark:bg-indigo-950/30 dark:border-indigo-800'
      : 'bg-indigo-50/40 border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900';
  }
  return inMonth
    ? 'bg-white border-gray-200 hover:border-brand-300 dark:bg-slate-800 dark:border-slate-600 dark:hover:border-gold-500/50'
    : 'bg-gray-50 border-gray-100 dark:bg-slate-900/50 dark:border-slate-700';
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [customHolidays, setCustomHolidays] = useState<CustomHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [presetDate, setPresetDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [reminderHoliday, setReminderHoliday] = useState<
    (CalendarHoliday & { daysUntil: number }) | null
  >(null);

  const [holidayFormOpen, setHolidayFormOpen] = useState(false);
  const [editHoliday, setEditHoliday] = useState<CustomHoliday | null>(null);
  const [holidayPresetDate, setHolidayPresetDate] = useState<string | null>(null);

  // Grid covers full weeks around the current month
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(cursor)),
    [cursor]
  );
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(cursor)), [cursor]);
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  );

  const holidaysInView = useMemo(() => {
    const pk = getPakistanHolidaysInRange(gridStart, gridEnd);
    const startKey = format(gridStart, 'yyyy-MM-dd');
    const endKey = format(gridEnd, 'yyyy-MM-dd');
    const custom = customHolidays
      .map(customHolidayToCalendar)
      .filter((h) => h.date >= startKey && h.date <= endKey);
    return [...pk, ...custom];
  }, [gridStart, gridEnd, customHolidays]);

  const holidaysByDay = useMemo(
    () => holidaysByDateMap(holidaysInView),
    [holidaysInView]
  );

  const upcomingHolidays = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 20);
    const startKey = format(today, 'yyyy-MM-dd');
    const endKey = format(end, 'yyyy-MM-dd');
    const pk = getPakistanHolidaysInRange(today, end);
    const custom = customHolidays
      .map(customHolidayToCalendar)
      .filter((h) => h.date >= startKey && h.date <= endKey);
    return [...pk, ...custom].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [customHolidays]);

  const reminderPool = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return [
      ...getPakistanHolidaysInRange(today, end),
      ...customHolidays.map(customHolidayToCalendar),
    ];
  }, [customHolidays]);

  const fetchEvents = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: gridStart.toISOString(),
        end_date: gridEnd.toISOString(),
        limit: '500',
      });
      const res = await fetchWithTimeout(`${API_ENDPOINTS.CALENDAR_EVENTS}?${params.toString()}`);
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        setEvents(data);
        setDetailEvent((current) => {
          if (!current) return current;
          return data.find((ev) => ev.id === current.id) ?? null;
        });
      } else if (!options?.background) {
        setEvents([]);
      }
    } catch {
      if (!options?.background) setEvents([]);
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, [gridStart, gridEnd]);

  const fetchCustomHolidays = useCallback(async () => {
    const today = new Date();
    const upcomingEnd = new Date(today);
    upcomingEnd.setDate(upcomingEnd.getDate() + 20);
    const from = format(gridStart < today ? gridStart : today, 'yyyy-MM-dd');
    const to = format(gridEnd > upcomingEnd ? gridEnd : upcomingEnd, 'yyyy-MM-dd');
    try {
      const res = await fetchWithTimeout(
        `${API_ENDPOINTS.CALENDAR_HOLIDAYS}?from=${from}&to=${to}`,
      );
      if (res.ok) {
        const data: CustomHoliday[] = await res.json();
        setCustomHolidays(data);
      }
    } catch {
      // keep last good list
    }
  }, [gridStart, gridEnd]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchCustomHolidays();
  }, [fetchCustomHolidays]);

  useEffect(() => {
    const upcoming = remindersFromHolidays(reminderPool, 7);
    const next = upcoming.find((h) => !isHolidayReminderDismissed(h.id));
    setReminderHoliday(next || null);
  }, [reminderPool]);

  // Refresh while events are pending/publishing; back off when idle (less load in dev)
  useEffect(() => {
    const hasActive = events.some((e) => ['pending', 'publishing'].includes(e.status));
    const ms = hasActive ? 45000 : 180000;
    const id = setInterval(() => fetchEvents({ background: true }), ms);
    return () => clearInterval(id);
  }, [fetchEvents, events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.scheduled_date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
      );
    }
    return map;
  }, [events]);

  const upcoming = useMemo(
    () =>
      [...events]
        .filter((e) => ['pending', 'publishing'].includes(e.status))
        .sort(
          (a, b) =>
            new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        )
        .slice(0, 8),
    [events]
  );

  const openNewSchedule = (date?: Date) => {
    setEditEvent(null);
    setPresetDate(date ?? null);
    setScheduleOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setDetailEvent(null);
    setEditEvent(event);
    setPresetDate(null);
    setScheduleOpen(true);
  };

  const openAddHoliday = (dateKey?: string) => {
    setEditHoliday(null);
    setHolidayPresetDate(dateKey ?? null);
    setHolidayFormOpen(true);
  };

  const openEditHoliday = (holiday: CustomHoliday) => {
    setEditHoliday(holiday);
    setHolidayPresetDate(null);
    setHolidayFormOpen(true);
  };

  const deleteCustomHoliday = async (holiday: CustomHoliday) => {
    if (!window.confirm('Delete this holiday? It will disappear for everyone.')) return;
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CALENDAR_HOLIDAY(holiday.id), {
        method: 'DELETE',
      });
      if (res.ok) fetchCustomHolidays();
    } catch {
      // ignore
    }
  };

  const handleScheduled = () => {
    fetchEvents();
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Schedule posts in advance — they publish automatically. Pakistan holidays
            and your own dates are marked so designers can plan special creatives.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openAddHoliday()}
            className="border border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 font-semibold px-4 sm:px-5 py-2.5 rounded-lg text-sm sm:text-base dark:border-indigo-700 dark:text-indigo-200 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70"
          >
            + Add holiday
          </button>
          <button
            onClick={() => openNewSchedule()}
            className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-4 sm:px-5 py-2.5 rounded-lg shadow-sm text-sm sm:text-base"
          >
            + Schedule a Post
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-2 sm:p-4 overflow-x-auto dark:bg-slate-800 dark:border dark:border-slate-700">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <button
              onClick={() => setCursor((c) => subMonths(c, 1))}
              className="px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-medium text-sm shrink-0"
            >
              ‹ Prev
            </button>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-slate-900 truncate">
                {format(cursor, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => setCursor(new Date())}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 shrink-0"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-medium text-sm shrink-0"
            >
              Next ›
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 min-w-[280px]">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] sm:text-xs font-semibold text-gray-400 uppercase py-1"
              >
                <span className="sm:hidden">{d.charAt(0)}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 min-w-[280px]">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) || [];
              const dayHolidays = holidaysByDay.get(key) || [];
              const hasPk = dayHolidays.some((h) => h.kind !== 'custom');
              const hasCustom = dayHolidays.some((h) => h.kind === 'custom');
              const inMonth = isSameMonth(day, cursor);
              const holidaySlots = Math.min(dayHolidays.length, 2);
              const eventSlots = holidaySlots ? Math.max(1, 3 - holidaySlots) : 3;
              return (
                <div
                  key={key}
                  onClick={() => openNewSchedule(day)}
                  className={`min-h-[56px] sm:min-h-[96px] rounded-md sm:rounded-lg border p-1 sm:p-1.5 cursor-pointer transition-colors ${dayCellClass(hasPk, hasCustom, inMonth)}`}
                >
                  <div className="flex items-center justify-between mb-1 gap-0.5">
                    <span
                      className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday(day)
                          ? 'bg-brand-700 text-white'
                          : inMonth
                          ? 'text-gray-700'
                          : 'text-gray-400'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {hasPk && (
                        <span
                          className="text-[9px] font-bold uppercase text-emerald-800 dark:text-emerald-300"
                          title={dayHolidays.filter((h) => h.kind !== 'custom').map((h) => h.name).join(', ')}
                        >
                          PK
                        </span>
                      )}
                      {hasCustom && (
                        <span
                          className="text-[9px] font-bold uppercase text-indigo-800 dark:text-indigo-300"
                          title={dayHolidays.filter((h) => h.kind === 'custom').map((h) => h.name).join(', ')}
                        >
                          Yours
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {dayHolidays.slice(0, holidaySlots).map((h) => {
                      const isCustom = h.kind === 'custom';
                      return (
                        <div
                          key={h.id}
                          role={isCustom ? 'button' : undefined}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                            isCustom
                              ? 'bg-indigo-100 text-indigo-900 border border-indigo-200 cursor-pointer hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:border-indigo-700'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                          }`}
                          title={isCustom ? `${h.name} — click to edit` : `${h.name} — ${h.tip}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isCustom || !h.customId) return;
                            const raw = customHolidays.find((c) => c.id === h.customId);
                            if (raw) openEditHoliday(raw);
                          }}
                        >
                          {h.name}
                        </div>
                      );
                    })}
                    {dayEvents.slice(0, eventSlots).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailEvent(ev);
                        }}
                        className={`w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded border truncate flex items-center gap-1 ${
                          STATUS_CHIP[ev.status] || 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}
                        title={ev.content_title || ''}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[ev.status] || 'bg-gray-400'}`} />
                        {ev.needs_media && (
                          <span className="shrink-0 text-[9px] font-bold uppercase text-rose-700">
                            media
                          </span>
                        )}
                        <span className="shrink-0">
                          {format(new Date(ev.scheduled_date), 'HH:mm')}
                        </span>
                        <span className="shrink-0">
                          {ev.platforms.slice(0, 3).map((p) => PLATFORM_ICONS[p] || '').join('')}
                        </span>
                        <span className="truncate">{ev.content_title}</span>
                      </button>
                    ))}
                    {dayEvents.length > eventSlots && (
                      <p className="text-[10px] text-gray-400 pl-1">
                        +{dayEvents.length - eventSlots} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-900">Upcoming holidays</h3>
              <button
                type="button"
                onClick={() => openAddHoliday()}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-300"
              >
                + Add
              </button>
            </div>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-gray-400">No holidays in the next 20 days.</p>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => {
                  const isCustom = h.kind === 'custom';
                  return (
                    <div
                      key={h.id}
                      className={`p-2.5 rounded-lg border ${
                        isCustom
                          ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-800 dark:bg-indigo-950/30'
                          : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
                      }`}
                    >
                      <p
                        className={`text-xs font-bold ${
                          isCustom
                            ? 'text-indigo-900 dark:text-indigo-200'
                            : 'text-emerald-900 dark:text-emerald-200'
                        }`}
                      >
                        {h.name}
                      </p>
                      <p
                        className={`text-[11px] mt-0.5 ${
                          isCustom
                            ? 'text-indigo-800/80 dark:text-indigo-300/80'
                            : 'text-emerald-800/80 dark:text-emerald-300/80'
                        }`}
                      >
                        {format(new Date(h.date + 'T00:00:00'), 'EEE, d MMM yyyy')}
                      </p>
                      {isCustom && h.customId && (
                        <div className="flex gap-2 mt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const raw = customHolidays.find((c) => c.id === h.customId);
                              if (raw) openEditHoliday(raw);
                            }}
                            className="text-[11px] font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const raw = customHolidays.find((c) => c.id === h.customId);
                              if (raw) deleteCustomHoliday(raw);
                            }}
                            className="text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Upcoming</h3>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming scheduled posts.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setDetailEvent(ev)}
                    className="w-full text-left p-2.5 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[ev.status]}`} />
                      <span className="text-xs font-semibold text-gray-700">
                        {format(new Date(ev.scheduled_date), 'MMM d, HH:mm')}
                      </span>
                      {ev.needs_media && (
                        <span className="text-[10px] font-bold uppercase text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded">
                          Needs media
                        </span>
                      )}
                      <span className="ml-auto text-sm">
                        {ev.platforms.map((p) => PLATFORM_ICONS[p] || '').join('')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">{ev.content_title}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Status</h3>
            <div className="space-y-1.5">
              {Object.entries(STATUS_DOT).map(([status, dot]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                  <span className="text-xs text-gray-600 capitalize">{status}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-gray-600">Pakistan holiday</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-xs text-gray-600">Custom holiday</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onScheduled={handleScheduled}
        initialDate={presetDate}
        editEvent={editEvent}
      />

      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onChanged={fetchEvents}
        onEdit={openEdit}
      />

      <HolidayFormModal
        open={holidayFormOpen}
        onClose={() => {
          setHolidayFormOpen(false);
          setEditHoliday(null);
          setHolidayPresetDate(null);
        }}
        onSaved={fetchCustomHolidays}
        editHoliday={editHoliday}
        presetDate={holidayPresetDate}
      />

      <HolidayReminderModal
        holiday={reminderHoliday}
        onDismiss={() => {
          if (reminderHoliday) dismissHolidayReminder(reminderHoliday.id);
          const upcomingReminders = remindersFromHolidays(reminderPool, 7);
          const next = upcomingReminders.find(
            (h) =>
              h.id !== reminderHoliday?.id && !isHolidayReminderDismissed(h.id)
          );
          setReminderHoliday(next || null);
        }}
        onRemindLater={() => setReminderHoliday(null)}
      />
    </div>
  );
}
