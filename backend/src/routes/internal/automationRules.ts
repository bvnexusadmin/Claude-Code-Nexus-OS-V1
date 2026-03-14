// Outreach Automation Rules CRUD
//
// GET  /internal/automation-rules          → list all rules for active client
// POST /internal/automation-rules/upsert  → create or update a rule
// GET  /internal/automation-rules/activity → fetch activity log
//
// ── Required Supabase tables ─────────────────────────────────────────────────
//
//  Run once in Supabase SQL editor:
//
//  CREATE TABLE IF NOT EXISTS automation_rules (
//    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
//    rule_type text NOT NULL,
//    enabled boolean NOT NULL DEFAULT false,
//    use_ai_timing boolean NOT NULL DEFAULT false,
//    use_ai_message boolean NOT NULL DEFAULT false,
//    channel text NOT NULL DEFAULT 'sms',
//    delay_hours integer NOT NULL DEFAULT 24,
//    custom_message text,
//    created_at timestamptz NOT NULL DEFAULT now(),
//    updated_at timestamptz NOT NULL DEFAULT now(),
//    UNIQUE(client_id, rule_type)
//  );
//
//  CREATE TABLE IF NOT EXISTS outreach_activity_log (
//    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
//    lead_id uuid REFERENCES leads(id),
//    rule_type text,
//    channel text,
//    message_preview text,
//    status text NOT NULL DEFAULT 'queued',
//    created_at timestamptz NOT NULL DEFAULT now()
//  );
//
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

// ── List all rules ────────────────────────────────────────────────────────────

router.get(
  "/automation-rules",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    try {
      const { data, error } = await supabaseAdmin
        .from("automation_rules")
        .select("*")
        .eq("client_id", clientId)
        .order("rule_type");

      if (error) throw new Error(error.message);
      return res.json({ ok: true, rules: data ?? [] });
    } catch {
      // Table may not exist yet — return empty so UI degrades gracefully
      return res.json({ ok: true, rules: [] });
    }
  }
);

// ── Upsert a rule ─────────────────────────────────────────────────────────────

router.post(
  "/automation-rules/upsert",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    const {
      rule_type,
      enabled,
      use_ai_timing,
      use_ai_message,
      channel,
      delay_hours,
      custom_message,
    } = req.body;

    if (!rule_type) {
      return res
        .status(400)
        .json({ ok: false, error: "rule_type is required" });
    }

    try {
      const { error } = await supabaseAdmin
        .from("automation_rules")
        .upsert(
          {
            client_id: clientId,
            rule_type,
            enabled: enabled ?? false,
            use_ai_timing: use_ai_timing ?? false,
            use_ai_message: use_ai_message ?? false,
            channel: channel ?? "sms",
            delay_hours: delay_hours ?? 24,
            custom_message: custom_message ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,rule_type" }
        );

      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, error: err?.message ?? "DB error" });
    }
  }
);

// ── Activity log ──────────────────────────────────────────────────────────────

router.get(
  "/automation-rules/activity",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const clientId: string = req.ctx.client.id;
    try {
      const { data, error } = await supabaseAdmin
        .from("outreach_activity_log")
        .select(
          "id, lead_id, rule_type, channel, message_preview, status, created_at"
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);
      return res.json({ ok: true, activity: data ?? [] });
    } catch {
      return res.json({ ok: true, activity: [] });
    }
  }
);

export default router;
