import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { calendarService } from "../calendar/calendarService.js";
import { eventBus } from "../events/eventBus.js";

type CreateBookingInput = {
  client_id: string;
  lead_id: string;
  service_type: string;
  start_time: string; // ISO (UTC)
  end_time: string;   // ISO (UTC)
  timezone: string;
  source: "voice" | "sms" | "email" | "form" | "ui";
  created_by: "ai" | "human";
  metadata?: Record<string, any>;
};

/* =====================================================
   SAFE EVENT EMITTER (DEBUG + PROD SAFE)
   ===================================================== */
function safeEmit(event: string, payload: any) {
  if (typeof (eventBus as any)?.emit === "function") {
    eventBus.emit(event, payload);
  }
}

/* =====================================================
   OVERLAP CHECK
   ===================================================== */
async function hasOverlap(params: {
  client_id: string;
  start_time: string;
  end_time: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("check_booking_overlap", {
    p_client_id: params.client_id,
    p_start_time: params.start_time,
    p_end_time: params.end_time,
  });

  if (error) throw error;
  return data === true;
}

/* =====================================================
   BOOKING SERVICE
   ===================================================== */
export const bookingService = {
  async createPendingBooking(input: CreateBookingInput) {
    // 🔒 HARD GUARD: prevent double booking
    const overlap = await hasOverlap({
      client_id: input.client_id,
      start_time: input.start_time,
      end_time: input.end_time,
    });

    if (overlap) {
      throw new Error("BOOKING_CONFLICT: time slot already booked");
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: input.client_id,
        lead_id: input.lead_id,
        service_type: input.service_type,
        start_time: input.start_time,
        end_time: input.end_time,
        timezone: input.timezone,
        source: input.source,
        created_by: input.created_by,
        status: "pending",
        metadata: input.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw error;

    safeEmit("booking.pending", { booking_id: data.id });
    return data;
  },

  async confirmBooking(booking_id: string) {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (error) throw error;

    if (booking.status !== "pending") {
      throw new Error("Only pending bookings can be confirmed");
    }

    const calendarEventId = await calendarService.createEvent(booking);

    const { data, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "confirmed",
        calendar_event_id: calendarEventId,
      })
      .eq("id", booking_id)
      .select()
      .single();

    if (updateError) throw updateError;

    safeEmit("booking.confirmed", { booking_id });
    return data;
  },

  async cancelBooking(booking_id: string) {
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (booking?.calendar_event_id) {
      await calendarService.deleteEvent(booking.calendar_event_id);
    }

    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking_id);

    safeEmit("booking.cancelled", { booking_id });
  },

  async completeBooking(booking_id: string) {
    await supabaseAdmin
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking_id);

    safeEmit("booking.completed", { booking_id });
  },

  async markNoShow(booking_id: string) {
    await supabaseAdmin
      .from("bookings")
      .update({ status: "no_show" })
      .eq("id", booking_id);

    safeEmit("booking.no_show", { booking_id });
  },
};
