import express from "express";
import { outboundSmsAgent } from "../../services/agents/outboundSmsAgent.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { conversationManager } from "../../agents/conversationManager.js";

const router = express.Router();

/**
 * TEMP: Single-tenant binding
 * Replace later with lookup by MessagingServiceSid or To number
 */
const BV_CLIENT_ID = "62137f9b-b1eb-4213-9423-f5715d3b9615";

/**
 * INBOUND SMS — TWILIO
 * IMPORTANT:
 * - Twilio sends application/x-www-form-urlencoded
 * - NO secret header
 */
router.post(
  "/sms",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      console.log("📩 SMS WEBHOOK HIT");
      console.log("RAW BODY:", req.body);

      const from = req.body.From;
      const to = req.body.To;
      const body = req.body.Body;

      if (!from || !to || !body) {
        console.error("❌ Missing required SMS fields");
        return res.status(400).send("Invalid SMS payload");
      }

      const client_id = BV_CLIENT_ID;

      // ------------------------------------------------------------
      // 1️⃣ Resolve or create lead
      // ------------------------------------------------------------
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, phone, stage, service_type")
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
            stage: "new",
          })
          .select("id")
          .single();

        if (createErr || !newLead) {
          console.error("❌ LEAD CREATE ERROR:", createErr);
          throw createErr ?? new Error("Lead insert returned no row");
        }

        lead_id = newLead.id;
      }

      // ------------------------------------------------------------
      // 2️⃣ Persist inbound message  ✅ FIXED
      // ------------------------------------------------------------
      await supabaseAdmin.from("messages").insert({
        client_id,
        lead_id,
        direction: "inbound",
        channel: "sms",
        sender_type: "user",              // ✅ canonical
        topic: "conversation",            // ✅ REQUIRED
        event: "message.received",
        content: body,
      });

      console.log("📥 Inbound message stored");

      // ------------------------------------------------------------
      // 3️⃣ Load recent messages
      // ------------------------------------------------------------
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("direction, sender_type, content")
        .eq("client_id", client_id)
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(10);

      // ------------------------------------------------------------
      // 4️⃣ Invoke Conversation Manager
      // ------------------------------------------------------------
      console.log("🧠 CALLING CONVERSATION MANAGER");

      const result = await conversationManager({
        client_id,
        event: {
          type: "sms.inbound",
          channel: "sms",
          occurred_at: new Date().toISOString(),
          payload: req.body,
        },
        lead: {
          id: lead_id,
          phone: from,
          stage: lead?.stage,
          service_type: lead?.service_type,
        },
        recent_messages: recentMessages ?? [],
      });

      console.log("🧠 CONVERSATION MANAGER RESULT:", result);

      // ------------------------------------------------------------
      // 5️⃣ Execute actions (delivery gated by A2P)
      // ------------------------------------------------------------
      if (result?.data?.actions) {
        for (const action of result.data.actions) {
          if (action.type === "QUEUE_MESSAGE") {
            await outboundSmsAgent({
              client_id,
              to_phone: action.to,
              body: action.body,
            });
          }
        }
      }

      // Twilio requires XML
      res.set("Content-Type", "text/xml");
      return res.status(200).send("<Response></Response>");
    } catch (err: any) {
      console.error("❌ SMS WEBHOOK ERROR", err);
      return res.status(500).send("Server error");
    }
  }
);

export default router;
