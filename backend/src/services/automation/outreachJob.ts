// Outreach Automation Background Job
//
// Runs every 15 minutes. Checks leads against enabled automation rules
// and logs outreach activity to the outreach_activity_log table.
//
// NOTE: Currently logs activity as "queued". Actual message dispatch
// requires integration with the messaging service (Twilio/Postmark).
// To enable sending: import sendSms / sendEmail and call after insert.

import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const JOB_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

type AutomationRule = {
  client_id: string;
  rule_type: string;
  enabled: boolean;
  channel: string;
  delay_hours: number;
  use_ai_message: boolean;
  custom_message: string | null;
};

// ── Rule processors ───────────────────────────────────────────────────────────

async function processFollowUp(
  clientId: string,
  rule: AutomationRule
): Promise<void> {
  const cutoff = new Date(
    Date.now() - rule.delay_hours * 60 * 60 * 1000
  ).toISOString();
  const recentCutoff = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, name")
    .eq("client_id", clientId)
    .eq("status", "new")
    .lt("created_at", cutoff)
    .limit(20);

  if (!leads?.length) return;

  for (const lead of leads) {
    const { data: recent } = await supabaseAdmin
      .from("outreach_activity_log")
      .select("id")
      .eq("client_id", clientId)
      .eq("lead_id", lead.id)
      .eq("rule_type", "followup")
      .gte("created_at", recentCutoff)
      .limit(1);

    if (recent?.length) continue;

    await supabaseAdmin.from("outreach_activity_log").insert({
      client_id: clientId,
      lead_id: lead.id,
      rule_type: "followup",
      channel: rule.channel,
      message_preview:
        rule.custom_message?.slice(0, 120) ??
        `Follow-up to ${lead.name ?? "new lead"}`,
      status: "queued",
    });
  }
}

async function processReminder(
  clientId: string,
  rule: AutomationRule
): Promise<void> {
  const windowStart = new Date(
    Date.now() + rule.delay_hours * 60 * 60 * 1000
  ).toISOString();
  const windowEnd = new Date(
    Date.now() + (rule.delay_hours + 1) * 60 * 60 * 1000
  ).toISOString();
  const recentCutoff = new Date(
    Date.now() - 2 * 60 * 60 * 1000
  ).toISOString();

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, lead_id, service_type")
    .eq("client_id", clientId)
    .eq("status", "confirmed")
    .gte("start_time", windowStart)
    .lt("start_time", windowEnd)
    .limit(20);

  if (!bookings?.length) return;

  for (const booking of bookings) {
    if (!booking.lead_id) continue;

    const { data: recent } = await supabaseAdmin
      .from("outreach_activity_log")
      .select("id")
      .eq("client_id", clientId)
      .eq("lead_id", booking.lead_id)
      .eq("rule_type", "reminder")
      .gte("created_at", recentCutoff)
      .limit(1);

    if (recent?.length) continue;

    await supabaseAdmin.from("outreach_activity_log").insert({
      client_id: clientId,
      lead_id: booking.lead_id,
      rule_type: "reminder",
      channel: rule.channel,
      message_preview: `Reminder: upcoming ${booking.service_type ?? "appointment"}`,
      status: "queued",
    });
  }
}

async function processReengagement(
  clientId: string,
  rule: AutomationRule
): Promise<void> {
  const cutoff = new Date(
    Date.now() - rule.delay_hours * 60 * 60 * 1000
  ).toISOString();
  const recentCutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, name")
    .eq("client_id", clientId)
    .eq("status", "stalled")
    .lt("updated_at", cutoff)
    .limit(20);

  if (!leads?.length) return;

  for (const lead of leads) {
    const { data: recent } = await supabaseAdmin
      .from("outreach_activity_log")
      .select("id")
      .eq("client_id", clientId)
      .eq("lead_id", lead.id)
      .eq("rule_type", "reengagement")
      .gte("created_at", recentCutoff)
      .limit(1);

    if (recent?.length) continue;

    await supabaseAdmin.from("outreach_activity_log").insert({
      client_id: clientId,
      lead_id: lead.id,
      rule_type: "reengagement",
      channel: rule.channel,
      message_preview:
        rule.custom_message?.slice(0, 120) ??
        `Re-engagement message for ${lead.name ?? "lead"}`,
      status: "queued",
    });
  }
}

async function processThankYou(
  clientId: string,
  rule: AutomationRule
): Promise<void> {
  const cutoff = new Date(
    Date.now() - rule.delay_hours * 60 * 60 * 1000
  ).toISOString();
  const recentWindow = new Date(
    Date.now() - (rule.delay_hours + 1) * 60 * 60 * 1000
  ).toISOString();
  const recentCutoff = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, lead_id, service_type")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .gte("updated_at", recentWindow)
    .lt("updated_at", cutoff)
    .limit(20);

  if (!bookings?.length) return;

  for (const booking of bookings) {
    if (!booking.lead_id) continue;

    const { data: recent } = await supabaseAdmin
      .from("outreach_activity_log")
      .select("id")
      .eq("client_id", clientId)
      .eq("lead_id", booking.lead_id)
      .eq("rule_type", "thankyou")
      .gte("created_at", recentCutoff)
      .limit(1);

    if (recent?.length) continue;

    await supabaseAdmin.from("outreach_activity_log").insert({
      client_id: clientId,
      lead_id: booking.lead_id,
      rule_type: "thankyou",
      channel: rule.channel,
      message_preview: `Thank you for your ${booking.service_type ?? "appointment"}!`,
      status: "queued",
    });
  }
}

// ── Main job runner ───────────────────────────────────────────────────────────

async function runOutreachJob(): Promise<void> {
  try {
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id")
      .limit(100);

    if (!clients?.length) return;

    for (const client of clients) {
      const { data: rules } = await supabaseAdmin
        .from("automation_rules")
        .select("*")
        .eq("client_id", client.id)
        .eq("enabled", true);

      if (!rules?.length) continue;

      for (const rule of rules as AutomationRule[]) {
        try {
          switch (rule.rule_type) {
            case "followup":
              await processFollowUp(client.id, rule);
              break;
            case "reminder":
              await processReminder(client.id, rule);
              break;
            case "reengagement":
              await processReengagement(client.id, rule);
              break;
            case "thankyou":
              await processThankYou(client.id, rule);
              break;
            // promo and review require additional business logic
          }
        } catch (ruleErr: any) {
          console.error(
            `[OutreachJob] Rule ${rule.rule_type} failed for client ${client.id}:`,
            ruleErr?.message
          );
        }
      }
    }
  } catch (err: any) {
    // Silently skip if tables don't exist yet
    if (!err?.message?.includes("does not exist")) {
      console.error("[OutreachJob] Job error:", err?.message);
    }
  }
}

// ── Public starter ────────────────────────────────────────────────────────────

export function startOutreachJob(): void {
  console.log(
    "[OutreachJob] Starting outreach automation (15-min interval)"
  );
  // Delay first run by 2 minutes to let the server fully initialize
  setTimeout(() => {
    void runOutreachJob();
    setInterval(() => void runOutreachJob(), JOB_INTERVAL_MS);
  }, 2 * 60 * 1000);
}
