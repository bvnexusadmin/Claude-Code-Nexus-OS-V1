import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

router.post("/automation", async (req, res) => {
  /* ------------------------------------------------------------
     🔒 Nexus automation secret guard
     ------------------------------------------------------------ */
  const secret = req.headers["x-nexus-secret"];

  if (secret !== process.env.NEXUS_AUTOMATION_SECRET) {
    console.error("❌ Invalid or missing Nexus automation secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("⚙️ AUTOMATION WEBHOOK HIT");
    console.log("RAW BODY:", req.body);

    const { client_id, event, payload } = req.body;

    if (!client_id || !event) {
      console.error("❌ Missing required automation fields");
      return res.status(400).json({ error: "Invalid automation payload" });
    }

    /* ------------------------------------------------------------
       1️⃣ VALIDATE TENANT (NON-NEGOTIABLE)
       ------------------------------------------------------------ */
    const { data: client, error: clientErr } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      console.error("❌ INVALID CLIENT_ID:", client_id);
      return res.status(404).json({ error: "Unknown client_id" });
    }

    /* ------------------------------------------------------------
       2️⃣ Persist automation action (audit / intelligence layer)
       ------------------------------------------------------------ */
    const { data: action, error: actionErr } = await supabaseAdmin
      .from("ai_actions")
      .insert({
        client_id,
        agent_name: "n8n",
        action_type: event,
        payload: payload ?? {},
      })
      .select("id")
      .single();

    if (actionErr) {
      console.error("❌ AI ACTION INSERT ERROR:", actionErr);
      throw actionErr;
    }

    /* ------------------------------------------------------------
       3️⃣ Default system message (always written)
       ------------------------------------------------------------ */
    const { error: systemMsgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        client_id,
        direction: "internal",
        channel: "system",
        sender_type: "system",
        content: `[${event}] automation received`,
      });

    if (systemMsgErr) {
      console.error("❌ SYSTEM MESSAGE INSERT ERROR:", systemMsgErr);
      throw systemMsgErr;
    }

    /* ------------------------------------------------------------
       4️⃣ BEHAVIOR: automation-driven follow-up (TEST EVENT)
       ------------------------------------------------------------ */
    if (event === "automation.followup.test") {
      const followupText =
        payload?.message ??
        "Hey! Just checking in — let me know if you’d like to move forward or have any questions.";

      const { error: followupErr } = await supabaseAdmin
        .from("messages")
        .insert({
          client_id,
          direction: "outbound",
          channel: "sms",
          sender_type: "ai",
          content: followupText,
        });

      if (followupErr) {
        console.error("❌ FOLLOW-UP MESSAGE INSERT ERROR:", followupErr);
        throw followupErr;
      }

      console.log("📤 Automation follow-up message created");
    }

    console.log("✅ Automation event validated + acted");

    return res.status(200).json({
      ok: true,
      action_id: action.id,
      behavior_executed: event === "automation.followup.test",
    });
  } catch (err: any) {
    console.error("❌ AUTOMATION WEBHOOK ERROR", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
