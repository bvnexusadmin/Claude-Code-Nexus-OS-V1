import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

/**
 * Dumb voice executor.
 * Converts queued text into spoken voice via Vapi.
 * No intelligence. No routing. No retries.
 */
export async function executeVoiceMessage(args: {
  client_id: string;
  call_id: string;
  text: string;
}) {
  const { client_id, call_id, text } = args;

  if (!text) return;

  // Look up Vapi assistant for this client
  const { data, error } = await supabaseAdmin
    .from("client_integrations")
    .select("vapi_assistant_id")
    .eq("client_id", client_id)
    .single();

  if (error || !data?.vapi_assistant_id) {
    throw new Error("Missing vapi_assistant_id for client");
  }

  const assistantId = data.vapi_assistant_id;

  if (!process.env.VAPI_API_KEY) {
    throw new Error("Missing VAPI_API_KEY in environment");
  }

  // Call Vapi to speak the text
  const resp = await fetch(`https://api.vapi.ai/calls/${call_id}/say`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      text,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Vapi say failed: ${resp.status} ${resp.statusText}`);
  }
}
