// backend/src/routes/internal/conversation.ts
import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";

const router = express.Router();

/**
 * INTERNAL: Send outbound message from UI
 * - Requires authenticated user
 * - Enforces tenant match (lead.client_id must equal req.user.client_id)
 * - Persists outbound message to DB
 * - Does NOT send real SMS (A2P pending)
 */
router.post(
  "/send-message",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    try {
      const { lead_id, content } = req.body;

      if (!lead_id || !content) {
        return res.status(400).json({
          ok: false,
          error: "Missing lead_id or content",
        });
      }

      // 1) Lookup lead to enforce tenant boundary
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id, client_id")
        .eq("id", lead_id)
        .single();

      if (leadErr || !lead) {
        return res.status(404).json({
          ok: false,
          error: "Lead not found",
        });
      }

      // 2) Tenant enforcement
      if (lead.client_id !== req.user.client_id) {
        return res.status(403).json({
          ok: false,
          error: "Forbidden: lead not in tenant",
        });
      }

      // 3) Insert outbound message (FULL SHAPE + REQUIRED COLUMNS)
      const { data: msg, error: insertErr } = await supabaseAdmin
        .from("messages")
        .insert({
          lead_id,
          client_id: lead.client_id,
          direction: "outbound",
          channel: "sms",
          sender_type: "system",
          event: "message.sent",
          topic: "conversation", // ✅ REQUIRED (messages.topic is NOT NULL)
          content,
        })
        .select("id")
        .single();

      if (insertErr) {
        throw insertErr;
      }

      console.log("📤 UI outbound message saved:", msg.id);

      return res.json({ ok: true, message_id: msg.id });
    } catch (err: any) {
      console.error("❌ SEND MESSAGE ERROR", err);
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  }
);

export default router;