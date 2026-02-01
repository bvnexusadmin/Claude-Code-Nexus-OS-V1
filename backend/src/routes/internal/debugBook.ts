import express from "express";
import { bookingService } from "../../services/booking/bookingService.js";

const router = express.Router();

/**
 * TEMP DEBUG ROUTE — DELETE AFTER VERIFICATION
 * This bypasses conversation + agents.
 */
router.post("/debug/book", async (req, res) => {
  try {
    const {
      client_id,
      lead_id,
      service_type,
      start_time,
      end_time,
    } = req.body;

    const booking = await bookingService.createPendingBooking({
      client_id,
      lead_id,
      service_type,
      start_time,
      end_time,
      timezone: "America/Denver",
      source: "ui",
      created_by: "human",
    });

    const confirmed = await bookingService.confirmBooking(booking.id);

    res.json({
      ok: true,
      booking: confirmed,
    });
  } catch (err: any) {
    console.error("❌ debug booking error:", err);
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
