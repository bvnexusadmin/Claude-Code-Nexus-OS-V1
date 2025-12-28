import twilio from "twilio";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const accountSid = mustGetEnv("TWILIO_ACCOUNT_SID");
const authToken = mustGetEnv("TWILIO_AUTH_TOKEN");
const defaultFrom = mustGetEnv("TWILIO_DEFAULT_FROM");

const client = twilio(accountSid, authToken);

export type SmsSendResult = {
  sid: string | null;
  status:
    | "queued"
    | "sent"
    | "failed"
    | "blocked_carrier"
    | "unknown";
  to: string;
  from: string;
  error_code?: number;
  error_message?: string;
};

export async function sendSms({
  to,
  body,
  from,
  dryRun = false,
}: {
  to: string;
  body: string;
  from?: string;
  dryRun?: boolean;
}): Promise<SmsSendResult> {
  const resolvedFrom = from ?? defaultFrom;

  // ---- DRY RUN (used while A2P is pending) ----
  if (dryRun) {
    return {
      sid: null,
      status: "queued",
      to,
      from: resolvedFrom,
    };
  }

  try {
    const msg = await client.messages.create({
      to,
      from: resolvedFrom,
      body,
    });

    return {
      sid: msg.sid,
      status: (msg.status as SmsSendResult["status"]) ?? "unknown",
      to: msg.to!,
      from: msg.from!,
      error_code: msg.errorCode ?? undefined,
      error_message: msg.errorMessage ?? undefined,
    };
  } catch (err: any) {
    // ---- CRITICAL GUARDRAIL ----
    // Twilio A2P block (30034)
    if (err?.code === 30034) {
      return {
        sid: null,
        status: "blocked_carrier",
        to,
        from: resolvedFrom,
        error_code: 30034,
        error_message: err.message,
      };
    }

    // Other Twilio failures
    return {
      sid: null,
      status: "failed",
      to,
      from: resolvedFrom,
      error_code: err?.code,
      error_message: err?.message ?? "Unknown Twilio error",
    };
  }
}
