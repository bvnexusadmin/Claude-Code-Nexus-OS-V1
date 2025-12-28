import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

export interface ClientContext {
  client: any;
  config: any;
  integrations: any;
}

export async function loadClientContext(
  clientId: string
): Promise<ClientContext> {
  if (!clientId) {
    throw new Error("loadClientContext: clientId is required");
  }

  // 1️⃣ Load client
  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    throw new Error(
      `loadClientContext: client not found for client_id=${clientId}`
    );
  }

  // 2️⃣ Load client config
  const { data: config, error: configError } = await supabaseAdmin
    .from("client_configs")
    .select("*")
    .eq("client_id", clientId)
    .single();

  if (configError || !config) {
    throw new Error(
      `loadClientContext: client_configs missing for client_id=${clientId}`
    );
  }

  // 3️⃣ Load client integrations
  const { data: integrations, error: integrationsError } =
    await supabaseAdmin
      .from("client_integrations")
      .select("*")
      .eq("client_id", clientId)
      .single();

  if (integrationsError || !integrations) {
    throw new Error(
      `loadClientContext: client_integrations missing for client_id=${clientId}`
    );
  }

  return {
    client,
    config,
    integrations,
  };
}
