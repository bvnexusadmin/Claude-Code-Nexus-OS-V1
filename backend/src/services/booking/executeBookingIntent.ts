import { bookingService } from "./bookingService.js";

type ExecuteBookingIntentInput = {
  client_id: string;
  lead_id: string;
  service_type: string;
  start_iso: string;
  end_iso: string;
  source: "sms" | "voice" | "email" | "ui";
};

export async function executeBookingIntent(input: ExecuteBookingIntentInput) {
  const pending = await bookingService.createPendingBooking({
    client_id: input.client_id,
    lead_id: input.lead_id,
    service_type: input.service_type,
    start_time: input.start_iso,
    end_time: input.end_iso,
    timezone: "America/Denver",
    source: input.source,
    created_by: "ai",
  });

  return bookingService.confirmBooking(pending.id);
}
