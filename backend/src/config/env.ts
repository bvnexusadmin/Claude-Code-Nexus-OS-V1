import dotenv from "dotenv";

dotenv.config();

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`);
  }
}
