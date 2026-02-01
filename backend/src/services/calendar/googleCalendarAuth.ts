// src/services/calendar/googleCalendarAuth.ts
// Google Calendar OAuth token helper (READ/WRITE safe)
// - Reads tokens from `client_integrations`
// - Refreshes access token if expired (using refresh_token)
// - Updates DB with new access token + expiry
// - Returns a valid access token + calendar_id

import { google } from "googleapis";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

type GoogleCalendarIntegrationRow = {
  client_id: string;
  provider: string;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  google_calendar_id: string | null;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function isExpired(expiresAtIso: string | null, skewSeconds = 60): boolean {
  if (!expiresAtIso) return true;
  const t = new Date(expiresAtIso).getTime();
  if (Number.isNaN(t)) return true;
  return t <= Date.now() + skewSeconds * 1000;
}

export async function getValidGoogleCalendarAccess(params: {
  client_id: string;
}): Promise<{ accessToken: string; calendarId: string }> {
  const { client_id } = params;

  const { data, error } = await supabaseAdmin
    .from("client_integrations")
    .select(
      "client_id,provider,google_access_token,google_refresh_token,google_token_expires_at,google_calendar_id"
    )
    .eq("client_id", client_id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (error) {
    throw new Error(`client_integrations fetch failed: ${error.message}`);
  }

  const row = data as GoogleCalendarIntegrationRow | null;

  if (!row) {
    throw new Error("Google Calendar not connected for this client.");
  }

  const calendarId = row.google_calendar_id || "primary";

  if (!row.google_refresh_token) {
    throw new Error("Missing google_refresh_token (reconnect Google Calendar).");
  }

  // If access token exists and isn't expired, use it.
  if (row.google_access_token && !isExpired(row.google_token_expires_at)) {
    return { accessToken: row.google_access_token, calendarId };
  }

  // Refresh token flow
  const oauth2Client = new google.auth.OAuth2(
    mustEnv("GOOGLE_OAUTH_CLIENT_ID"),
    mustEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    mustEnv("GOOGLE_OAUTH_REDIRECT_URI")
  );

  oauth2Client.setCredentials({
    refresh_token: row.google_refresh_token,
  });

  // googleapis returns credentials with access_token + expiry_date
  const refreshed = await oauth2Client.refreshAccessToken();
  const creds = refreshed.credentials;

  const newAccess = creds.access_token;
  const newExpiryIso =
    typeof creds.expiry_date === "number"
      ? new Date(creds.expiry_date).toISOString()
      : null;

  if (!newAccess) {
    throw new Error("Refresh succeeded but no access_token returned.");
  }

  const { error: upErr } = await supabaseAdmin
    .from("client_integrations")
    .update({
      google_access_token: newAccess,
      google_token_expires_at: newExpiryIso,
    })
    .eq("client_id", client_id)
    .eq("provider", "google_calendar");

  if (upErr) {
    throw new Error(`Failed to persist refreshed token: ${upErr.message}`);
  }

  return { accessToken: newAccess, calendarId };
}
