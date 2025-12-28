import express from "express";

import authRoutes from "./routes/auth.js";
import smsWebhook from "./routes/webhooks/sms.js";
import conversationTestRoutes from "./routes/internal/conversationTest.js";

import { loadUser } from "./middleware/auth.js";
import { loadTenantContext } from "./middleware/loadTenantContext.js";

import { createSupabaseUserClient } from "./utils/supabaseUser.js";
import { supabaseAdmin } from "./utils/supabaseAdmin.js";

const app = express();

/* =====================================================
   BODY PARSERS (REQUIRED FOR TWILIO)
   ===================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* =====================================================
   WEBHOOKS (INGESTION)
   ===================================================== */
app.use("/webhooks", smsWebhook);

/* =====================================================
   INTERNAL / DEV ROUTES (SAFE, NO TWILIO)
   ===================================================== */
app.use("/internal", conversationTestRoutes);

/* =====================================================
   BASIC HEALTH CHECK (NO SUPABASE)
   ===================================================== */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* =====================================================
   SUPABASE CONNECTIVITY CHECK (ADMIN / SERVICE ROLE)
   ===================================================== */
app.get("/health/db", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(500).json({
        status: "error",
        error: error.message,
      });
    }

    return res.json({
      status: "ok",
      sample: data,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: "crash",
      error: err.message,
    });
  }
});

/* =====================================================
   AUTH ROUTES
   ===================================================== */
app.use("/auth", authRoutes);

/* =====================================================
   TENANT-PROTECTED ROUTES (PHASE 2)
   ===================================================== */
app.get(
  "/leads",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const supabase = createSupabaseUserClient(req.user.token);

    const { data, error } = await supabase
      .from("leads")
      .select("*");

    if (error) {
      return res.status(403).json({
        error: error.message,
      });
    }

    return res.json({
      client: req.ctx.client.name,
      lead_count: data.length,
      leads: data,
    });
  }
);

export default app;
