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
import { API_ENDPOINTS } from '@/lib/api-client';
import { CalendarEvent } from '@/lib/types';
import ScheduleModal from '@/components/calendar/ScheduleModal';
import EventDetailModal from '@/components/calendar/EventDetailModal';

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
  pending: 'bg-amber-50 border-amber-300 text-amber-800',
  publishing: 'bg-blue-50 border-blue-300 text-blue-800',
  published: 'bg-green-50 border-green-300 text-green-800',
  partial: 'bg-orange-50 border-orange-300 text-orange-800',
  failed: 'bg-red-50 border-red-300 text-red-800',
  cancelled: 'bg-gray-50 border-gray-300 text-gray-500 line-through',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [presetDate, setPresetDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

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

  const fetchEvents = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: gridStart.toISOString(),
        end_date: gridEnd.toISOString(),
        limit: '500',
      });
      const res = await fetch(`${API_ENDPOINTS.CALENDAR_EVENTS}?${params.toString()}`);
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        setEvents(data);
      } else if (!options?.background) {
        setEvents([]);
      }
    } catch {
      if (!options?.background) setEvents([]);
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, [gridStart, gridEnd]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Refresh while events are pending/publishing; back off when idle (less load in dev)
  useEffect(() => {
    const hasActive = events.some((e) => ['pending', 'publishing'].includes(e.status));
    const ms = hasActive ? 30000 : 120000;
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

  const handleScheduled = () => {
    fetchEvents();
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Schedule posts in advance — they publish automatically to LinkedIn, Facebook,
            Instagram &amp; YouTube when their time arrives.
          </p>
        </div>
        <button
          onClick={() => openNewSchedule()}
          className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-5 py-2.5 rounded-lg shadow-sm"
        >
          + Schedule a Post
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCursor((c) => subMonths(c, 1))}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-medium"
            >
              ‹ Prev
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">
                {format(cursor, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => setCursor(new Date())}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-medium"
            >
              Next ›
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-gray-400 uppercase py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) || [];
              const inMonth = isSameMonth(day, cursor);
              return (
                <div
                  key={key}
                  onClick={() => openNewSchedule(day)}
                  className={`min-h-[96px] rounded-lg border p-1.5 cursor-pointer transition-colors ${
                    inMonth ? 'bg-white border-gray-200 hover:border-brand-300' : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
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
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((ev) => (
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
                        <span className="shrink-0">
                          {format(new Date(ev.scheduled_date), 'HH:mm')}
                        </span>
                        <span className="shrink-0">
                          {ev.platforms.slice(0, 3).map((p) => PLATFORM_ICONS[p] || '').join('')}
                        </span>
                        <span className="truncate">{ev.content_title}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-gray-400 pl-1">
                        +{dayEvents.length - 3} more
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
    </div>
  );
}
