// src/routes/auth.ts
import { Router } from "express";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";
import googleAuthRouter from "./auth/google.js";

const router = Router();

/* =====================================================
   EMAIL / PASSWORD LOGIN
   ===================================================== */
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

/* =====================================================
   GOOGLE OAUTH (OPTIONAL)
   ===================================================== */
const googleEnabled =
  process.env.GOOGLE_OAUTH_CLIENT_ID &&
  process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
  process.env.GOOGLE_OAUTH_REDIRECT_URI;

if (googleEnabled) {
  router.use("/google", googleAuthRouter);
} else {
  console.warn("⚠️ Google OAuth disabled (env vars missing)");
}

export default router;
