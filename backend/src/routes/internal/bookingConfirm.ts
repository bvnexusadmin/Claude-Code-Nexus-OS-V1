import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { eventBus } from "../../services/events/eventBus.js";

const router = express.Router();

/**
 * INTERNAL: Booking Confirmation Trigger
 *
 * Guarantees:
 * - Idempotent (only once per booking)
 * - Writes ai_actions
 * - Updates bookings.confirmation_sent_at
 * - Emits booking.confirmed event exactly once
 */
router.post("/booking/confirm/send", async (req, res) => {
  try {
    const secret = req.headers["x-nexus-secret"];
    if (secret !== process.env.NEXUS_AUTOMATION_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { client_id, booking_id } = req.body ?? {};
    if (!client_id || !booking_id) {
      return res.status(400).json({ ok: false, error: "Missing client_id or booking_id" });
    }

    // Load booking
    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("client_id", client_id)
      .single();

    if (bookingErr || !booking) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    // 🔒 IDEMPOTENCY CHECK
    if (booking.confirmation_sent_at) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "confirmation_already_sent",
        confirmation_sent_at: booking.confirmation_sent_at,
      });
    }

    // Load lead (phone is required)
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", booking.lead_id)
      .eq("client_id", client_id)
      .single();

    if (leadErr || !lead) {
      return res.status(404).json({ ok: false, error: "Lead not found" });
    }

    if (!lead.phone) {
      return res.status(400).json({ ok: false, error: "Lead phone missing" });
    }

    // 1️⃣ AUDIT — confirmation requested
    await supabaseAdmin.from("ai_actions").insert({
      client_id,
      lead_id: booking.lead_id,
      action_type: "booking_confirmation_requested",
      payload: { booking_id },
      status: "success",
    });

    // 2️⃣ MARK CONFIRMATION AS SENT (LOCK)
    const confirmationTime = new Date().toISOString();

    await supabaseAdmin
      .from("bookings")
      .update({ confirmation_sent_at: confirmationTime })
      .eq("id", booking_id);

    // 3️⃣ EMIT EVENT (DOWNSTREAM SENDS MESSAGE)
    await eventBus.emitEvent({
      event_id: `booking-confirm-${booking_id}`,
      trace_id: `booking-${booking_id}`,
      event_type: "booking.confirmed",
      client_id,
      source: "system",
      occurred_at: new Date().toISOString(),
      payload: {
        booking_id,
        lead_id: booking.lead_id,
        source: "automation",
      },
    });

    // 4️⃣ AUDIT — confirmation sent
    await supabaseAdmin.from("ai_actions").insert({
      client_id,
      lead_id: booking.lead_id,
      action_type: "booking_confirmation_sent",
      payload: { booking_id },
      status: "success",
    });

    return res.json({
      ok: true,
      confirmation_sent_at: confirmationTime,
    });
  } catch (e: any) {
    console.error("bookingConfirm error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
