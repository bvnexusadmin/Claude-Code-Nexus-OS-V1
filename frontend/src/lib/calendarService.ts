// TODO: Replace with Google Calendar API integration
// This service abstracts all calendar data access behind a single interface.
// Current implementation reads/writes to the internal Supabase bookings table.
//
// To integrate Google Calendar later:
//   1. Replace fetchCalendarEvents() with a call to:
//      GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
//      Map response.items[] to CalendarEvent[]
//   2. Replace createBooking() with:
//      POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
//   3. Replace updateBookingStatus() / updateBookingNotes() with:
//      PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
//   4. Set isGoogleCalendarConnected() to check stored OAuth tokens via /internal/calendar/status
//
// The UI layer (Calendar.tsx) calls only the functions below — no Supabase imports there.

import { supabase } from "./supabase";

// ─── Public types ─────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show" | string;
  source: "ai" | "manual";
  lead_id: string | null;
  service_type: string | null;
  created_by: string | null;
  notes: string | null;
};

export type NewBookingInput = {
  client_id: string;
  lead_id: string | null;
  service_type: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  timezone: string;
  notes?: string;
};

// ─── Data access ──────────────────────────────────────────────────────────────

/** Fetch all bookings within [from, to) for a given client. */
export async function fetchCalendarEvents(
  clientId: string,
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  // TODO: Replace with Google Calendar API integration
  const { data, error } = await supabase
    .from("bookings")
    .select("id, lead_id, service_type, start_time, end_time, status, source, created_by, metadata")
    .eq("client_id", clientId)
    .gte("start_time", from.toISOString())
    .lte("start_time", to.toISOString())
    .order("start_time", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);

  return (data ?? []).map((b: any): CalendarEvent => ({
    id: b.id,
    title: b.service_type ?? "Appointment",
    start: new Date(b.start_time),
    end: b.end_time
      ? new Date(b.end_time)
      : new Date(new Date(b.start_time).getTime() + 60 * 60 * 1000),
    status: b.status ?? "pending",
    source: b.created_by === "ai" ? "ai" : "manual",
    lead_id: b.lead_id ?? null,
    service_type: b.service_type ?? null,
    created_by: b.created_by ?? null,
    notes: b.metadata?.notes ?? null,
  }));
}

/** Create a new pending booking. */
export async function createBooking(input: NewBookingInput): Promise<void> {
  // TODO: Also write to Google Calendar if connected
  const { error } = await supabase.from("bookings").insert({
    client_id: input.client_id,
    lead_id: input.lead_id,
    service_type: input.service_type,
    start_time: input.start_time,
    end_time: input.end_time,
    timezone: input.timezone,
    source: "ui",
    created_by: "human",
    status: "pending",
    metadata: input.notes ? { notes: input.notes } : {},
  });
  if (error) throw new Error(error.message);
}

/** Update the status of an existing booking. */
export async function updateBookingStatus(
  bookingId: string,
  status: string
): Promise<void> {
  // TODO: Also update Google Calendar event status if connected
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
}

/** Save notes for an existing booking (stored in metadata.notes). */
export async function updateBookingNotes(
  bookingId: string,
  notes: string,
  existingMetadata: Record<string, any> = {}
): Promise<void> {
  // TODO: Also update Google Calendar event description if connected
  const { error } = await supabase
    .from("bookings")
    .update({ metadata: { ...existingMetadata, notes } })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
}

/** Returns true when a Google Calendar OAuth connection is active for this client. */
export function isGoogleCalendarConnected(): boolean {
  // TODO: Check if Google Calendar OAuth tokens are present for this client
  // When integrated: call GET /internal/calendar/status and check response.connected
  return false;
}
