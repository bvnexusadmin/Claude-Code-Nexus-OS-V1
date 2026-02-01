import express from "express";
import { conversationManager } from "../../agents/conversationManager.js";

const router = express.Router();

/**
 * INTERNAL FOLLOW-UP TEST
 * Simulates a cron-triggered follow-up check.
 */
router.post("/test-follow-up", async (_req, res) => {
  try {
    const result = await conversationManager({
      client_id: "62137f9b-b1eb-4213-9423-f5715d3b9615",
      event: {
        type: "system.follow_up_check",
        channel: "system",
        occurred_at: new Date().toISOString(),
        raw: {
          last_outbound_at: "2025-01-01T00:00:00Z", // force stale
        },
      },
      lead: {
        id: "TEST_BOOKING_LEAD",
        phone: "+15555555555",
        stage: "booking",
      },
      recent_messages: [
        {
          direction: "outbound",
          content: "Here are some available times...",
        },
      ],
    });

    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
