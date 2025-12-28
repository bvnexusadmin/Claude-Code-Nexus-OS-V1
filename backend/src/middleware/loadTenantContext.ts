import type { Request, Response, NextFunction } from "express";
import { loadClientContext } from "../services/context/loadClientContext.js";

/**
 * Canonical authenticated user shape.
 * This matches what loadUser middleware guarantees.
 */
type AuthUser = {
  id: string;
  email?: string;
  client_id: string;
  role?: string;
  jwt?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      ctx?: {
        auth: AuthUser;
        client: any;
        config: any;
        integrations: any;
      };
    }
  }
}

export async function loadTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // HARD GUARANTEE: auth middleware must run before this
    if (!req.user || !req.user.client_id) {
      return res.status(401).json({
        error: "Unauthorized: missing auth context",
      });
    }

    const clientId = req.user.client_id;

    const ctx = await loadClientContext(clientId);

    req.ctx = {
      auth: req.user, // now guaranteed, not optional
      client: ctx.client,
      config: ctx.config,
      integrations: ctx.integrations,
    };

    return next();
  } catch (err: any) {
    return res.status(500).json({
      error: "Failed to load tenant context",
      details: err?.message || String(err),
    });
  }
}
