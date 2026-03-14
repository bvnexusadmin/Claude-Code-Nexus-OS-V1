import "./config/env.js";
import app from "./app.js";
import OpenAI from "openai";
import { startOutreachJob } from "./services/automation/outreachJob.js";

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  // ---------------------------------------------
  // 🔍 ENV VISIBILITY (SAFE)
  // ---------------------------------------------
  console.log(
    "OPENAI KEY PREFIX:",
    process.env.OPENAI_API_KEY?.slice(0, 10)
  );

  // ---------------------------------------------
  // 🔐 VERIFY OPENAI KEY AT STARTUP (HARD CHECK)
  // ---------------------------------------------
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    await client.models.list();
    console.log("✅ OpenAI key verified at startup");
  } catch (err: any) {
    console.error("❌ OpenAI key INVALID — aborting startup");
    console.error(err?.message ?? err);
    process.exit(1);
  }

  // ---------------------------------------------
  // 🚀 START SERVER
  // ---------------------------------------------
  app.listen(PORT, () => {
    console.log(`Nexus OS backend running on port ${PORT}`);
    startOutreachJob();
  });
}

bootstrap();
