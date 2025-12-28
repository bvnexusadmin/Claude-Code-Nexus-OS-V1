import express from "express";
import { outboundSmsAgent } from "../../services/agents/outboundSmsAgent.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

/**
 * TEMP: Single-tenant binding
 * Replace later with lookup by MessagingServiceSid or To number
 */
const BV_CLIENT_ID = "62137f9b-b1eb-4213-9423-f5715d3b9615";

router.post("/sms", async (req, res) => {
  try {
    console.log("📩 SMS WEBHOOK HIT");
    console.log("RAW BODY:", req.body);

    const from = req.body.From;
    const to = req.body.To;
    const body = req.body.Body;

    if (!from || !to || !body) {
      console.error("❌ Missing required SMS fields");
      return res.status(400).json({ error: "Invalid SMS payload" });
    }

    const client_id = BV_CLIENT_ID;

    // ------------------------------------------------------------
    // 1️⃣ Persist inbound message (external sender)
    // ------------------------------------------------------------
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("client_id", client_id)
      .eq("phone", from)
      .maybeSingle();

    let lead_id: string;

    if (lead?.id) {
      lead_id = lead.id;
    } else {
      const { data: newLead, error: createErr } = await supabaseAdmin
        .from("leads")
        .insert({
          client_id,
          phone: from,
          source: "sms",
        })
        .select("id")
        .single();

      if (createErr || !newLead) {
        throw new Error("Failed to create lead for inbound SMS");
      }

      lead_id = newLead.id;
    }

    const { error: inboundErr } = await supabaseAdmin.from("messages").insert({
      client_id,
      lead_id,
      direction: "inbound",
      channel: "sms",
      sender_type: "external",
      content: body,
      event: "message.received",
    });

    if (inboundErr) {
      throw inboundErr;
    }

    console.log("📥 Inbound message stored");

    // ------------------------------------------------------------
    // 2️⃣ Call outbound agent (AUTO-REPLY)
    // ------------------------------------------------------------
    console.log("🚀 CALLING OUTBOUND SMS AGENT");

    await outboundSmsAgent({
      client_id,
      to_phone: from,
      body: "Got it — we received your message. One of our agents will follow up shortly.",
    });

    console.log("✅ OUTBOUND SMS AGENT COMPLETED");

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("❌ SMS WEBHOOK ERROR", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
