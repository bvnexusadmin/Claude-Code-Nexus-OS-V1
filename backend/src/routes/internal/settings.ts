// Settings API — all settings endpoints for the NexusOS settings page.
//
// ── Required SQL migrations (run once in Supabase SQL editor) ─────────────────
//
//  -- Additional business info columns for client_configs:
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS phone text;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS business_email text;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS website text;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS address text;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS default_service_duration integer DEFAULT 60;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS twilio_phone text;
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS openai_model text DEFAULT 'gpt-4o';
//  ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS openai_api_key text;
//
//  -- Notification preferences table:
//  CREATE TABLE IF NOT EXISTS notification_preferences (
//    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
//    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//    ai_outreach_inapp boolean NOT NULL DEFAULT false,
//    ai_outreach_daily_email boolean NOT NULL DEFAULT false,
//    ai_outreach_instant_alert boolean NOT NULL DEFAULT false,
//    new_lead_alert boolean NOT NULL DEFAULT true,
//    booking_confirmed boolean NOT NULL DEFAULT true,
//    missed_call_alert boolean NOT NULL DEFAULT true,
//    daily_summary boolean NOT NULL DEFAULT false,
//    created_at timestamptz NOT NULL DEFAULT now(),
//    updated_at timestamptz NOT NULL DEFAULT now(),
//    UNIQUE(client_id, user_id)
//  );
//
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

// ── Helper: mask a sensitive string ──────────────────────────────────────────

function maskKey(key: string | null | undefined): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return phone.replace(/\d(?=\d{4})/g, "•");
}

// ── GET /internal/settings/business ──────────────────────────────────────────

