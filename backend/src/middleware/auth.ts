// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";

type Membership = {
  client_id: string;
  role: string;
};

type AuthUser = {
  id: string;
  email?: string;
  client_id: string; // active tenant
  role: string; // active role
  token: string;
  memberships: Membership[];
};

function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  return trimmed.slice(7).trim();
}

/**
 * loadUser (LONG-TERM MODEL)
 * - Validates Supabase JWT
 * - Loads tenant memberships from public.client_users (canonical)
 * - Selects an ACTIVE tenant:
 *    1) If x-nexus-client-id header is provided, uses it (must be in memberships)
 *    2) Else chooses the newest membership (created_at desc) if available
 * - Attaches req.user with active tenant + role + memberships
 *
 * NOTE:
 * - This intentionally does NOT trust auth.user_metadata for role/client_id.
 * - This is the foundation for BV admin tenant switching later.
 */
export const loadUser = async (
  req: Request & { user?: AuthUser },
  res: Response,
  next: NextFunction
) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    // Validate JWT using Supabase (anon key is sufficient for getUser)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = data.user.id;
    const email = data.user.email ?? undefined;

    // Canonical memberships from DB
    const { data: rows, error: memErr } = await supabaseAdmin
      .from("client_users")
      .select("client_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (memErr) {
      return res.status(500).json({ error: "Failed to load memberships", details: memErr.message });
    }

    const memberships: Membership[] =
      (rows ?? []).map((r: any) => ({
        client_id: r.client_id,
        role: r.role,
      })) ?? [];

    if (memberships.length === 0) {
      return res.status(403).json({ error: "User has no client membership" });
    }

    // Active tenant selection
    const requestedClientId =
      (req.headers["x-nexus-client-id"] as string | undefined)?.trim() || null;

    let active: Membership | null = null;

    if (requestedClientId) {
      active = memberships.find((m) => m.client_id === requestedClientId) ?? null;
      if (!active) {
        return res.status(403).json({ error: "Forbidden: not a member of requested client" });
      }
    } else {
      active = memberships[0] ?? null; // newest
    }

    if (!active) {
      return res.status(403).json({ error: "Unable to resolve active client" });
    }

    req.user = {
      id: userId,
      email,
      client_id: active.client_id,
      role: active.role,
      token,
      memberships,
    };

    return next();
  } catch (err: any) {
    return res.status(500).json({
      error: "Auth middleware failed",
      details: err?.message ?? String(err),
    });
  }
};