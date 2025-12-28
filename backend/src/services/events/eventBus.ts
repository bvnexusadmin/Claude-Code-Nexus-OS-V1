import type { SystemEvent } from "../../agents/contracts/systemEvents.js";
import { dispatchEvent } from "../agents/agentDispatcher.js";

/**
 * Central Event Bus
 */
class EventBus {
  async emitEvent(event: SystemEvent): Promise<void> {
    if (!event.event_id) throw new Error("Event missing event_id");
    if (!event.trace_id) throw new Error("Event missing trace_id");
    if (!event.event_type) throw new Error("Event missing event_type");
    if (!event.client_id) throw new Error("Event missing client_id");

    console.log("[EVENT BUS]", {
      trace_id: event.trace_id,
      event_type: event.event_type,
      client_id: event.client_id,
    });

    await dispatchEvent(event);
  }
}

export const eventBus = new EventBus();
