// src/agents/conversationManager.ts

import { supabaseAdmin } from "../utils/supabaseAdmin.js";
import type { ConversationState } from "./contracts/conversationState.js";
import { isValidTransition } from "./contracts/conversationState.js";

export async function conversationManager(input: {
  client_id: string;
  event: {
    type: string;
    channel: string;
    occurred_at: string;
    payload?: Record<string, any>;
  };
  lead?: {
    id?: string;
    stage?: ConversationState;
    phone?: string | null;
    service_type?: string;
  };
  recent_messages?: Array<{
    direction: "inbound" | "outbound";
    content: string;
  }>;
}) {
  const actions: any[] = [];

  console.log("🧨 CM LOADED + RUNNING");
  console.log("🧨 CM EVENT TYPE =", input?.event?.type);
  console.log("🧨 CM EVENT PAYLOAD =", input?.event?.payload);

  // SYSTEM EVENTS MUST RUN FIRST
  if (input.event.type === "booking.confirmed") {
    console.log("✅ HIT booking.confirmed BRANCH");

    const { booking_id, lead_id } = input.event.payload ?? {};

    if (!booking_id || !lead_id) {
      console.log("❌ missing booking_id or lead_id");
      return {
        ok: true,
        agent: "conversationManager",
        client_id: input.client_id,
        data: { actions },
      };
    }

    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, start_time, service_type")
      .eq("id", booking_id)
      .eq("client_id", input.client_id)
      .single();

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, phone")
      .eq("id", lead_id)
      .eq("client_id", input.client_id)
      .single();

    console.log("🧾 booking =", booking);
    console.log("🧾 lead =", lead);

    if (!booking || !lead || !lead.phone) {
      console.log("❌ booking/lead missing or lead.phone null");
      return {
        ok: true,
        agent: "conversationManager",
        client_id: input.client_id,
        data: { actions },
      };
    }

    const start = new Date(booking.start_time).toLocaleString();
    const service = booking.service_type ?? "appointment";

    actions.push({
      type: "QUEUE_MESSAGE",
      channel: "sms",
      body: `Your ${service} is confirmed for ${start}. Reply CANCEL to cancel.`,
      reason: "booking_confirmation",
      lead_id: lead.id,
    });

    await supabaseAdmin.from("ai_actions").insert({
      client_id: input.client_id,
      lead_id: lead.id,
      action_type: "booking_confirmation_sent",
      payload: { booking_id },
      status: "success",
    });

    return {
      ok: true,
      agent: "conversationManager",
      client_id: input.client_id,
      data: { actions },
    };
  }

  // USER MESSAGE GUARD (SYSTEM EVENTS ALREADY HANDLED)
  if (!input.recent_messages || input.recent_messages.length === 0) {
    console.log("🟡 CM EARLY RETURN: no recent_messages");
    return {
      ok: true,
      agent: "conversationManager",
      client_id: input.client_id,
      data: { actions },
    };
  }

  console.log("🟡 CM NORMAL FLOW (not implemented in this debug file)");
  return {
    ok: true,
    agent: "conversationManager",
    client_id: input.client_id,
    data: { actions },
  };
}
