import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Explicit environment loader
 * Ensures backend/.env is always loaded regardless of CWD
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve backend root
const backendRoot = path.resolve(__dirname, "../../");

// Load backend/.env explicitly
dotenv.config({
  path: path.join(backendRoot, ".env"),
});

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXUS_WEBHOOK_SECRET",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`);
  }
}

console.log("✅ Environment loaded successfully");
