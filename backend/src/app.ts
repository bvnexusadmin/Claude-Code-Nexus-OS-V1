// src/app.ts
import express from "express";
import cors from "cors";

/* =====================
   INTERNAL ROUTES
   ===================== */
import adminLeadUpdate from "./routes/internal/adminLeadUpdate.js";
import debugBookRoutes from "./routes/internal/debugBook.js";
import bookingConfirmRoutes from "./routes/internal/bookingConfirm.js";
import calendarTestRoutes from "./routes/internal/calendarTest.js";
import emailTestRoutes from "./routes/internal/emailTest.js";
import followUpTestRoutes from "./routes/internal/followUpTest.js";
import conversationTestRoutes from "./routes/internal/conversationTest.js";
import conversationRoutes from "./routes/internal/conversation.js";
import emailRoutes from "./routes/internal/email.js";
import aiSuggestRoutes from "./routes/internal/aiSuggest.js";
import askNexusRoutes from "./routes/internal/askNexus.js";
import analyticsAiAdvisorRoutes from "./routes/internal/analyticsAiAdvisor.js";
import automationRulesRoutes from "./routes/internal/automationRules.js";
import meRoutes from "./routes/internal/me.js";

/* =====================
   AUTH (EMAIL/PASSWORD ONLY)
   ===================== */
import authRoutes from "./routes/auth.js";

/* =====================
   WEBHOOKS
   ===================== */
import smsWebhook from "./routes/webhooks/sms.js";
import vapiWebhook from "./routes/webhooks/vapi.js";
import automationWebhook from "./routes/webhooks/automation.js";
import emailWebhook from "./routes/webhooks/email.js";

/* =====================
   MIDDLEWARE / UTILS
   ===================== */
import { loadUser } from "./middleware/auth.js";
import { loadTenantContext } from "./middleware/loadTenantContext.js";
import { createSupabaseUserClient } from "./utils/supabaseUser.js";
import { supabaseAdmin } from "./utils/supabaseAdmin.js";
import { resolveVoiceTenant } from "./services/voice/resolveVoiceTenant.js";

const app = express();

/* =====================================================
   CORS — MUST BE FIRST
   ===================================================== */
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-nexus-client-id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

/* =====================================================
   ROOT SMS FALLBACK (SAFE)
   ===================================================== */
app.post("/", (req, res, next) => {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    req.url = "/webhooks/sms";
    return next();
  }
  return res.status(404).send("Not Found");
});

/* =====================================================
   WEBHOOKS — BEFORE BODY PARSERS
   ===================================================== */
app.use("/webhooks", smsWebhook);
app.use("/webhooks", vapiWebhook);
app.use("/webhooks", automationWebhook);
app.use("/webhooks", emailWebhook);

/* =====================================================
   BODY PARSERS (NON-WEBHOOK)
   ===================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* =====================================================
   INTERNAL ROUTES
   ===================================================== */
app.use("/internal", meRoutes); // ✅ ADD (canonical identity)
app.use("/internal", adminLeadUpdate);
app.use("/internal", debugBookRoutes);
app.use("/internal", bookingConfirmRoutes);
app.use("/internal", calendarTestRoutes);
app.use("/internal/email", emailRoutes);
app.use("/internal", emailTestRoutes);
app.use("/internal", followUpTestRoutes);
app.use("/internal", conversationTestRoutes);
app.use("/internal", conversationRoutes);
app.use("/internal", aiSuggestRoutes);
app.use("/internal", askNexusRoutes);
app.use("/internal", analyticsAiAdvisorRoutes);
app.use("/internal", automationRulesRoutes);

/* =====================================================
   AUTH
   ===================================================== */
app.use("/auth", authRoutes);

/* =====================================================
   TENANT ROUTES
   ===================================================== */
app.get("/leads", loadUser, loadTenantContext, async (req: any, res) => {
  const supabase = createSupabaseUserClient(req.user.token);
  const { data, error } = await supabase.from("leads").select("*");

  if (error) {
    return res.status(403).json({ error: error.message });
  }

  return res.json({
    client: req.ctx.client.name,
    lead_count: data.length,
    leads: data,
  });
});

/* =====================================================
   HEALTH
   ===================================================== */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(500).json({ status: "error", error: error.message });
    }

    return res.json({ status: "ok", sample: data });
  } catch (err: any) {
    return res.status(500).json({ status: "crash", error: err.message });
  }
});

/* =====================================================
   DEBUG
   ===================================================== */
app.get("/debug/resolve-voice-tenant", async (req, res) => {
  try {
    const toNumber = String(req.query.to ?? "");
    const result = await resolveVoiceTenant({ toNumber });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default app;