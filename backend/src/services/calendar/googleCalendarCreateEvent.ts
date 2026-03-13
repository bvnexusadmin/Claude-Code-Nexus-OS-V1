// src/services/calendar/googleCalendarCreateEvent.ts
// Google Calendar Event Creation (WRITE)
// - Creates an event on a user's calendar
// - Uses OAuth access_token (caller is responsible for ensuring token is valid)
// - No DB writes in this file (pure external side-effect only)

import { google } from "googleapis";

export type CreateCalendarEventInput = {
  accessToken: string;
  calendarId?: string; // default "primary"

  // Event identity
  summary: string;
  description?: string;
  location?: string;

  // Time
  startIso: string; // ISO string
  endIso: string;   // ISO string
  timeZone?: string;

  // Optional attendees
  attendees?: Array<{ email: string }>;

  // If true, Google will generate a Meet link
  createMeetLink?: boolean;
};

export type CreateCalendarEventResult = {
  eventId: string;
  htmlLink?: string;
  hangoutLink?: string;
};

export async function createGoogleCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CreateCalendarEventResult> {
  const {
    accessToken,
    calendarId = "primary",
    summary,
    description,
    location,
    startIso,
    endIso,
    timeZone,
    attendees,
    createMeetLink,
  } = input;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth });

  const requestBody: any = {
    summary,
    description,
    location,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
    attendees,
  };

  // Optional Google Meet link
  let conferenceDataVersion: number | undefined = undefined;
  if (createMeetLink) {
    conferenceDataVersion = 1;
    requestBody.conferenceData = {
      createRequest: {
        requestId: `nexus-${Date.now()}`, // simple uniqueness
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
    ...(conferenceDataVersion !== undefined ? { conferenceDataVersion } : {}),
    sendUpdates: "all",
  });

  const ev = (res as any).data ?? res;

  if (!ev?.id) {
    throw new Error("Google Calendar event creation failed: missing event id");
  }

  return {
    eventId: ev.id,
    htmlLink: ev.htmlLink ?? undefined,
    hangoutLink: (ev as any).hangoutLink ?? undefined,
  };
}
