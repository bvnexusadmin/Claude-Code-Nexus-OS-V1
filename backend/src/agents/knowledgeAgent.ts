import { z } from "zod";

import type { SystemEvent } from "./contracts/systemEvents.js";
import { SYSTEM_EVENTS } from "./contracts/systemEvents.js";
import type { AgentResult } from "./contracts/agentTypes.js";

import { openai, OPENAI_MODEL } from "../services/llm/openaiService.js";
import { logAiAction } from "../services/agents/aiActionLogger.js";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";

/**
 * Knowledge Agent (Agent 6)
 *
 * Phase 3 scope:
 * - Read-only knowledge retrieval (DB if available, else ctx fallback)
 * - LLM drafts an answer
 * - Logs to ai_actions
 * - DOES NOT send SMS (Outbound Agent will do that later)
 */

const KnowledgeOutputSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  used_sources: z.array(z.string()).default([]),
});

export type KnowledgeOutput = z.infer<typeof KnowledgeOutputSchema> & {
  lead_id: string;
};

async function loadKnowledgeText({
  client_id,
  ctx,
}: {
  client_id: string;
  ctx: any;
}): Promise<{ text: string; sources: string[] }> {
  // Preferred: DB table client_knowledge_docs (if you have it)
  // Safe fallback: ctx.client_configs / ctx.client object
  const sources: string[] = [];
  let text = "";

  try {
    const { data, error } = await supabaseAdmin
      .from("client_knowledge_docs")
      .select("title, content")
      .eq("client_id", client_id)
      .limit(10);

    if (!error && data && data.length > 0) {
      for (const row of data) {
        sources.push(`db:client_knowledge_docs:${row.title ?? "untitled"}`);
        text += `\n\n### ${row.title ?? "Untitled"}\n${row.content ?? ""}\n`;
      }
      return { text: text.trim(), sources };
    }
  } catch {
    // table may not exist yet — ignore and fall back
  }

  // Fallback knowledge (won’t crash even if missing)
  const cfg = ctx?.client_configs ?? {};
  const client = ctx?.client ?? {};

  // Put *anything* you already store here; this keeps it functional now.
  const fallbackBits: string[] = [];

  if (client?.name) fallbackBits.push(`Business: ${client.name}`);
  if (cfg?.services) fallbackBits.push(`Services: ${JSON.stringify(cfg.services)}`);
  if (cfg?.pricing) fallbackBits.push(`Pricing: ${JSON.stringify(cfg.pricing)}`);
  if (cfg?.policies) fallbackBits.push(`Policies: ${JSON.stringify(cfg.policies)}`);
  if (cfg?.hours) fallbackBits.push(`Hours: ${JSON.stringify(cfg.hours)}`);

  text = fallbackBits.join("\n");
  sources.push("ctx:fallback");

  return { text, sources };
}

export const knowledgeAgent = {
  name: "knowledge",
  allowedSideEffects: ["llm:call", "db:read"],

  async run({
    event,
    ctx,
    lead_id,
    question,
  }: {
    event: SystemEvent;
    ctx: any;
    lead_id: string;
    question: string;
  }): Promise<AgentResult<KnowledgeOutput>> {
    if (!question) {
      return {
        agent: "knowledge",
        ok: false,
        output: {
          lead_id,
          answer: "",
          confidence: 0,
          used_sources: [],
        },
        notes: "Missing question",
      };
    }

    const { text: knowledgeText, sources } = await loadKnowledgeText({
      client_id: event.client_id,
      ctx,
    });

    const clientName = ctx?.client?.name ?? "this business";

    const prompt = `
You are the Knowledge Agent for ${clientName}.
Answer the user's question using ONLY the knowledge provided below.
If the knowledge is insufficient, say you don't know and ask ONE clarifying question.
Return ONLY valid JSON with keys:
- answer (string)
- confidence (0..1)
- used_sources (string[])

KNOWLEDGE:
"""${knowledgeText || "NO KNOWLEDGE AVAILABLE"}"""

QUESTION:
"""${question}"""
`.trim();

    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = resp.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const validated = KnowledgeOutputSchema.safeParse(parsed);

    const output: KnowledgeOutput = validated.success
      ? {
          lead_id,
          answer: validated.data.answer,
          confidence: validated.data.confidence,
          used_sources:
            validated.data.used_sources?.length
              ? validated.data.used_sources
              : sources,
        }
      : {
          lead_id,
          answer:
            "I don’t have enough info to answer that yet. What specifically are you asking about?",
          confidence: 0.2,
          used_sources: sources,
        };

    await logAiAction({
      trace_id: event.trace_id,
      event_id: event.event_id,
      client_id: event.client_id,
      lead_id,
      agent: "knowledge",
      action_type: "knowledge_answer_drafted",
      payload: output,
    });

    return {
      agent: "knowledge",
      ok: true,
      output,
    };
  },
};
