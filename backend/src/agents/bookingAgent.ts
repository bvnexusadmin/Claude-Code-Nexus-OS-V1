// src/agents/bookingAgent.ts
// Decision-aware Booking Agent (post-Phase 3): proposes slots + returns booking intent.
// Reads Supabase bookings to avoid conflicts.
// ALSO reads Google Calendar FreeBusy (via stored OAuth tokens) to avoid conflicts with bookings created outside Nexus.
// Does NOT write to Google Calendar yet.
// No side effects besides (optional) token refresh persistence in client_integrations.

import { supabaseAdmin } from "../utils/supabaseAdmin.js";
import { getGoogleCalendarFreeBusy } from "../services/calendar/googleCalendarFreeBusy.js";
import { getValidGoogleCalendarAccess } from "../services/calendar/googleCalendarAuth.js";

export type BookingAgentName = "bookingAgent";

export type BookingActionType =
  | "propose_slots"
  | "confirm_slot"
  | "create_booking_intent"
  | "needs_more_info"
  | "cannot_book";

export type BookingIntentStatus = "draft" | "ready" | "blocked";

export type BookingRules = {
  minimumNoticeMinutes?: number;
  bufferMinutes?: number;
  defaultDurationMinutes?: number;
  proposeCount?: number;
  slotStepMinutes?: number;
};

export type BusinessHours = {
  [dayOfWeek: number]: Array<{ start: string; end: string }>;
};

export type ClientConfigForBooking = {
  timezone?: string;
  business_hours?: BusinessHours;
  services?: Array<{ name: string; duration_minutes?: number }>;
  booking_rules?: BookingRules;
};

export type AgentContext = {
  client_id: string;
  config: ClientConfigForBooking;
};

export type BookingAgentInput = {
  lead_id: string;
  service_type?: string;
  preference_text?: string;
  preferred_start_iso?: string;
  preferred_end_iso?: string;
  selected_slot?: { start_iso: string; end_iso: string };
};

export type ProposedSlot = {
  start_iso: string;
  end_iso: string;
  label: string;
};

export type BookingAgentResult = {
  ok: boolean;
  agent: BookingAgentName;
  action: BookingActionType;
  lead_id: string;
  client_id: string;
  service_type?: string;
  duration_minutes?: number;
  proposed_slots?: ProposedSlot[];
  intent?: {
    status: BookingIntentStatus;
    type: "booking";
    payload: {
      lead_id: string;
      service_type: string;
      duration_minutes: number;
      proposed_slots?: Array<{ start_iso: string; end_iso: string }>;
      selected_slot?: { start_iso: string; end_iso: string };
      notes?: string;
    };
  };
  next_message?: string;
  reasons?: string[];
  errors?: string[];
};

/* ============================== ENTRY ============================== */

