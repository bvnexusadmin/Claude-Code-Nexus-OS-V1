// src/routes/internal/conversationTest.ts

import express from "express";
import { conversationManager } from "../../agents/conversationManager.js";
import { executePlan } from "../../services/execution/planExecutor.js";

const router = express.Router();

/**
 * INTERNAL TEST ENDPOINT
 * ----------------------
 * - No Twilio
 * - No DB writes
 * - Safe to remove later
 */
router.post("/test/conversation", async (req, res) => {
  try {
    const input = req.body;

    // Run Agent 7 (decision-only)
    const decision = conversationManager(input);

    if (!decision.ok || !decision.data) {
      return res.status(500).json({
        ok: false,
        error: decision.error,
      });
    }

    // Execute plan with SAFE capabilities
    const execution = await executePlan({
      plan: decision.data,
      ctx: {
        client_id: input.client_id,
        lead_id: input.lead?.id,
      },
      caps: {
        sms_delivery: false,
        db_writes: false,
      },
    });

    return res.json({
      ok: true,
      decision,
      execution,
    });
  } catch (err: any) {
    console.error("[TEST ROUTE ERROR]", err);
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unknown error",
    });
  }
});

export default router;
