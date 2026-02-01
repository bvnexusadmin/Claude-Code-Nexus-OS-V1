import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { resolveEmailTenant } from "../../services/context/resolveEmailTenant.js";

const router = express.Router();

/**
 * Inbound Email Webhook — Zoho Mail
 *
 * Final guarantees:
 * - Never 400s
 * - Handles Zoho weirdness
 * - Strips HTML from SUBJECT + BODY
 * - Inserts clean human-readable text
 */
router.post("/email", async (req, res) => {
  try {
    const payload = req.body ?? {};

    /* =====================================================
       Helpers
       ===================================================== */

    const extractEmail = (value: any): string => {
      if (!value) return "";

      if (Array.isArray(value)) {
        return extractEmail(value[0]);
      }

      if (typeof value === "object") {
        return (
          extractEmail(value.address) ||
          extractEmail(value.email) ||
          extractEmail(value.from) ||
          extractEmail(value.to) ||
          ""
        );
      }

      if (typeof value === "string") {
        return value
          .replace(/.*</, "")
          .replace(/>.*/, "")
          .trim()
          .toLowerCase();
      }

      return "";
    };

    const stripHtml = (input: string): string => {
      return input
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    /* =====================================================
       Normalize Zoho payload
       ===================================================== */

    const from =
      extractEmail(payload.from) ||
      extractEmail(payload.sender) ||
      extractEmail(payload.headers?.From);

    const to =
      extractEmail(payload.to) ||
      extractEmail(payload.recipient) ||
      extractEmail(payload.headers?.To);

    if (!from || !to) {
      console.warn("⚠️ Skipping malformed inbound email payload", {
        keys: Object.keys(payload),
      });
      return res.status(200).json({ skipped: true });
    }

    // ⬅️ THIS WAS THE BUG
    const rawSubject = String(
      payload.subject ?? payload.Subject ?? ""
    );

    const subject = stripHtml(rawSubject);

    const textRaw = String(
      payload.text ?? payload.TextBody ?? ""
    ).trim();

    const htmlRaw = String(
      payload.html ?? payload.HtmlBody ?? ""
    ).trim();

    const body =
      textRaw || (htmlRaw ? stripHtml(htmlRaw) : "");

    const content =
      subject && body
        ? `Subject: ${subject}\n\n${body}`
        : subject
        ? `Subject: ${subject}`
        : body || "[empty email]";

    console.log("📧 INBOUND EMAIL CLEAN", {
      from,
      to,
      subject,
    });

    /* =====================================================
       Resolve tenant
       ===================================================== */

    const { client_id } = await resolveEmailTenant(to);

    if (!client_id) {
      console.warn("⚠️ No tenant resolved", { to });
      return res.status(200).json({ skipped: true });
    }

    /* =====================================================
       Lead upsert
       ===================================================== */

    let lead_id: string;

    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", from)
      .maybeSingle();

    if (existingLead?.id) {
      lead_id = existingLead.id;
    } else {
      const { data: newLead, error } = await supabaseAdmin
        .from("leads")
        .insert({
          client_id,
          email: from,
          source: "email",
        })
        .select("id")
        .single();

      if (error || !newLead) {
        console.error("❌ LEAD INSERT ERROR:", error);
        return res.status(200).json({ skipped: true });
      }

      lead_id = newLead.id;
    }

    /* =====================================================
       Insert message
       ===================================================== */

    const now = new Date().toISOString();

    const { error: msgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        client_id,
        lead_id,

        channel: "email",
        direction: "inbound",
        sender_type: "external",

        topic: "conversation",
        event: "message_received",

        content,

        occurred_at: now,
        inserted_at: now,

        source: "zoho_inbound",
        raw_payload: payload,
      });

    if (msgErr) {
      console.error("❌ MESSAGE INSERT ERROR:", msgErr);
      return res.status(200).json({ skipped: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ EMAIL WEBHOOK FATAL:", err);
    return res.status(200).json({ skipped: true });
  }
});

export default router;
