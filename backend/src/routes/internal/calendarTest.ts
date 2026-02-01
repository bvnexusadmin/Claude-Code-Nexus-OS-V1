// src/routes/internal/calendarTest.ts
// Service Account Google Calendar test route
// - Verifies JWT signing + calendar write access
// - NO Supabase writes
// - Internal / debug utility only

import { Router } from "express";
import { google } from "googleapis";

const router = Router();

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

router.post("/calendar/test", async (_req, res) => {
  try {
    const rawKey = mustEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");

    // Normalize escaped newlines → real PEM
    const privateKey = rawKey.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: mustEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const calendar = google.calendar({
      version: "v3",
      auth,
    });

    const event = await calendar.events.insert({
      calendarId: mustEnv("GOOGLE_CALENDAR_ID"),
      requestBody: {
        summary: "Nexus OS Test Booking",
        description: "Created by Nexus OS service account",
        start: {
          dateTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        end: {
          dateTime: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        },
      },
    });

    return res.json({
      ok: true,
      event_id: event.data.id,
      htmlLink: event.data.htmlLink,
    });
  } catch (err: any) {
    console.error("Calendar test failed:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
