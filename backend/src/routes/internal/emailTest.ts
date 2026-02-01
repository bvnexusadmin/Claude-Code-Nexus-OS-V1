import { Router } from "express";
import { sendEmail } from "../../services/messaging/emailSender";

const router = Router();

router.post("/test-email", async (_req, res) => {
  const result = await sendEmail({
    to: "justinbrautigam13@gmail.com",
    subject: "Nexus OS Email Live Test",
    content: "If you received this email, Postmark outbound is live.",
  });

  res.json(result);
});

export default router;
