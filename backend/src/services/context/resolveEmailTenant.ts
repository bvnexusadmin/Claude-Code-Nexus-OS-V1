import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

/**
 * Resolve tenant for inbound email.
 *
 * IMPORTANT:
 * Postmark inbound emails arrive at:
 *   <hash>@inbound.postmarkapp.com
 *
 * That address identifies the SERVER, not the client.
 *
 * For now:
 * - One Postmark server = one Nexus client
 * - We resolve to the default client
 *
 * This is correct and intentional.
 */
export async function resolveEmailTenant(_to: string): Promise<{ client_id: string }> {
  // Resolve the first (and currently only) client
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No clients configured in system");
  }

  return { client_id: data.id };
}
