// backend/src/routes/internal/me.ts
import express from "express";
import { loadUser } from "../../middleware/auth.js";
import { loadTenantContext } from "../../middleware/loadTenantContext.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

/**
 * GET /internal/me
 * Canonical identity endpoint (LONG-TERM):
 * - loadUser resolves memberships + active tenant selection
 * - loadTenantContext loads client/config/integrations for active tenant
 * - returns active + memberships (with client names when available)
 *
 * Tenant switching (member-only):
 * - send header: x-nexus-client-id: <client_uuid>
 */
router.get("/me", loadUser, loadTenantContext, async (req: any, res) => {
  const memberships = req.user?.memberships ?? [];
  const activeClientId = req.user?.client_id;
  const activeRole = req.user?.role;

  // attach client names to memberships (so frontend doesn't query clients table)
  const clientIds = memberships.map((m: any) => m.client_id);
  const clientMap: Record<string, { id: string; name: string }> = {};

  if (clientIds.length > 0) {
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id,name")
      .in("id", clientIds);

    (clients ?? []).forEach((c: any) => {
      clientMap[c.id] = { id: c.id, name: c.name };
    });
  }

  return res.json({
    ok: true,
    user: {
      id: req.user.id,
      email: req.user.email ?? null,
    },
    active: {
      client_id: activeClientId,
      role: activeRole,
      client: {
        id: req.ctx.client.id,
        name: req.ctx.client.name,
      },
    },
    memberships: memberships.map((m: any) => ({
      client_id: m.client_id,
      role: m.role,
      client: clientMap[m.client_id] ?? null,
    })),
  });
});

export default router;