// src/routes/auth/google.ts
import express from "express";
import { google } from "googleapis";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

/**
 * Check if Google OAuth is configured
 */
function hasGoogleOAuth(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

/**
 * Lazily create OAuth client (ONLY when used)
 */
function getOAuthClient() {
  if (!hasGoogleOAuth()) {
    throw new Error("Google OAuth not configured");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  );
}

/* =====================================================
   START GOOGLE OAUTH
   GET /auth/google/start?client_id=UUID
   ===================================================== */
router.get("/start", async (req, res) => {
  if (!hasGoogleOAuth()) {
    return res.status(501).send("Google OAuth not enabled on this server");
  }

  const client_id = String(req.query.client_id ?? "").trim();
  if (!client_id) {
    return res.status(400).send("Missing client_id");
  }

  try {
    const oauth2Client = getOAuthClient();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      state: client_id,
    });

    return res.redirect(authUrl);
  } catch (err: any) {
    return res.status(500).send(err.message);
  }
});

/* =====================================================
   GOOGLE OAUTH CALLBACK
   GET /auth/google/callback
   ===================================================== */
router.get("/callback", async (req, res) => {
  if (!hasGoogleOAuth()) {
    return res.status(501).send("Google OAuth not enabled on this server");
  }

  const code = String(req.query.code ?? "").trim();
  const client_id = String(req.query.state ?? "").trim();

  if (!code || !client_id) {
    return res.status(400).send("Missing code or state");
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send("No refresh token returned (remove app access and retry)");
    }

    const expires_at = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    const { error } = await supabaseAdmin
      .from("client_integrations")
      .upsert(
        {
          client_id,
          provider: "google_calendar",
          google_access_token: tokens.access_token ?? null,
          google_refresh_token: tokens.refresh_token ?? null,
          google_token_expires_at: expires_at,
          google_calendar_id: "primary",
        },
        { onConflict: "client_id,provider" }
      );

    if (error) throw error;

    return res.send(
      "Google Calendar connected successfully. You may close this window."
    );
  } catch (err: any) {
    console.error("❌ Google OAuth callback error:", err.message);
    return res.status(500).send("OAuth failed");
  }
});

export default router;
