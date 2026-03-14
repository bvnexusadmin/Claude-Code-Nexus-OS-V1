import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "../lib/tenant";
import { supabase } from "../lib/supabase";
import {
  CalendarEvent,
  fetchCalendarEvents,
  createBooking,
  updateBookingStatus,
  updateBookingNotes,
  isGoogleCalendarConnected,
} from "../lib/calendarService";

// ─── Types ───────────────────────────────────────────────────────────────────

type View = "month" | "week" | "day" | "agenda";

type LeadOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string | null;
};

// ─── Date utilities ───────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateTimeRange(start: Date, end: Date): string {
  const date = start.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return `${date} · ${formatTime(start)} – ${formatTime(end)}`;
}

/** Returns 6 weeks × 7 days grid, starting Sunday. */
function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  gridStart.setHours(0, 0, 0, 0);

  const weeks: Date[][] = [];
  const cur = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Returns 7 days starting from the Sunday of the given date's week. */
function getWeekDays(d: Date): Date[] {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getViewRange(view: View, viewDate: Date): { from: Date; to: Date } {
  switch (view) {
    case "month": {
      const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const gridStart = new Date(firstDay);
      gridStart.setDate(gridStart.getDate() - gridStart.getDay());
      const gridEnd = addDays(gridStart, 42);
      return { from: gridStart, to: gridEnd };
    }
    case "week": {
      const days = getWeekDays(viewDate);
      return { from: days[0], to: addDays(days[6], 1) };
    }
    case "day": {
      const s = startOfDay(viewDate);
      return { from: s, to: addDays(s, 1) };
    }
    case "agenda": {
      const s = startOfDay(new Date());
      return { from: s, to: addDays(s, 30) };
    }
  }
}

function navigateDate(view: View, viewDate: Date, dir: -1 | 1): Date {
  const d = new Date(viewDate);
  switch (view) {
    case "month": d.setMonth(d.getMonth() + dir); break;
    case "week":  d.setDate(d.getDate() + dir * 7); break;
    case "day":   d.setDate(d.getDate() + dir); break;
    case "agenda":d.setDate(d.getDate() + dir * 30); break;
  }
  return d;
}

function getDateLabel(view: View, viewDate: Date): string {
  switch (view) {
    case "month": return formatMonthYear(viewDate);
    case "week": {
      const days = getWeekDays(viewDate);
      return `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;
    }
    case "day": return formatFullDate(viewDate);
    case "agenda": return "Next 30 Days";
  }
}

// ─── Event styling ────────────────────────────────────────────────────────────

function eventBg(ev: CalendarEvent): string {
  if (ev.status === "cancelled" || ev.status === "no_show")
    return "rgba(74,90,107,0.55)";
  if (ev.source === "ai") return "rgba(99,102,241,0.82)";
  return "rgba(14,165,233,0.82)";
}

function eventColor(ev: CalendarEvent): string {
  if (ev.status === "cancelled" || ev.status === "no_show") return "#8899aa";
  return "#ffffff";
}

function statusBadge(status: string): { bg: string; color: string; label: string } {
  switch (status.toLowerCase()) {
    case "confirmed":  return { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Confirmed" };
    case "pending":    return { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Pending" };
    case "completed":  return { bg: "rgba(99,102,241,0.15)", color: "#818cf8", label: "Completed" };
    case "cancelled":  return { bg: "rgba(239,68,68,0.12)", color: "#ef4444", label: "Cancelled" };
    case "no_show":    return { bg: "rgba(136,153,170,0.12)", color: "#8899aa", label: "No Show" };
    default:           return { bg: "rgba(136,153,170,0.12)", color: "#8899aa", label: status };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EventPill({
  ev,
  onClick,
}: {
  ev: CalendarEvent;
  onClick: (ev: CalendarEvent) => void;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      title={`${formatTime(ev.start)} ${ev.title}`}
      style={{
        background: eventBg(ev),
        color: eventColor(ev),
        borderRadius: "4px",
        padding: "1px 6px",
        fontSize: "11px",
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: "pointer",
        marginBottom: "2px",
        lineHeight: "18px",
        textDecoration: ev.status === "cancelled" ? "line-through" : "none",
      }}
    >
      {formatTime(ev.start)} {ev.title}
    </div>
  );
}

// Month view
function MonthView({
  viewDate,
  events,
  onSelectEvent,
  onSelectDay,
}: {
  viewDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
  onSelectDay: (d: Date) => void;
}) {
  const weeks = useMemo(
    () => getMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = startOfDay(ev.start).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const curMonth = viewDate.getMonth();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* DOW header */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        flexShrink: 0, borderBottom: "1px solid #1e2d40",
      }}>
        {DOW.map((d) => (
          <div key={d} style={{
            padding: "8px 0", textAlign: "center",
            fontSize: "11px", fontWeight: 600,
            color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{
            flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: wi < weeks.length - 1 ? "1px solid #1e2d40" : "none",
            minHeight: 0,
          }}>
            {week.map((day, di) => {
              const dayEvs = eventsByDay.get(day.toDateString()) ?? [];
              const isOtherMonth = day.getMonth() !== curMonth;
              const today = isToday(day);
              const MAX_VISIBLE = 3;
              const visible = dayEvs.slice(0, MAX_VISIBLE);
              const overflow = dayEvs.length - MAX_VISIBLE;

              return (
                <div
                  key={di}
                  onClick={() => onSelectDay(day)}
                  style={{
                    borderRight: di < 6 ? "1px solid #1e2d40" : "none",
                    padding: "6px 6px 4px 6px",
                    background: today
                      ? "rgba(14,165,233,0.06)"
                      : di === 0 || di === 6
                      ? "rgba(0,0,0,0.18)"
                      : "transparent",
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "flex", flexDirection: "column",
                    outline: today ? "1px solid rgba(14,165,233,0.35)" : "none",
                    outlineOffset: "-1px",
                  }}
                >
                  <div style={{
                    fontSize: "12px", fontWeight: today ? 700 : 400,
                    color: today ? "#0ea5e9" : isOtherMonth ? "#4a5a6b" : "#f0f4f8",
                    textAlign: "right",
                    marginBottom: "4px",
                    flexShrink: 0,
                  }}>
                    {today ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: "22px", height: "22px", borderRadius: "50%",
                        background: "#0ea5e9", color: "#fff", fontSize: "12px", fontWeight: 700,
                      }}>
                        {day.getDate()}
                      </span>
                    ) : day.getDate()}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                    {visible.map((ev) => (
                      <EventPill key={ev.id} ev={ev} onClick={onSelectEvent} />
                    ))}
                    {overflow > 0 && (
                      <div style={{ fontSize: "10px", color: "#8899aa", paddingLeft: "2px" }}>
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Week view
function WeekView({
  viewDate,
  events,
  onSelectEvent,
}: {
  viewDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
}) {
  const days = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = startOfDay(ev.start).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        flexShrink: 0, borderBottom: "1px solid #1e2d40",
      }}>
        {days.map((d, i) => {
          const today = isToday(d);
          return (
            <div key={i} style={{
              padding: "10px 8px", textAlign: "center",
              borderRight: i < 6 ? "1px solid #1e2d40" : "none",
              background: today ? "rgba(14,165,233,0.06)" : "transparent",
            }}>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {DOW[d.getDay()]}
              </div>
              <div style={{
                fontSize: "18px", fontWeight: today ? 700 : 400,
                color: today ? "#0ea5e9" : "#f0f4f8", marginTop: "2px",
              }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        overflowY: "auto",
      }}>
        {days.map((d, i) => {
          const dayEvs = eventsByDay.get(d.toDateString()) ?? [];
          return (
            <div key={i} style={{
              borderRight: i < 6 ? "1px solid #1e2d40" : "none",
              padding: "8px 6px",
              background: isToday(d) ? "rgba(14,165,233,0.03)" : "transparent",
            }}>
              {dayEvs.length === 0 && (
                <div style={{ fontSize: "11px", color: "#4a5a6b", textAlign: "center", paddingTop: "12px" }}>—</div>
              )}
              {dayEvs.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvent(ev)}
                  style={{
                    background: eventBg(ev),
                    color: eventColor(ev),
                    borderRadius: "6px",
                    padding: "6px 8px",
                    marginBottom: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "2px" }}>{formatTime(ev.start)}</div>
                  <div style={{
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    textDecoration: ev.status === "cancelled" ? "line-through" : "none",
                  }}>
                    {ev.title}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Day view
function DayView({
  viewDate,
  events,
  onSelectEvent,
}: {
  viewDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
}) {
  const dayEvs = useMemo(
    () => events.filter((ev) => isSameDay(ev.start, viewDate))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events, viewDate]
  );

  return (
    <div style={{ padding: "32px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {dayEvs.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center", marginTop: "80px" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4a5a6b" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8" }}>No bookings on this day</div>
          <div style={{ fontSize: "13px", color: "#8899aa" }}>Click + New Booking to schedule an appointment</div>
        </div>
      )}
      {dayEvs.map((ev) => {
        const badge = statusBadge(ev.status);
        return (
          <div
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            style={{
              display: "flex", gap: "16px", alignItems: "flex-start",
              padding: "14px 16px", borderRadius: "10px", marginBottom: "10px",
              background: "#111827", border: "1px solid #1e2d40",
              cursor: "pointer", borderLeft: `4px solid ${eventBg(ev)}`,
            }}
          >
            <div style={{ width: "70px", flexShrink: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#0ea5e9" }}>{formatTime(ev.start)}</div>
              <div style={{ fontSize: "11px", color: "#4a5a6b", marginTop: "2px" }}>{formatTime(ev.end)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "#f0f4f8" }}>{ev.title}</div>
              {ev.notes && <div style={{ fontSize: "12px", color: "#8899aa", marginTop: "4px" }}>{ev.notes}</div>}
            </div>
            <span style={{
              padding: "2px 10px", borderRadius: "20px", fontSize: "11px",
              fontWeight: 600, background: badge.bg, color: badge.color, flexShrink: 0,
            }}>
              {badge.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Agenda view
function AgendaView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = startOfDay(ev.start).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      new Date(a).getTime() - new Date(b).getTime()
    );
  }, [events]);

  return (
    <div style={{ padding: "32px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {grouped.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center", marginTop: "80px" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4a5a6b" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8" }}>No upcoming bookings</div>
          <div style={{ fontSize: "13px", color: "#8899aa" }}>No bookings scheduled for the next 30 days</div>
        </div>
      )}
      {grouped.map(([dateKey, dayEvs]) => (
        <div key={dateKey} style={{ marginBottom: "24px" }}>
          <div style={{
            fontSize: "12px", fontWeight: 600, color: "#8899aa",
            textTransform: "uppercase", letterSpacing: "0.06em",
            marginBottom: "8px", paddingBottom: "6px",
            borderBottom: "1px solid #1e2d40",
          }}>
            {isToday(new Date(dateKey)) ? "Today" : formatShortDate(new Date(dateKey))}
            {" · "}
            {new Date(dateKey).toLocaleDateString(undefined, { weekday: "long" })}
          </div>
          {dayEvs.map((ev) => {
            const badge = statusBadge(ev.status);
            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                style={{
                  display: "flex", gap: "14px", alignItems: "center",
                  padding: "10px 14px", borderRadius: "8px", marginBottom: "6px",
                  background: "#111827", border: "1px solid #1e2d40", cursor: "pointer",
                }}
              >
                <div style={{
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: eventBg(ev), flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "#f0f4f8" }}>{ev.title}</span>
                  {ev.notes && <span style={{ fontSize: "12px", color: "#8899aa", marginLeft: "8px" }}>{ev.notes}</span>}
                </div>
                <span style={{ fontSize: "12px", color: "#8899aa", flexShrink: 0 }}>
                  {formatTime(ev.start)}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: "20px", fontSize: "11px",
                  fontWeight: 600, background: badge.bg, color: badge.color, flexShrink: 0,
                }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Booking detail panel
function BookingDetailPanel({
  event,
  leads,
  onClose,
  onStatusChange,
  onNotesSaved,
}: {
  event: CalendarEvent;
  leads: LeadOption[];
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onNotesSaved: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const lead = leads.find((l) => l.id === event.lead_id) ?? null;
  const badge = statusBadge(event.status);
  const isClient = (lead?.status ?? "").toLowerCase() === "converted";

  const doStatus = async (newStatus: string) => {
    setActionLoading(newStatus);
    try {
      await updateBookingStatus(event.id, newStatus);
      onStatusChange(event.id, newStatus);
      setFeedback(`Marked as ${newStatus}.`);
    } catch (e: any) {
      setFeedback(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await updateBookingNotes(event.id, notes);
      onNotesSaved(event.id, notes);
      setFeedback("Notes saved.");
    } catch (e: any) {
      setFeedback(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, height: "100%", width: "380px",
      background: "#111827", borderLeft: "1px solid #1e2d40",
      display: "flex", flexDirection: "column",
      boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
      zIndex: 10, overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "20px 20px 14px 20px", borderBottom: "1px solid #1e2d40", flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f0f4f8", margin: "0 0 8px 0", lineHeight: 1.3 }}>
            {event.title}
          </h2>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px",
              fontWeight: 600, background: badge.bg, color: badge.color,
            }}>
              {badge.label}
            </span>
            <span style={{
              padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600,
              background: event.source === "ai" ? "rgba(99,102,241,0.15)" : "rgba(14,165,233,0.12)",
              color: event.source === "ai" ? "#818cf8" : "#0ea5e9",
            }}>
              {event.source === "ai" ? "Nexus AI" : "Manual"}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", color: "#8899aa",
            cursor: "pointer", fontSize: "18px", padding: "2px 6px", flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
        {/* Date/time */}
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>
            Date & Time
          </div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#0ea5e9" }}>
            {formatDateTimeRange(event.start, event.end)}
          </div>
        </div>

        {/* Client */}
        {lead && (
          <div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>
              Client
            </div>
            <Link
              to={isClient ? `/clients/${lead.id}` : `/leads/${lead.id}`}
              style={{ fontSize: "14px", fontWeight: 600, color: "#0ea5e9" }}
            >
              {(lead.name ?? "").trim() || "Unnamed"}
            </Link>
            {(lead.phone || lead.email) && (
              <div style={{ fontSize: "12px", color: "#8899aa", marginTop: "2px", fontFamily: "monospace" }}>
                {lead.phone ?? lead.email}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "6px" }}>
            Notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes…"
            style={{
              width: "100%", padding: "9px 12px", fontSize: "13px",
              color: "#f0f4f8", background: "#0a0e1a",
              border: "1px solid #1e2d40", borderRadius: "7px",
              outline: "none", resize: "vertical", fontFamily: "inherit",
              lineHeight: 1.5, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
            <button
              onClick={saveNotes}
              disabled={saving}
              style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                color: "#fff", background: saving ? "#1a2235" : "#0ea5e9",
                border: "none", borderRadius: "6px", cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save Notes"}
            </button>
            {feedback && (
              <span style={{ fontSize: "12px", color: "#10b981" }}>{feedback}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "8px" }}>
            Actions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {event.status !== "completed" && event.status !== "cancelled" && (
              <button
                onClick={() => doStatus("completed")}
                disabled={actionLoading === "completed"}
                style={{
                  padding: "10px 14px", fontSize: "13px", fontWeight: 500,
                  color: "#10b981", background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)", borderRadius: "7px",
                  cursor: actionLoading ? "not-allowed" : "pointer", textAlign: "left",
                  opacity: actionLoading === "completed" ? 0.6 : 1,
                }}
              >
                {actionLoading === "completed" ? "Marking…" : "Mark Complete"}
              </button>
            )}
            {event.status !== "confirmed" && event.status !== "cancelled" && event.status !== "completed" && (
              <button
                onClick={() => doStatus("confirmed")}
                disabled={!!actionLoading}
                style={{
                  padding: "10px 14px", fontSize: "13px", fontWeight: 500,
                  color: "#f0f4f8", background: "transparent",
                  border: "1px solid #1e2d40", borderRadius: "7px",
                  cursor: actionLoading ? "not-allowed" : "pointer", textAlign: "left",
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                Confirm Booking
              </button>
            )}
            {event.status !== "cancelled" && (
              <button
                onClick={() => doStatus("cancelled")}
                disabled={!!actionLoading}
                style={{
                  padding: "10px 14px", fontSize: "13px", fontWeight: 500,
                  color: "#ef4444", background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px",
                  cursor: actionLoading ? "not-allowed" : "pointer", textAlign: "left",
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading === "cancelled" ? "Cancelling…" : "Cancel Booking"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// New Booking Modal
function NewBookingModal({
  activeClientId,
  leads,
  defaultDate,
  onClose,
  onCreated,
}: {
  activeClientId: string;
  leads: LeadOption[];
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [date, setDate] = useState(() => defaultDate.toISOString().split("T")[0]);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads.slice(0, 20);
    return leads
      .filter((l) =>
        [(l.name ?? ""), l.phone ?? "", l.email ?? ""].join(" ").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [leads, leadSearch]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;

  const handleSubmit = async () => {
    if (!service.trim()) { setError("Service is required."); return; }
    if (!date) { setError("Date is required."); return; }

    setSubmitting(true);
    setError(null);

    try {
      const startISO = new Date(`${date}T${time}:00`).toISOString();
      const endISO = new Date(
        new Date(`${date}T${time}:00`).getTime() + parseInt(duration) * 60 * 1000
      ).toISOString();

      await createBooking({
        client_id: activeClientId,
        lead_id: selectedLeadId,
        service_type: service.trim(),
        start_time: startISO,
        end_time: endISO,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        notes: notes.trim() || undefined,
      });

      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", fontSize: "13px",
    color: "#f0f4f8", background: "#0a0e1a",
    border: "1px solid #1e2d40", borderRadius: "7px",
    outline: "none", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 600, color: "#8899aa",
    textTransform: "uppercase", letterSpacing: "0.05em",
    display: "block", marginBottom: "6px",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "480px", background: "#111827",
        border: "1px solid #1e2d40", borderRadius: "12px",
        overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderBottom: "1px solid #1e2d40",
        }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f0f4f8" }}>
            New Booking
          </h3>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "#8899aa",
            cursor: "pointer", fontSize: "18px", padding: "2px 6px",
          }}>✕</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Client */}
          <div style={{ position: "relative" }}>
            <label style={labelStyle}>Client (optional)</label>
            {selectedLead ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", background: "#0a0e1a",
                border: "1px solid #1e2d40", borderRadius: "7px",
              }}>
                <span style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: 500 }}>
                  {(selectedLead.name ?? "").trim() || "Unnamed"}
                  {selectedLead.phone && (
                    <span style={{ color: "#8899aa", fontWeight: 400, marginLeft: "8px", fontFamily: "monospace" }}>
                      {selectedLead.phone}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => { setSelectedLeadId(null); setLeadSearch(""); }}
                  style={{ background: "transparent", border: "none", color: "#8899aa", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <input
                  value={leadSearch}
                  onChange={(e) => { setLeadSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by name, phone, or email…"
                  style={inputStyle}
                />
                {showDropdown && filteredLeads.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                    background: "#1a2235", border: "1px solid #1e2d40", borderRadius: "7px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: "200px", overflowY: "auto",
                    marginTop: "4px",
                  }}>
                    {filteredLeads.map((l) => (
                      <div
                        key={l.id}
                        onClick={() => {
                          setSelectedLeadId(l.id);
                          setLeadSearch((l.name ?? "").trim() || l.id.slice(0, 8));
                          setShowDropdown(false);
                        }}
                        style={{
                          padding: "9px 12px", cursor: "pointer", fontSize: "13px",
                          color: "#f0f4f8", borderBottom: "1px solid #1e2d40",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#1e2d40")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ fontWeight: 500 }}>{(l.name ?? "").trim() || "Unnamed"}</span>
                        {l.phone && (
                          <span style={{ color: "#8899aa", marginLeft: "8px", fontFamily: "monospace", fontSize: "12px" }}>
                            {l.phone}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Service */}
          <div>
            <label style={labelStyle}>Service *</label>
            <input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Lawn Mowing, Consultation…"
              style={inputStyle}
            />
          </div>

          {/* Date + Time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={labelStyle}>Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label style={labelStyle}>Time *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label style={labelStyle}>Duration</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional notes…"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <div style={{ fontSize: "12px", color: "#ef4444" }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: "10px",
          padding: "14px 20px", borderTop: "1px solid #1e2d40",
        }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", fontSize: "13px", fontWeight: 500,
            color: "#8899aa", background: "transparent",
            border: "1px solid #1e2d40", borderRadius: "7px", cursor: "pointer",
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "9px 20px", fontSize: "13px", fontWeight: 600,
              color: "#fff", background: submitting ? "#1a2235" : "#0ea5e9",
              border: "none", borderRadius: "7px",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Creating…" : "Create Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar component ──────────────────────────────────────────────────

const Calendar: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();

  const [view, setView] = useState<View>("month");
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [newBookingDefaultDate, setNewBookingDefaultDate] = useState<Date>(new Date());
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const googleConnected = isGoogleCalendarConnected();

  // Load leads once
  useEffect(() => {
    if (loadingMe || !activeClientId) return;
    supabase
      .from("leads")
      .select("id, name, phone, email, status")
      .eq("client_id", activeClientId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setLeads((data as LeadOption[]) ?? []));
  }, [activeClientId, loadingMe]);

  // Load events when view or viewDate changes
  const loadEvents = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getViewRange(view, viewDate);
      const evs = await fetchCalendarEvents(activeClientId, from, to);
      setEvents(evs);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e.message ?? "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [activeClientId, view, viewDate]);

  useEffect(() => {
    if (loadingMe) return;
    loadEvents();
  }, [loadEvents, loadingMe]);

  const handlePrev = () => setViewDate((d) => navigateDate(view, d, -1));
  const handleNext = () => setViewDate((d) => navigateDate(view, d, 1));
  const handleToday = () => setViewDate(new Date());

  const handleSelectDay = (d: Date) => {
    if (view === "month") {
      setViewDate(d);
      setView("day");
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, status } : ev)));
    if (selectedEvent?.id === id) setSelectedEvent((ev) => ev ? { ...ev, status } : ev);
  };

  const handleNotesSaved = (id: string, notes: string) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, notes } : ev)));
    if (selectedEvent?.id === id) setSelectedEvent((ev) => ev ? { ...ev, notes } : ev);
  };

  const openNewBooking = (defaultDate?: Date) => {
    setNewBookingDefaultDate(defaultDate ?? viewDate);
    setShowNewBooking(true);
  };

  const viewButtonStyle = (v: View): React.CSSProperties => ({
    padding: "6px 14px", fontSize: "13px", fontWeight: 500,
    border: "none", borderRadius: "6px", cursor: "pointer",
    background: view === v ? "#0ea5e9" : "#1a2235",
    color: view === v ? "#fff" : "#8899aa",
  });

  const navBtnStyle: React.CSSProperties = {
    padding: "6px 12px", fontSize: "13px", fontWeight: 500,
    color: "#8899aa", background: "#1a2235",
    border: "1px solid #1e2d40", borderRadius: "6px", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: "14px 24px 10px 24px",
        borderBottom: "1px solid #1e2d40", background: "#111827",
      }}>
        {/* Row 1: title | view toggle | sync + new booking */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f4f8", margin: 0, flexShrink: 0 }}>
            Calendar
          </h2>

          {/* View toggle */}
          <div style={{ display: "flex", gap: "4px", background: "#0a0e1a", padding: "3px", borderRadius: "8px" }}>
            {(["month", "week", "day", "agenda"] as View[]).map((v) => (
              <button key={v} style={viewButtonStyle(v)} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Right: sync status + new booking */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            {googleConnected ? (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                fontSize: "12px", fontWeight: 500, color: "#10b981",
                background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                padding: "4px 10px", borderRadius: "20px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                Synced {lastSync ? formatTime(lastSync) : ""}
              </span>
            ) : (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                fontSize: "12px", fontWeight: 500, color: "#f59e0b",
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
                padding: "4px 10px", borderRadius: "20px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                Internal Only
              </span>
            )}
            <button
              onClick={() => openNewBooking()}
              style={{
                padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                color: "#fff", background: "#0ea5e9", border: "none",
                borderRadius: "7px", cursor: "pointer",
              }}
            >
              + New Booking
            </button>
          </div>
        </div>

        {/* Row 2: navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button style={navBtnStyle} onClick={handlePrev}>←</button>
          <button style={{ ...navBtnStyle, color: "#f0f4f8" }} onClick={handleToday}>Today</button>
          <button style={navBtnStyle} onClick={handleNext}>→</button>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8", marginLeft: "6px" }}>
            {getDateLabel(view, viewDate)}
          </span>
          {loading && (
            <span style={{
              display: "inline-block", width: "60px", height: "14px", borderRadius: "4px",
              background: "#1a2235", marginLeft: "8px",
              animation: "nexusSkeleton 1.5s ease-in-out infinite",
            }} />
          )}
          {error && <span style={{ fontSize: "12px", color: "#ef4444", marginLeft: "8px" }}>{error}</span>}
        </div>
      </div>

      {/* ── Calendar body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "#111827" }}>
        {view === "month" && (
          <MonthView
            viewDate={viewDate}
            events={events}
            onSelectEvent={setSelectedEvent}
            onSelectDay={handleSelectDay}
          />
        )}
        {view === "week" && (
          <WeekView
            viewDate={viewDate}
            events={events}
            onSelectEvent={setSelectedEvent}
          />
        )}
        {view === "day" && (
          <DayView
            viewDate={viewDate}
            events={events}
            onSelectEvent={setSelectedEvent}
          />
        )}
        {view === "agenda" && (
          <AgendaView
            events={events}
            onSelectEvent={setSelectedEvent}
          />
        )}

        {/* Booking detail panel */}
        {selectedEvent && (
          <BookingDetailPanel
            event={selectedEvent}
            leads={leads}
            onClose={() => setSelectedEvent(null)}
            onStatusChange={handleStatusChange}
            onNotesSaved={handleNotesSaved}
          />
        )}
      </div>

      {/* New Booking Modal */}
      {showNewBooking && activeClientId && (
        <NewBookingModal
          activeClientId={activeClientId}
          leads={leads}
          defaultDate={newBookingDefaultDate}
          onClose={() => setShowNewBooking(false)}
          onCreated={() => {
            setShowNewBooking(false);
            loadEvents();
          }}
        />
      )}
    </div>
  );
};

export default Calendar;