router.get(
  "/settings/business",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    try {
      const [clientRes, configRes] = await Promise.all([
        supabaseAdmin.from("clients").select("*").eq("id", clientId).single(),
        supabaseAdmin
          .from("client_configs")
          .select("*")
          .eq("client_id", clientId)
          .single(),
      ]);
      if (clientRes.error) throw new Error(clientRes.error.message);
      if (configRes.error) throw new Error(configRes.error.message);

      return res.json({
        ok: true,
        business: {
          name: clientRes.data?.name ?? "",
          phone: configRes.data?.phone ?? "",
          business_email: configRes.data?.business_email ?? "",
          website: configRes.data?.website ?? "",
          address: configRes.data?.address ?? "",
          timezone: configRes.data?.timezone ?? "America/New_York",
          default_service_duration:
            configRes.data?.default_service_duration ?? 60,
          services: Array.isArray(configRes.data?.services)
            ? configRes.data.services
                .map((s: any) => (typeof s === "string" ? s : s?.name ?? ""))
                .join("\n")
            : "",
          business_hours: configRes.data?.business_hours ?? {},
        },
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── POST /internal/settings/business ─────────────────────────────────────────

router.post(
  "/settings/business",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const {
      name,
      phone,
      business_email,
      website,
      address,
      timezone,
      default_service_duration,
      services,
      business_hours,
    } = req.body;

    try {
      const updates: Array<Promise<any>> = [];

      if (name !== undefined) {
        updates.push(
          Promise.resolve().then(async () => {
            const { error } = await supabaseAdmin
              .from("clients")
              .update({ name })
              .eq("id", clientId);
            if (error) throw new Error(`clients update: ${error.message}`);
          })
        );
      }

      const configPatch: Record<string, any> = {};
      if (phone !== undefined) configPatch.phone = phone;
      if (business_email !== undefined)
        configPatch.business_email = business_email;
      if (website !== undefined) configPatch.website = website;
      if (address !== undefined) configPatch.address = address;
      if (timezone !== undefined) configPatch.timezone = timezone;
      if (default_service_duration !== undefined)
        configPatch.default_service_duration = default_service_duration;
      if (services !== undefined) {
        configPatch.services = (services as string)
          .split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((name: string) => ({ name, duration_minutes: 60 }));
      }
      if (business_hours !== undefined)
        configPatch.business_hours = business_hours;

      if (Object.keys(configPatch).length > 0) {
        updates.push(
          Promise.resolve().then(async () => {
            const { error } = await supabaseAdmin
              .from("client_configs")
              .update(configPatch)
              .eq("client_id", clientId);
            if (error) throw new Error(`client_configs update: ${error.message}`);
          })
        );
      }

      await Promise.all(updates);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── GET /internal/settings/integrations ──────────────────────────────────────

router.get(
  "/settings/integrations",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    try {
      const [configRes, gcalRes] = await Promise.all([
        supabaseAdmin
          .from("client_configs")
          .select("twilio_phone, openai_model, openai_api_key")
          .eq("client_id", clientId)
          .single(),
        supabaseAdmin
          .from("client_integrations")
          .select("google_refresh_token, google_calendar_id")
          .eq("client_id", clientId)
          .eq("provider", "google_calendar")
          .maybeSingle(),
      ]);

      const cfg = (configRes.data ?? {}) as any;
      const gcal = gcalRes.data;

      return res.json({
        ok: true,
        integrations: {
          google_calendar: {
            connected: !!(gcal?.google_refresh_token),
            calendar_id: gcal?.google_calendar_id ?? "primary",
          },
          twilio: {
            phone: cfg.twilio_phone ?? "",
            phone_masked: maskPhone(cfg.twilio_phone),
            connected: !!(cfg.twilio_phone),
          },
          openai: {
            model: cfg.openai_model ?? process.env.OPENAI_MODEL ?? "gpt-4o",
            api_key_masked: maskKey(cfg.openai_api_key ?? process.env.OPENAI_API_KEY),
            connected: !!(cfg.openai_api_key ?? process.env.OPENAI_API_KEY),
          },
          email: {
            connected: !!(process.env.POSTMARK_API_KEY),
            provider: "Postmark",
          },
        },
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── POST /internal/settings/integrations ─────────────────────────────────────

router.post(
  "/settings/integrations",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const { provider, twilio_phone, openai_model, openai_api_key } = req.body;

    try {
      const patch: Record<string, any> = {};

      if (provider === "twilio" && twilio_phone !== undefined) {
        patch.twilio_phone = twilio_phone;
      }
      if (provider === "openai") {
        if (openai_model !== undefined) patch.openai_model = openai_model;
        if (openai_api_key !== undefined && openai_api_key !== "")
          patch.openai_api_key = openai_api_key;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: "Nothing to update" });
      }

      const { error } = await supabaseAdmin
        .from("client_configs")
        .update(patch)
        .eq("client_id", clientId);

      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── GET /internal/settings/users ─────────────────────────────────────────────

router.get(
  "/settings/users",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    try {
      const { data: memberships, error: memErr } = await supabaseAdmin
        .from("client_users")
        .select("user_id, role, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (memErr) throw new Error(memErr.message);
      if (!memberships?.length) return res.json({ ok: true, users: [] });

      const users = await Promise.all(
        memberships.map(async (m: any) => {
          const { data } = await supabaseAdmin.auth.admin.getUserById(
            m.user_id
          );
          return {
            id: m.user_id,
            email: data.user?.email ?? "—",
            role: m.role,
            status: data.user?.confirmed_at ? "active" : "pending",
          };
        })
      );

      return res.json({ ok: true, users });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── POST /internal/settings/users/invite ─────────────────────────────────────

router.post(
  "/settings/users/invite",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const { email, role } = req.body as {
      email?: string;
      role?: string;
    };

    if (!email?.trim()) {
      return res.status(400).json({ ok: false, error: "email is required" });
    }

    const assignedRole = role === "admin" ? "admin" : "staff";
    const frontendUrl =
      process.env.FRONTEND_URL ?? "http://localhost:3000";

    try {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
          redirectTo: `${frontendUrl}/settings`,
          data: { invited_to_client: clientId },
        });

      if (inviteErr) throw new Error(inviteErr.message);

      const userId = invited.user?.id;
      if (!userId) throw new Error("Invite succeeded but no user ID returned");

      const { error: memErr } = await supabaseAdmin
        .from("client_users")
        .upsert(
          {
            user_id: userId,
            client_id: clientId,
            role: assignedRole,
          },
          { onConflict: "user_id,client_id" }
        );

      if (memErr) throw new Error(`Membership insert failed: ${memErr.message}`);

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── DELETE /internal/settings/users/:userId ───────────────────────────────────

router.delete(
  "/settings/users/:userId",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const { userId } = req.params;
    const requestingUserId: string = req.user.id;

    if (userId === requestingUserId) {
      return res
        .status(400)
        .json({ ok: false, error: "You cannot remove yourself" });
    }

    try {
      const { error } = await supabaseAdmin
        .from("client_users")
        .delete()
        .eq("user_id", userId)
        .eq("client_id", clientId);

      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

// ── GET /internal/settings/notifications ─────────────────────────────────────

router.get(
  "/settings/notifications",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const userId: string = req.user.id;

    const defaults = {
      ai_outreach_inapp: false,
      ai_outreach_daily_email: false,
      ai_outreach_instant_alert: false,
      new_lead_alert: true,
      booking_confirmed: true,
      missed_call_alert: true,
      daily_summary: false,
    };

    try {
      const { data } = await supabaseAdmin
        .from("notification_preferences")
        .select("*")
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .maybeSingle();

      return res.json({ ok: true, prefs: data ? { ...defaults, ...data } : defaults });
    } catch {
      return res.json({ ok: true, prefs: defaults });
    }
  }
);

// ── POST /internal/settings/notifications ────────────────────────────────────

router.post(
  "/settings/notifications",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const userId: string = req.user.id;
    const prefs = req.body as Record<string, boolean>;

    try {
      const { error } = await supabaseAdmin
        .from("notification_preferences")
        .upsert(
          {
            client_id: clientId,
            user_id: userId,
            ...prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,user_id" }
        );

      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message });
    }
  }
);

export default router;
