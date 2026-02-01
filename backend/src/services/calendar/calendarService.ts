// src/services/calendar/calendarService.ts
// Google Calendar WRITE service
// - Creates / deletes calendar events
// - Uses stored OAuth tokens
// - NO Supabase mutations here

import { google } from "googleapis";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

type BookingRow = {
  id: string;
  client_id: string;
  service_type: string;
  start_time: string;
  end_time: string;
  timezone: string;
};

function getOAuthClient(tokens: {
  access_token: string;
  refresh_token: string;
}) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  );

  client.setCredentials(tokens);
  return client;
}

async function getClientGoogleTokens(client_id: string) {
  const { data, error } = await supabaseAdmin
    .from("client_integrations")
    .select(
      "google_access_token, google_refresh_token, google_calendar_id"
    )
    .eq("client_id", client_id)
    .eq("provider", "google_calendar")
    .single();

  if (error || !data?.google_refresh_token) {
    throw new Error("Google Calendar not connected for client");
  }

  return {
    access_token: data.google_access_token,
    refresh_token: data.google_refresh_token,
    calendar_id: data.google_calendar_id || "primary",
  };
}

export const calendarService = {
  async createEvent(booking: BookingRow): Promise<string> {
    const tokens = await getClientGoogleTokens(booking.client_id);
    const auth = getOAuthClient(tokens);

    const calendar = google.calendar({ version: "v3", auth });

    const res = await calendar.events.insert({
      calendarId: tokens.calendar_id,
      requestBody: {
        summary: booking.service_type,
        description: `Booking ID: ${booking.id}`,
        start: {
          dateTime: booking.start_time,
          timeZone: booking.timezone,
        },
        end: {
          dateTime: booking.end_time,
          timeZone: booking.timezone,
        },
      },
    });

    if (!res.data.id) {
      throw new Error("Failed to create Google Calendar event");
    }

    return res.data.id;
  },

  async deleteEvent(eventId: string) {
    if (!eventId) return;

    // We need ANY valid auth — fetch by event lookup
    const { data } = await supabaseAdmin
      .from("bookings")
      .select("client_id")
      .eq("calendar_event_id", eventId)
      .single();

    if (!data?.client_id) return;

    const tokens = await getClientGoogleTokens(data.client_id);
    const auth = getOAuthClient(tokens);

    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.delete({
      calendarId: tokens.calendar_id,
      eventId,
    });
  },
};
