// POST /internal/analytics/ai-advisor
// Accepts summarized business metrics and returns OpenAI-powered business intelligence.

import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { openai, OPENAI_MODEL } from "../../services/llm/openaiService.js";

const router = express.Router();

type AdvisorType = "health_score" | "predictions" | "actions" | "growth" | "trend";

export interface AnalyticsMetrics {
  totalLeads: number;
  conversionRate: number;
  totalBookings: number;
  noShowRate: number;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  topSource: string;
  activeLeads: number;
  revenueEstimate: number;
}

function buildPrompt(
  type: AdvisorType,
  metrics: AnalyticsMetrics,
  businessName: string
): string {
  const metricsText = [
    `Business: ${businessName}`,
    `Total leads (last 90 days): ${metrics.totalLeads}`,
    `Active leads: ${metrics.activeLeads}`,
    `Lead conversion rate: ${metrics.conversionRate}%`,
    `Total bookings: ${metrics.totalBookings}`,
    `No-show rate: ${metrics.noShowRate}%`,
    `Total messages (last 30 days): ${metrics.totalMessages}`,
    `Inbound: ${metrics.inboundMessages}, Outbound: ${metrics.outboundMessages}`,
    `Top lead source: ${metrics.topSource}`,
    `Estimated revenue: $${metrics.revenueEstimate}`,
  ].join("\n");

  const prompts: Record<AdvisorType, string> = {
    health_score: `You are a business performance analyst. Based on the following metrics, provide a concise business health assessment in 2-3 sentences. Focus on what's working and what needs attention. Be direct and specific.\n\nMetrics:\n${metricsText}`,
    predictions: `You are a business analyst. Based on the following metrics, provide exactly 3 specific predictions for the next 30 days. Format as a numbered list (1. 2. 3.). Each prediction should be 1-2 sentences and data-driven.\n\nMetrics:\n${metricsText}`,
    actions: `You are a business growth consultant. Based on the following metrics, provide exactly 4 specific, immediately actionable recommendations. Format as a numbered list (1. 2. 3. 4.). Each action should start with a verb and be concrete.\n\nMetrics:\n${metricsText}`,
    growth: `You are a business strategist. Based on the following metrics, suggest exactly 3 growth strategies. Format as a numbered list. For each strategy, write a bold title on the first line followed by 1-2 sentences of explanation.\n\nMetrics:\n${metricsText}`,
    trend: `You are a business analyst. Based on the following metrics, describe the current business trend in 2-3 sentences. Be specific about what is improving, declining, or stable. End with a single sentence outlook for the next 30 days.\n\nMetrics:\n${metricsText}`,
  };

  return prompts[type];
}

router.post(
  "/analytics/ai-advisor",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const { advisor_type, metrics } = req.body as {
      advisor_type?: AdvisorType;
      metrics?: AnalyticsMetrics;
    };

    if (!advisor_type || !metrics) {
      return res.status(400).json({
        ok: false,
        error: "advisor_type and metrics are required",
      });
    }

    const validTypes: AdvisorType[] = [
      "health_score",
      "predictions",
      "actions",
      "growth",
      "trend",
    ];
    if (!validTypes.includes(advisor_type)) {
      return res.status(400).json({ ok: false, error: "Invalid advisor_type" });
    }

    const businessName: string = req.ctx.client.name ?? "this business";

    try {
      const prompt = buildPrompt(advisor_type, metrics, businessName);

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
        temperature: 0.7,
      });

      const result = completion.choices[0]?.message?.content?.trim() ?? "";
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, error: err?.message ?? "OpenAI error" });
    }
  }
);

export default router;
