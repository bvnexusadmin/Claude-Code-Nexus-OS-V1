import { randomUUID } from "crypto";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";
import type { SystemEvent } from "./contracts/systemEvents.js";

/**
 * Lead Intake Agent
 * Handles inbound SMS and stores messages
 */
export const leadIntakeAgent = {
  async run(event: SystemEvent) {
    const { client_id, payload, trace_id } = event;

    if (!payload) {
      console.warn("[LEAD INTAKE] Missing payload");
      return;
    }

    const { from, to, text, raw } = payload as any;

    if (!from || !to || !text) {
      console.warn("[LEAD INTAKE] Missing SMS fields", payload);
      return;
    }

    console.log("[LEAD INTAKE] Processing inbound SMS", {
      client_id,
      from,
      to,
      text,
      trace_id,
    });

    const { error } = await supabaseAdmin.from("messages").insert({
      id: randomUUID(),
      client_id,

      // 🔒 REQUIRED BY SCHEMA
      channel: "sms",
      sender_type: "external",     // ✅ THIS IS THE NEW FIX

      direction: "inbound",
      source: "sms",

      from_number: from,
      to_number: to,
      content: text,

      raw_payload: raw,
      trace_id,

      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[LEAD INTAKE] Failed to insert message", error);
      throw error;
    }

    console.log("[LEAD INTAKE] Message inserted successfully");
  },
};
