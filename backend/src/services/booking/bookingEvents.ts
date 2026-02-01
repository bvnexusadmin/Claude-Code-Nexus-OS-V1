import { eventBus } from "../events/eventBus.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

/**
 * Booking Event Handlers
 * Side-effect handlers only (messages + audit)
 * No routing, no HTTP
 */

eventBus.on("booking.confirmation.requested", async ({ client_id, booking, lead }: any) => {
  try {
    const startTime = new Date(booking.start_time).toLocaleString();
    const service = booking.service_type || "appointment";

    const body = `Your ${service} is confirmed for ${startTime}. Reply CANCEL to cancel.`;

    // Persist outbound message
    await supabaseAdmin.from("messages").insert({
      client_id,
      lead_id: lead.id,
      channel: "sms",
      direction: "outbound",
      body,
      status: "queued",
      meta: {
        booking_id: booking.id,
        type: "booking_confirmation",
      },
    });

    // Audit log
    await supabaseAdmin.from("ai_actions").insert({
      client_id,
      lead_id: lead.id,
      action_type: "booking_confirmation_sent",
      payload: { booking_id: booking.id, channel: "sms" },
      status: "success",
    });
  } catch (err: any) {
    console.error("booking confirmation handler failed:", err?.message || err);

    await supabaseAdmin.from("ai_actions").insert({
      client_id,
      lead_id: lead?.id ?? null,
      action_type: "booking_confirmation_sent",
      payload: {
        booking_id: booking?.id,
        error: err?.message || String(err),
      },
      status: "error",
    });
  }
});
