import express from "express";

import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { sendEmail } from "../../services/messaging/emailSender.js";

const router = express.Router();

/**
 * POST /internal/email/send
 * UI-triggered outbound email (human)
 */
router.post(
  "/send",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    try {
      const { lead_id, to, subject, content } = req.body;

      if (!lead_id || !to || !content) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const client_id = req.ctx.client.id;
      const now = new Date().toISOString();

      // Persist message
      const { error } = await supabaseAdmin.from("messages").insert({
        client_id,
        lead_id,

        channel: "email",
        direction: "outbound",
        sender_type: "human",

        topic: "conversation",
        event: "message_sent",

        content: subject
          ? `Subject: ${subject}\n\n${content}`
          : content,

        occurred_at: now,
        inserted_at: now,

        source: "ui_email",
      });

      if (error) {
        console.error("❌ EMAIL OUTBOUND INSERT ERROR:", error);
        return res.status(500).json({ error: "Failed to persist email" });
      }

      // Stub send (no-op)
      await sendEmail({ to, subject, content });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("❌ OUTBOUND EMAIL ERROR:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