export async function bookingAgent(
  ctx: AgentContext,
  input: BookingAgentInput
): Promise<BookingAgentResult> {
  const reasons: string[] = [];
  const errors: string[] = [];

  const timezone = ctx.config.timezone || "America/Denver";
  const rules = normalizeRules(ctx.config.booking_rules);
  const duration = resolveDurationMinutes(ctx.config, input.service_type, rules);

  if (!input.service_type) {
    reasons.push("service_type_missing");

    return {
      ok: true,
      agent: "bookingAgent",
      action: "needs_more_info",
      lead_id: input.lead_id,
      client_id: ctx.client_id,
      duration_minutes: duration,
      next_message:
        "What service are you looking to book, and what day/time works best for you?",
      reasons,
    };
  }

  // If user selected a slot, we produce an intent (still no calendar write here)
  if (input.selected_slot?.start_iso && input.selected_slot?.end_iso) {
    reasons.push("slot_selected");

    return {
      ok: true,
      agent: "bookingAgent",
      action: "create_booking_intent",
      lead_id: input.lead_id,
      client_id: ctx.client_id,
      service_type: input.service_type,
      duration_minutes: duration,
      intent: {
        status: "ready",
        type: "booking",
        payload: {
          lead_id: input.lead_id,
          service_type: input.service_type,
          duration_minutes: duration,
          selected_slot: input.selected_slot,
          notes: "Intent created from conflict-aware availability check.",
        },
      },
      next_message:
        "Perfect — I’ve got you down for that time. You’ll get a confirmation shortly.",
      reasons,
    };
  }

  const businessHours = ctx.config.business_hours;
  if (!businessHours || Object.keys(businessHours).length === 0) {
    reasons.push("business_hours_missing");
    errors.push("Missing client config: business_hours");

    return {
      ok: true,
      agent: "bookingAgent",
      action: "cannot_book",
      lead_id: input.lead_id,
      client_id: ctx.client_id,
      service_type: input.service_type,
      duration_minutes: duration,
      next_message:
        "I can book you, but business hours are not set yet. A human will follow up.",
      reasons,
      errors,
    };
  }

  const windowStart = resolveWindowStart(input, rules);
  const windowEnd = resolveWindowEnd(input);

  // 1) Internal bookings (Supabase)
  const internalBookings = await getExistingBookings(
    ctx.client_id,
    windowStart,
    windowEnd
  );

  // 2) External busy windows (Google Calendar) — if connected
  let googleBusy: Array<{ start: Date; end: Date }> = [];
  try {
    const { accessToken, calendarId } = await getValidGoogleCalendarAccess({
      client_id: ctx.client_id,
    });

    googleBusy = await getGoogleCalendarFreeBusy({
      accessToken,
      calendarId,
      timeMin: windowStart,
      timeMax: windowEnd,
    });

    reasons.push("google_calendar_checked");
  } catch (e: any) {
    // Not fatal. If not connected, we just fall back to internal booking conflicts.
    reasons.push("google_calendar_not_connected_or_failed");
  }

  const rawSlots = proposeSlots({
    timezone,
    businessHours,
    windowStart,
    windowEnd,
    durationMinutes: duration,
    proposeCount: rules.proposeCount!,
    stepMinutes: rules.slotStepMinutes!,
    minimumNoticeMinutes: rules.minimumNoticeMinutes!,
  });

  // Apply both conflict filters
  const slots = rawSlots.filter((slot) => {
    const s = new Date(slot.start_iso);
    const e = new Date(slot.end_iso);

    const internalConflict = internalBookings.some((b) =>
      overlaps(s, e, b.start, b.end)
    );

    const googleConflict = googleBusy.some((b) =>
      overlaps(s, e, b.start, b.end)
    );

    return !internalConflict && !googleConflict;
  });

  if (slots.length === 0) {
    reasons.push("no_available_slots");

    return {
      ok: true,
      agent: "bookingAgent",
      action: "cannot_book",
      lead_id: input.lead_id,
      client_id: ctx.client_id,
      service_type: input.service_type,
      duration_minutes: duration,
      next_message:
        "I don’t see any availability that works right now. What other times should I check?",
      reasons,
    };
  }

  reasons.push("slots_proposed");

  return {
    ok: true,
    agent: "bookingAgent",
    action: "propose_slots",
    lead_id: input.lead_id,
    client_id: ctx.client_id,
    service_type: input.service_type,
    duration_minutes: duration,
    proposed_slots: slots,
    intent: {
      status: "draft",
      type: "booking",
      payload: {
        lead_id: input.lead_id,
        service_type: input.service_type,
        duration_minutes: duration,
        proposed_slots: slots.map((s) => ({
          start_iso: s.start_iso,
          end_iso: s.end_iso,
        })),
        notes: "Conflict-aware draft booking intent (Supabase + Google FreeBusy).",
      },
    },
    next_message: formatSlotsMessage(slots),
    reasons,
    ...(errors.length ? { errors } : {}),
  };
}

/* ============================== SUPABASE ============================== */

async function getExistingBookings(
  client_id: string,
  windowStart: Date,
  windowEnd: Date
): Promise<Array<{ start: Date; end: Date }>> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("start_time, end_time, status")
    .eq("client_id", client_id)
    .in("status", ["pending", "confirmed"])
    .lte("start_time", windowEnd.toISOString())
    .gte("end_time", windowStart.toISOString());

  if (error) {
    console.error("❌ bookingAgent booking fetch error:", error.message);
    return [];
  }

  return (data ?? []).map((b) => ({
    start: new Date(b.start_time),
    end: new Date(b.end_time),
  }));
}

/* ============================== HELPERS ============================== */

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function normalizeRules(rules?: BookingRules): Required<BookingRules> {
  return {
    minimumNoticeMinutes: rules?.minimumNoticeMinutes ?? 120,
    bufferMinutes: rules?.bufferMinutes ?? 0,
    defaultDurationMinutes: rules?.defaultDurationMinutes ?? 60,
    proposeCount: rules?.proposeCount ?? 3,
    slotStepMinutes: rules?.slotStepMinutes ?? 30,
  };
}

