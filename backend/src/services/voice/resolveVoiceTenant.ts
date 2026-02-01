import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

type ResolveArgs = {
  /**
   * Twilio / Vapi "To" number (E.164), e.g. +17205551234
   */
  toNumber?: string;

  /**
   * Optional Vapi assistant id
   */
  vapiAssistantId?: string;
};

export async function resolveVoiceTenant(
  args: ResolveArgs
): Promise<{ client_id: string }> {
  const to = normalizeE164(args.toNumber);
  const assistantId = args.vapiAssistantId?.trim() || null;

  if (!to && !assistantId) {
    throw new Error("resolveVoiceTenant: missing toNumber and vapiAssistantId");
  }

  // 🔍 DEBUG VISIBILITY (SAFE)
  console.log("🔎 resolveVoiceTenant", {
    to,
    assistantId,
  });

  // --------------------------------------------------
  // 1️⃣ PRIMARY: resolve by Twilio number (deterministic)
  // --------------------------------------------------
  if (to) {
    const { data, error } = await supabaseAdmin
      .from("client_integrations")
      .select("client_id")
      .eq("twilio_number", to)
      .maybeSingle();

    if (error) {
      throw new Error(`resolveVoiceTenant: supabase error: ${error.message}`);
    }

    if (!data?.client_id) {
      throw new Error(`resolveVoiceTenant: no client for twilio_number=${to}`);
    }

    return { client_id: data.client_id };
  }

  // --------------------------------------------------
  // 2️⃣ FALLBACK: resolve by Vapi assistant id
  // --------------------------------------------------
  const { data, error } = await supabaseAdmin
    .from("client_integrations")
    .select("client_id")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveVoiceTenant: supabase error: ${error.message}`);
  }

  if (!data?.client_id) {
    throw new Error(
      `resolveVoiceTenant: no client for vapi_assistant_id=${assistantId}`
    );
  }

  return { client_id: data.client_id };
}

/**
 * Normalize to strict E.164
 * - Preserve valid +E164
 * - Normalize digits only when needed
 */
function normalizeE164(input?: string): string | null {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Already valid E.164
  if (/^\+\d{10,15}$/.test(raw)) {
    return raw;
  }

  // Strip non-digits
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  // US default
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}
