// src/services/calendar/googleCalendarFreeBusy.ts
// Google Calendar FreeBusy (READ ONLY)
// - Used to avoid conflicts with events created outside Nexus OS
// - No writes. No side effects.

import { google } from "googleapis";

export type FreeBusyWindow = {
  start: Date;
  end: Date;
};

export async function getGoogleCalendarFreeBusy(params: {
  accessToken: string;
  calendarId?: string; // default "primary"
  timeMin: Date;
  timeMax: Date;
}): Promise<FreeBusyWindow[]> {
  const { accessToken, calendarId = "primary", timeMin, timeMax } = params;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy ?? [];

  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      start: new Date(b.start as string),
      end: new Date(b.end as string),
    }));
}
