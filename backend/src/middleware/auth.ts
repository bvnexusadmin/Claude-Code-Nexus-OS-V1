import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

export const loadUser = async (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = {
    id: data.user.id,
    role: data.user.user_metadata?.role,
    client_id: data.user.user_metadata?.client_id,
    token,
  };

  if (!req.user.client_id) {
    return res.status(403).json({ error: "User missing client_id" });
  }

  next();
};
