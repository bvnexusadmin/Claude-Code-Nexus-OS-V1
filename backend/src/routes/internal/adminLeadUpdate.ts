import express from "express";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

const router = express.Router();

/**
 * INTERNAL ADMIN — Update Lead
 * Server-only. Uses service role via supabaseAdmin.
 *
 * IMPORTANT:
 * We attach express.json() here so the route works even if app.ts
 * mounts /internal before global body parsers.
 */
router.use(express.json());

router.patch("/admin/leads/:id", async (req, res) => {
  try {
    const secret = req.headers["x-nexus-secret"];
    if (secret !== process.env.NEXUS_AUTOMATION_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const id = String(req.params.id ?? "").trim();
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ ok: false, error: "Missing id" });
    }

    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ ok: false, error: "Missing body" });
    }

    const { error } = await supabaseAdmin.from("leads").update(updates).eq("id", id);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, id, applied: updates });
  } catch (e: any) {
    console.error("adminLeadUpdate error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