function resolveDurationMinutes(
  config: ClientConfigForBooking,
  serviceType: string | undefined,
  rules: Required<BookingRules>
): number {
  if (!serviceType) return rules.defaultDurationMinutes;
  const svc = (config.services || []).find(
    (s) => s.name.trim().toLowerCase() === serviceType.trim().toLowerCase()
  );
  return svc?.duration_minutes ?? rules.defaultDurationMinutes;
}

function resolveWindowStart(
  input: BookingAgentInput,
  rules: Required<BookingRules>
): Date {
  const now = new Date();
  const minStart = addMinutes(now, rules.minimumNoticeMinutes);

  if (input.preferred_start_iso) {
    const d = new Date(input.preferred_start_iso);
    if (!isNaN(d.getTime())) return d > minStart ? d : minStart;
  }

  return minStart;
}

function resolveWindowEnd(input: BookingAgentInput): Date {
  if (input.preferred_end_iso) {
    const d = new Date(input.preferred_end_iso);
    if (!isNaN(d.getTime())) return d;
  }
  return addDays(new Date(), 14);
}

function proposeSlots(args: {
  timezone: string;
  businessHours: BusinessHours;
  windowStart: Date;
  windowEnd: Date;
  durationMinutes: number;
  proposeCount: number;
  stepMinutes: number;
  minimumNoticeMinutes: number;
}): ProposedSlot[] {
  const results: ProposedSlot[] = [];
  let cursor = new Date(args.windowStart);
  const hardStop = new Date(args.windowEnd);

  while (cursor <= hardStop && results.length < args.proposeCount) {
    const local = toZonedParts(cursor, args.timezone);
    const windows = args.businessHours[local.weekday] || [];

    let advanced = false;

    for (const w of windows) {
      if (results.length >= args.proposeCount) break;

      const ws = setLocalTimeFromDateISO(local.dateISO, args.timezone, w.start);
      const we = setLocalTimeFromDateISO(local.dateISO, args.timezone, w.end);

      const slotStart = cursor > ws ? cursor : ws;
      const slotEnd = addMinutes(slotStart, args.durationMinutes);

      if (slotEnd <= we && slotEnd <= hardStop) {
        results.push({
          start_iso: slotStart.toISOString(),
          end_iso: slotEnd.toISOString(),
          label: formatLocalLabel(slotStart, slotEnd, args.timezone),
        });

        cursor = addMinutes(slotStart, args.stepMinutes);
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      cursor = addMinutes(cursor, args.stepMinutes);
    }
  }

  return results;
}

function formatSlotsMessage(slots: ProposedSlot[]): string {
  return `Here are a few openings:\n${slots
    .map((s, i) => `${i + 1}) ${s.label}`)
    .join("\n")}\n\nReply with the number you want.`;
}

/* ============================== TIME UTILS ============================== */

function toZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value!;

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    weekday: weekdayMap[get("weekday")] ?? 0,
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

// NOTE: This function is intentionally simple. It matches your prior approach.
// It constructs a Date by round-tripping through Intl formatting in target TZ.
function setLocalTimeFromDateISO(
  dateISO: string,
  timeZone: string,
  hhmm: string
): Date {
  const _dp = dateISO.split("-").map(Number);
  const _tp = hhmm.split(":").map(Number);
  const y = _dp[0]!; const m = _dp[1]!; const d = _dp[2]!;
  const hh = _tp[0]!; const mm = _tp[1]!;

  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));

  const localStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(utcGuess);

  const _localParts = localStr.split(", ");
  const dp = _localParts[0]!; const tp = _localParts[1]!;
  const _yp = dp.split("-").map(Number);
  const _hp = tp.split(":").map(Number);
  const yy = _yp[0]!; const mm2 = _yp[1]!; const dd = _yp[2]!;
  const HH = _hp[0]!; const MM = _hp[1]!;

  return new Date(Date.UTC(yy, mm2 - 1, dd, HH, MM));
}

function formatLocalLabel(start: Date, end: Date, timeZone: string): string {
  const f1 = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const f2 = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });

  return `${f1.format(start)} – ${f2.format(end)}`;
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
