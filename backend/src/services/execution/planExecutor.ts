// src/services/execution/planExecutor.ts

import { leadIntakeAgent } from "../../agents/leadIntakeAgent.js";

export type ExecutionCapabilities = {
  sms_delivery: boolean;
  db_writes: boolean;
};

export type ExecutorContext = {
  client_id: string;
  lead_id?: string;

  persistStage?: (lead_id: string, stage: string) => Promise<void>;
  persistMessageIntent?: (payload: {
    client_id: string;
    lead_id?: string;
    channel: "sms" | "ui";
    to: string;
    body: string;
    reason: string;
  }) => Promise<void>;

  sendSms?: (payload: {
    client_id: string;
    to: string;
    body: string;
    lead_id?: string;
  }) => Promise<void>;
};

export async function executePlan(args: {
  plan: { actions: any[] };
  ctx: ExecutorContext;
  caps: ExecutionCapabilities;
}) {
  const { plan, ctx, caps } = args;

  let executed = 0;
  let skipped = 0;
  const errors: Array<{ action: unknown; message: string }> = [];

  for (const action of plan.actions) {
    try {
      switch (action.type) {
        case "CALL_AGENT":
          if (action.agent === "leadIntake") {
            await leadIntakeAgent.run(action.input);
          }
          executed++;
          break;

        case "SET_STAGE":
          if (!ctx.lead_id || !caps.db_writes || !ctx.persistStage) break;
          await ctx.persistStage(ctx.lead_id, action.stage);
          executed++;
          break;

        case "QUEUE_MESSAGE":
          if (caps.db_writes && ctx.persistMessageIntent) {
            await ctx.persistMessageIntent({
              client_id: ctx.client_id,
              lead_id: action.lead_id ?? ctx.lead_id,
              channel: action.channel,
              to: action.to,
              body: action.body,
              reason: action.reason,
            });
          }

          if (action.channel === "sms" && caps.sms_delivery && ctx.sendSms) {
            await ctx.sendSms({
              client_id: ctx.client_id,
              lead_id: action.lead_id ?? ctx.lead_id,
              to: action.to,
              body: action.body,
            });
          }
          executed++;
          break;

        case "ESCALATE_HUMAN":
          console.warn("[EXECUTOR] ESCALATE_HUMAN:", action.reason);
          executed++;
          break;

        case "NO_OP":
        default:
          skipped++;
      }
    } catch (err: any) {
      errors.push({
        action,
        message: err?.message ?? "Executor error",
      });
    }
  }

  return {
    ok: errors.length === 0,
    executed,
    skipped,
    errors,
  };
}
