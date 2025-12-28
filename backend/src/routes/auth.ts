import { Router } from "express";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.json({
    token: data.session?.access_token,
    user: data.user,
  });
});

export default router;
