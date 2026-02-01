import { createClient } from "@supabase/supabase-js";

/* =====================================================
   ENV VALIDATION (FAIL FAST)
   ===================================================== */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("❌ SUPABASE_URL missing");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY missing");
}

/* =====================================================
   SAFE DEBUG VISIBILITY
   ===================================================== */
console.log("🔎 SUPABASE URL:", SUPABASE_URL);
console.log(
  "🔑 SUPABASE SERVICE KEY PREFIX:",
  SUPABASE_SERVICE_ROLE_KEY.slice(0, 10)
);

/* =====================================================
   ADMIN CLIENT (SERVICE ROLE)
   ===================================================== */
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        // Explicitly mark this as server-side admin usage
        "X-Client-Info": "nexus-os-admin",
      },
    },
  }
);
