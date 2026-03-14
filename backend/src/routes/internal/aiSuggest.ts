// POST /internal/ai-suggest-reply
// Returns a GPT-generated suggested reply based on the conversation history.

import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";
import { openai, OPENAI_MODEL } from "../../services/llm/openaiService.js";

const router = express.Router();

router.post(
  "/ai-suggest-reply",
  loadUser,
  loadTenantContext,
  async (req: any, res) => {
    const { lead_id } = req.body as { lead_id?: string };

    if (!lead_id) {
      return res.status(400).json({ ok: false, error: "lead_id is required" });
    }

    const clientId: string = req.ctx.client.id;
    const businessName: string = req.ctx.client.name ?? "this business";

    // Load lead context
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("name, phone, email, service_type, urgency, qualification_status, status")
      .eq("client_id", clientId)
      .eq("id", lead_id)
      .single();

    // Load recent conversation (last 20 messages, oldest first)
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("direction, content, channel, sender_type, created_at")
      .eq("client_id", clientId)
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (msgErr) {
      return res.status(500).json({ ok: false, error: msgErr.message });
    }

    // Build conversation history for GPT
    const convHistory: { role: "user" | "assistant"; content: string }[] = (
      messages ?? []
    ).map((m: any) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: (m.content ?? "").trim(),
    }));

    // Build system prompt scoped to this business
    const leadContext = lead
      ? [
          lead.name ? `Lead name: ${lead.name}` : null,
          lead.service_type ? `Requesting: ${lead.service_type}` : null,
          lead.urgency ? `Urgency: ${lead.urgency}` : null,
          lead.status ? `Status: ${lead.status}` : null,
        ]
          .filter(Boolean)
          .join(". ")
      : "";

    const systemPrompt = [
      `You are a helpful assistant for ${businessName}.`,
      `Your job is to suggest a professional, friendly, concise reply to send to a lead or client.`,
      `Keep your reply to 1–3 sentences. Do not use markdown, bullet points, or formatting.`,
      `Write only the reply text — no preamble, no labels, no quotes.`,
      leadContext ? `Context: ${leadContext}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...convHistory,
          {
            role: "user",
            content:
              "Please write a helpful reply to send to this lead now.",
          },
        ],
        max_tokens: 200,
        temperature: 0.65,
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
