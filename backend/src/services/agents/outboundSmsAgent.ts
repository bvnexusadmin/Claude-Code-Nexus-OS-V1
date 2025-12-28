import crypto from "node:crypto";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { sendSms } from "../messaging/twilioSmsSender.js";

export type OutboundSmsInput = {
  client_id: string;
  to_phone: string;
  body: string;
  trace_id?: string;
  dry_run?: boolean; // default true while A2P pending
};

export async function outboundSmsAgent(input: OutboundSmsInput) {
  // ----------------------------
  // 0) Validate input
  // ----------------------------
  if (!input.client_id) throw new Error("outboundSmsAgent called without client_id");
  if (!input.to_phone) throw new Error("outboundSmsAgent called without to_phone");
  if (!input.body) throw new Error("outboundSmsAgent called without body");

  const traceId = input.trace_id ?? crypto.randomUUID();
  const dryRun = input.dry_run ?? true; // TEMP default until A2P is approved

  // ----------------------------
  // 1) Resolve or create lead (FK-safe)
  // ----------------------------
  const { data: existingLead, error: leadLookupErr } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("client_id", input.client_id)
    .eq("phone", input.to_phone)
    .maybeSingle();

  if (leadLookupErr) {
    throw new Error(`Lead lookup failed: ${leadLookupErr.message}`);
  }

  let lead_id: string;

  if (existingLead?.id) {
    lead_id = existingLead.id;
  } else {
    const { data: newLead, error: leadCreateErr } = await supabaseAdmin
      .from("leads")
      .insert({
        client_id: input.client_id,
        phone: input.to_phone,
        source: "sms",
      })
      .select("id")
      .single();

    if (leadCreateErr || !newLead?.id) {
      throw new Error(
        `Failed to resolve or create lead: ${leadCreateErr?.message ?? "unknown"}`
      );
    }

    lead_id = newLead.id;
  }

  // ----------------------------
  // 2) Send SMS (guarded; dry-run until A2P clears)
  // ----------------------------
  const result = await sendSms({
    to: input.to_phone,
    body: input.body,
    dryRun,
  });

  // ----------------------------
  // 3) Persist outbound message
  // IMPORTANT: Your messages table DOES NOT have `status`.
  // It DOES have: event, source, raw_payload, external_id, from_number, to_number, etc.
  // We store delivery state in `event` and details in `raw_payload`.
  // ----------------------------
  const outboundRow = {
    client_id: input.client_id,
    lead_id,
    direction: "outbound",
    channel: "sms",
    sender_type: "ai",
    content: input.body,
    trace_id: traceId,

    // delivery / transport metadata
    event: result.status, // "queued" | "blocked_carrier" | "failed" | ...
    source: "twilio",
    to_number: input.to_phone,
    from_number: result.from,
    external_id: result.sid,

    // full debug context for later UI + audits
    raw_payload: {
      dry_run: dryRun,
      twilio_status: result.status,
      twilio_sid: result.sid,
      to: result.to,
      from: result.from,
      error_code: result.error_code,
      error_message: result.error_message,
    },
  };

  const { error: msgError } = await supabaseAdmin.from("messages").insert(outboundRow);

  if (msgError) {
    throw new Error(`Failed to insert outbound message: ${msgError.message}`);
  }

  // ----------------------------
  // 4) AI action log (agent observability)
  // ----------------------------
  const actionType =
    result.status === "blocked_carrier"
      ? "outbound_sms_blocked_carrier"
      : result.status === "failed"
      ? "outbound_sms_failed"
      : "outbound_sms_sent";

  const { error: actionErr } = await supabaseAdmin.from("ai_actions").insert({
    client_id: input.client_id,
    lead_id,
    agent_name: "outboundSmsAgent",
    action_type: actionType,
    trace_id: traceId,
    payload: {
      to: input.to_phone,
      body_preview: input.body.slice(0, 140),
      dry_run: dryRun,
      twilio_sid: result.sid,
      twilio_status: result.status,
      error_code: result.error_code,
      error_message: result.error_message,
    },
  });

  if (actionErr) {
    throw new Error(`Failed to insert ai_action: ${actionErr.message}`);
  }

  // ----------------------------
  // 5) Return
  // ----------------------------
  return {
    ok: result.status !== "failed",
    sid: result.sid,
    status: result.status,
    dry_run: dryRun,
    trace_id: traceId,
    lead_id,
  };
}
