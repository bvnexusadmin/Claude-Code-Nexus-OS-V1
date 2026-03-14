// POST /internal/ask-nexus
// Conversational AI endpoint for the Ask Nexus workspace.
// Fetches live business data and injects it into the OpenAI system prompt.

import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { openai, OPENAI_MODEL } from "../../services/llm/openaiService.js";

const router = express.Router();

router.post(
  "/ask-nexus",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const { message, history = [] } = req.body as {
      message?: string;
      history?: { role: "user" | "assistant"; content: string }[];
    };

    if (!message?.trim()) {
      return res.status(400).json({ ok: false, error: "message is required" });
    }

    const clientId: string = req.ctx.client.id;
    const businessName: string = req.ctx.client.name ?? "your business";

    // ── Fetch live business data in parallel ──────────────────────────────────
    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const sevenDaysAhead = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const [allLeadsRes, newLeadsRes, bookingsMonthRes, upcomingRes, messagesRes] =
      await Promise.all([
        supabaseAdmin
          .from("leads")
          .select("id, status, source")
          .eq("client_id", clientId),
        supabaseAdmin
          .from("leads")
          .select("id")
          .eq("client_id", clientId)
          .gte("created_at", sevenDaysAgo),
        supabaseAdmin
          .from("bookings")
          .select("id, status, start_time, service_type")
          .eq("client_id", clientId)
          .gte("start_time", startOfMonth),
        supabaseAdmin
          .from("bookings")
          .select("id, start_time, service_type, status")
          .eq("client_id", clientId)
          .gte("start_time", now.toISOString())
          .lte("start_time", sevenDaysAhead)
          .eq("status", "confirmed")
          .order("start_time", { ascending: true })
          .limit(5),
        supabaseAdmin
          .from("messages")
          .select("id, direction")
          .eq("client_id", clientId)
          .gte("created_at", sevenDaysAgo),
      ]);

    // ── Compute metrics ───────────────────────────────────────────────────────
    const allLeads = allLeadsRes.data ?? [];
    const totalLeads = allLeads.length;
    const leadsThisWeek = newLeadsRes.data?.length ?? 0;
    const converted = allLeads.filter((l) => l.status === "converted").length;
    const activeLeads = allLeads.filter((l) =>
      ["new", "qualifying", "booking"].includes(l.status)
    ).length;
    const stalledLeads = allLeads.filter((l) =>
      ["stalled", "escalated"].includes(l.status)
    ).length;
    const conversionRate =
      totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

    const srcCounts: Record<string, number> = {};
    allLeads.forEach((l) => {
      if (l.source) srcCounts[l.source] = (srcCounts[l.source] ?? 0) + 1;
    });
    const topSources =
      Object.entries(srcCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s, c]) => `${s} (${c})`)
        .join(", ") || "none recorded";

    const bookingsMonth = bookingsMonthRes.data ?? [];
    const totalBookingsMonth = bookingsMonth.length;
    const completedBookings = bookingsMonth.filter(
      (b) => b.status === "completed" || b.status === "confirmed"
    ).length;
    const noShows = bookingsMonth.filter(
      (b) => b.status === "no_show"
    ).length;
    const noShowRate =
      totalBookingsMonth > 0
        ? Math.round((noShows / totalBookingsMonth) * 100)
        : 0;
    const revenueEstimate = totalBookingsMonth * 150;

    const upcoming = upcomingRes.data ?? [];
    const upcomingText =
      upcoming.length > 0
        ? upcoming
            .map(
              (b) =>
                `${new Date(b.start_time).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })} — ${b.service_type ?? "appointment"}`
            )
            .join("; ")
        : "none scheduled in the next 7 days";

    const msgs = messagesRes.data ?? [];
    const inbound7d = msgs.filter((m) => m.direction === "inbound").length;
    const outbound7d = msgs.filter((m) => m.direction === "outbound").length;

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `You are Nexus AI, the intelligent business assistant for ${businessName}. You have full visibility into their business data and can answer questions about leads, clients, bookings, revenue, and communications. You also have broad knowledge of business strategy, market trends, sales techniques, customer service best practices, and general statistics. When the user asks about external topics like market conditions, industry benchmarks, or business advice, answer using your general knowledge. Always relate external insights back to the user's specific business context when relevant.

Current business snapshot (as of ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}):
- Total leads: ${totalLeads} | This week: ${leadsThisWeek} new | Active in pipeline: ${activeLeads} | Stalled: ${stalledLeads}
- Conversion rate: ${conversionRate}% (${converted} converted of ${totalLeads} total leads)
- Top lead sources: ${topSources}
- Bookings this month: ${totalBookingsMonth} total | ${completedBookings} confirmed/completed | ${noShows} no-shows | No-show rate: ${noShowRate}%
- Upcoming appointments (next 7 days): ${upcomingText}
- Estimated revenue this month: $${revenueEstimate.toLocaleString()} (based on $150 per booking)
- Messages this week: ${inbound7d} inbound from leads, ${outbound7d} outbound sent

Always prioritize internal business data over external knowledge. If the user asks a question that can be answered with their actual business data, answer with that data first. Only bring in external knowledge (market trends, benchmarks, industry stats) as supporting context or when the user explicitly asks about external topics. Never let general market knowledge contradict or override what the actual business data shows. For example: if the market average conversion is 40% but this business converts at ${conversionRate}%, acknowledge both — but focus recommendations on improving the business's actual number, not suggesting it is fine because it matches an average. Always serve the business's real numbers first.

Be concise, direct, and conversational. Tie every insight back to ${businessName}'s specific situation. When you recommend an action, be specific about what to do and why. Use plain text — no markdown headers or excessive formatting. Keep responses focused and actionable.`;

    // ── Call OpenAI ───────────────────────────────────────────────────────────
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-20),
          { role: "user", content: message.trim() },
        ],
        max_completion_tokens: 600,
        temperature: 0.7,
      });

      const reply =
        completion.choices[0]?.message?.content?.trim() ?? "";

      return res.json({ ok: true, reply });
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, error: err?.message ?? "OpenAI error" });
    }
  }
);

export default router;
