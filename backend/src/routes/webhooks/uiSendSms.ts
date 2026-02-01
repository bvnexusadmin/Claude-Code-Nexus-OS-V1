// backend/src/routes/webhooks/uiSendSms.ts
import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { outboundSmsAgent } from "../../services/agents/outboundSmsAgent.js";

const router = express.Router();

/**
 * POST /webhooks/ui-send-sms
 * Persists outbound message to DB.
 * Only sends real SMS if ENABLE_TWILIO_OUTBOUND="true".
 *
 * Accepts:
 * - lead_id (required)
 * - content OR body (required)
 * - client_id (optional; derived from lead if missing)
 */
router.post("/ui-send-sms", async (req, res) => {
  try {
    const lead_id = req.body?.lead_id;
    const content = (req.body?.content ?? req.body?.body ?? "").toString().trim();
    const client_id_from_body = req.body?.client_id;

    if (!lead_id || !content) {
      return res.status(400).json({ ok: false, error: "Missing lead_id or content" });
    }

    // 1) Lookup lead to get client_id + phone
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, client_id, phone")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return res.status(404).json({ ok: false, error: "Lead not found" });
    }

    const client_id = client_id_from_body || lead.client_id;

    // 2) Persist outbound message
    const { data: msg, error: insertErr } = await supabaseAdmin
      .from("messages")
      .insert({
        client_id,
        lead_id,
        direction: "outbound",
        channel: "sms",
        sender_type: "system",
        content,
        event: "message.sent",
      })
      .select("id, created_at")
      .single();

    if (insertErr) throw insertErr;

    // 3) Optional: send real SMS (gated)
    if (process.env.ENABLE_TWILIO_OUTBOUND === "true") {
      if (!lead.phone) {
        return res.status(400).json({
          ok: false,
          error: "Lead has no phone; message saved but cannot send SMS",
          message_id: msg.id,
        });
      }

      await outboundSmsAgent({
        client_id,
        to_phone: lead.phone,
        body: content,
      });
    }

    return res.json({ ok: true, message_id: msg.id, created_at: msg.created_at });
  } catch (err: any) {
    console.error("❌ UI SEND SMS ERROR", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
