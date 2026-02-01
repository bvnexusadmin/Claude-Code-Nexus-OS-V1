import express from "express";
import crypto from "crypto";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { resolveVoiceTenant } from "../../services/voice/resolveVoiceTenant.js";
import { eventBus } from "../../services/events/eventBus.js";

const router = express.Router();

/**
 * VAPI VOICE WEBHOOK (HARDENED)
 * - Always returns 200
 * - Supports BOTH payload shapes:
 *    1) { type, call, artifact, ... }
 *    2) { message: { type, call, artifact, ... } }
 * - Inserts transcript turns into `messages` with channel='voice'
 * - Enforces canonical message contract (topic, sender_type, lead_id)
 * - Dedupes repeated transcript snapshots
 */

function normalizePhone(raw: any): string | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/[()\s-]/g, "");
  if (cleaned.startsWith("+") && cleaned.length >= 10) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+1${cleaned}`;
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (cleaned.length >= 10) return cleaned;
  return null;
}

function pickFirst<T>(...vals: T[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return null;
}

function extractText(msg: any): string | null {
  if (!msg) return null;

  if (typeof msg.content === "string" && msg.content.trim()) return msg.content.trim();
  if (typeof msg.text === "string" && msg.text.trim()) return msg.text.trim();

  if (Array.isArray(msg.content)) {
    const parts: string[] = [];
    for (const p of msg.content) {
      if (!p) continue;
      if (typeof p === "string" && p.trim()) parts.push(p.trim());
      else if (typeof p.text === "string" && p.text.trim()) parts.push(p.text.trim());
      else if (typeof p.content === "string" && p.content.trim()) parts.push(p.content.trim());
    }
    const joined = parts.join(" ").trim();
    if (joined) return joined;
  }

  if (typeof msg.message === "string" && msg.message.trim()) return msg.message.trim();
  return null;
}

function extractTranscriptMessages(root: any): any[] {
  const candidates = [
    root?.artifact?.messages,
    root?.artifact?.transcript?.messages,
    root?.artifact?.conversation?.messages,
    root?.conversation?.messages,
    root?.messages,
    root?.messagesOnAIFormatted,
    root?.transcript?.messages,
    root?.transcript,
  ];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  return [];
}

router.post(
  "/vapi",
  express.json(), // ✅ webhook owns JSON parsing
  async (req, res) => {
    const startedAt = Date.now();

    try {
      const payload = req.body ?? {};
      const root = payload?.message ?? payload;

      const eventType =
        root?.type ??
        root?.eventType ??
        root?.artifact?.type ??
        root?.event?.type ??
        "unknown";

      const callId = pickFirst(
        root?.call?.id,
        root?.artifact?.call?.id,
        root?.artifact?.callId,
        root?.callId,
        root?.traceId,
        root?.artifact?.traceId,
        root?.call?.callId
      );

      const toNumberRaw = pickFirst(
        root?.phoneNumber?.number,
        root?.call?.to,
        root?.artifact?.phoneNumber?.number,
        root?.to,
        root?.call?.toNumber,
        root?.destination?.number
      );

      const fromNumberRaw = pickFirst(
        root?.customer?.number,
        root?.call?.from,
        root?.from,
        root?.call?.fromNumber,
        root?.caller?.number
      );

      const toNumber = normalizePhone(toNumberRaw);
      const fromNumber = normalizePhone(fromNumberRaw);

      console.log("🔥 VAPI WEBHOOK HIT", {
        eventType,
        wrapped: Boolean(payload?.message),
        hasCallId: Boolean(callId),
        hasToNumber: Boolean(toNumber),
        hasFromNumber: Boolean(fromNumber),
        ms: Date.now() - startedAt,
        rawTo: toNumberRaw,
        rawFrom: fromNumberRaw,
      });

      // ----------------------------------------------------
      // 🚦 EVENT GATING — IGNORE PARTIAL SPEECH UPDATES
      // ----------------------------------------------------
      const ALLOWED_TRANSCRIPT_EVENTS = new Set(["conversation-update", "conversation.completed"]);
      if (!ALLOWED_TRANSCRIPT_EVENTS.has(eventType)) {
        console.log("⏭️ Skipping non-final Vapi event:", eventType);
        return res.status(200).json({ ok: true });
      }

      if (!callId || !toNumber || !fromNumber) {
        console.warn("⚠️ Ignored Vapi event (missing identifiers)", {
          eventType,
          hasCallId: Boolean(callId),
          hasToNumber: Boolean(toNumber),
          hasFromNumber: Boolean(fromNumber),
        });
        return res.status(200).json({ ok: true });
      }

      // ----------------------------------------------------
      // Resolve tenant
      // ----------------------------------------------------
      let client_id: string;
      try {
        const resolved = await resolveVoiceTenant({ toNumber });
        client_id = resolved.client_id;
      } catch (err) {
        console.error("❌ Tenant resolution failed", { toNumber, err });
        return res.status(200).json({ ok: true });
      }

      // ----------------------------------------------------
      // Resolve or create lead (CRITICAL FOR UI)
      // ----------------------------------------------------
      const { data: lead, error: leadLookupErr } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("client_id", client_id)
        .eq("phone", fromNumber)
        .maybeSingle();

      if (leadLookupErr) {
        console.error("❌ Lead lookup failed:", leadLookupErr);
        return res.status(200).json({ ok: true });
      }

      let lead_id: string;

      if (lead?.id) {
        lead_id = lead.id;
      } else {
        const { data: newLead, error: leadCreateErr } = await supabaseAdmin
          .from("leads")
          .insert({
            client_id,
            phone: fromNumber,
            source: "voice",
            stage: "new",
          })
          .select("id")
          .single();

        if (leadCreateErr || !newLead?.id) {
          console.error("❌ Lead create failed:", leadCreateErr);
          return res.status(200).json({ ok: true });
        }

        lead_id = newLead.id;
      }

      // ----------------------------------------------------
      // call_logs upsert (independent of messages)
      // ----------------------------------------------------
      try {
        const { error } = await supabaseAdmin.from("call_logs").upsert(
          {
            client_id,
            vapi_call_id: callId,
            from_number: fromNumber,
            to_number: toNumber,
            status: eventType,
          },
          { onConflict: "vapi_call_id" }
        );
        if (error) console.error("❌ call_logs upsert failed:", error);
      } catch (err) {
        console.error("❌ call_logs upsert crashed:", err);
      }

      // ----------------------------------------------------
      // transcript messages
      // ----------------------------------------------------
      const transcriptMessages = extractTranscriptMessages(root);
      if (!Array.isArray(transcriptMessages) || transcriptMessages.length === 0) {
        console.log("ℹ️ No transcript messages on this event", { eventType, callId });
        return res.status(200).json({ ok: true });
      }

      console.log("🧠 Transcript messages found:", transcriptMessages.length);

      for (const msg of transcriptMessages) {
        const text = extractText(msg);
        if (!text) continue;

        const role = (msg?.role ?? msg?.sender ?? msg?.type ?? "user").toString().toLowerCase();

        let sender_type: "user" | "ai" | "system";
        if (role === "assistant" || role === "ai") sender_type = "ai";
        else if (role === "system") sender_type = "system";
        else sender_type = "user";

        const direction = sender_type === "user" ? "inbound" : "outbound";

        // ----------------------------------------------------
        // 🔁 DEDUPE: same call + same sender + same content
        // ----------------------------------------------------
        const { data: existing } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("client_id", client_id)
          .eq("lead_id", lead_id)
          .eq("channel", "voice")
          .eq("sender_type", sender_type)
          .eq("content", text)
          .eq("payload->>vapi_call_id", callId)
          .limit(1);

        if (existing && existing.length > 0) continue;

        try {
          const { error } = await supabaseAdmin.from("messages").insert({
            client_id,
            lead_id,
            channel: "voice",
            direction,
            sender_type,
            content: text,
            topic: "conversation",
            event: "voice.message",
            payload: {
              vapi_call_id: callId,
              eventType,
              to: toNumber,
              from: fromNumber,
              raw: msg,
            },
          });

          if (error) {
            console.error("❌ messages insert failed:", {
              error,
              sender_type,
              preview: text.slice(0, 80),
            });
          } else {
            console.log("✅ inserted message:", sender_type, text.slice(0, 80));
          }
        } catch (err) {
          console.error("❌ messages insert crashed:", err);
        }

        // Emit inbound events only for user speech
        if (sender_type === "user") {
          try {
            await eventBus.emitEvent({
              event_id: crypto.randomUUID(),
              trace_id: callId,
              event_type: "message.received",
              client_id,
              payload: { channel: "voice", text, toNumber, fromNumber },
            });
          } catch (err) {
            console.error("❌ eventBus emit failed:", err);
          }
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("💥 vapi webhook crash:", err);
      return res.status(200).json({ ok: true });
    }
  }
);

export default router;
