// src/services/execution/bookingIntentExecutor.ts
// Executes READY booking intents produced by bookingAgent.
// This is the ONLY place where bookingAgent decisions
// turn into real bookings + calendar events.

import { bookingService } from "../booking/bookingService.js";

export async function executeBookingIntent(result: any) {
  if (!result?.intent) return;
  if (result.intent.type !== "booking") return;
  if (result.intent.status !== "ready") return;

  const payload = result.intent.payload;

  if (!payload?.selected_slot) {
    throw new Error("READY booking intent missing selected_slot");
  }

  const {
    lead_id,
    service_type,
    duration_minutes,
    selected_slot,
  } = payload;

  const {
    start_iso,
    end_iso,
  } = selected_slot;

  // Create booking (pending)
  const booking = await bookingService.createPendingBooking({
    client_id: result.client_id,
    lead_id,
    service_type,
    start_time: start_iso,
    end_time: end_iso,
    timezone: "UTC", // bookingAgent already normalized times
    source: inferSource(result),
    created_by: "ai",
    metadata: {
      agent: "bookingAgent",
      duration_minutes,
    },
  });

  // Confirm booking (calendar write happens here)
  await bookingService.confirmBooking(booking.id);

  return booking;
}

/**
 * Infer booking source from agent context
 * Default safely to 'ui' if unknown
 */
function inferSource(result: any): "voice" | "sms" | "email" | "form" | "ui" {
  const channel = result?.channel || result?.source;

  if (channel === "voice") return "voice";
  if (channel === "sms") return "sms";
  if (channel === "email") return "email";
  if (channel === "form") return "form";

  return "ui";
}
