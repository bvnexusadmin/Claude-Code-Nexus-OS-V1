import postmark from "postmark";

const token = process.env.POSTMARK_API_TOKEN;
if (!token) {
  throw new Error("Missing POSTMARK_API_TOKEN in environment");
}
const postmarkClient = new postmark.ServerClient(token);

export async function sendEmail(params: {
  to: string;
  subject: string;
  content: string;
}) {
  if (!process.env.POSTMARK_DEFAULT_FROM) {
    throw new Error("POSTMARK_DEFAULT_FROM is not set");
  }

  const response = await postmarkClient.sendEmail({
    From: process.env.POSTMARK_DEFAULT_FROM,
    To: params.to,
    Subject: params.subject,
    TextBody: params.content,
    MessageStream: "outbound", // Default Transactional Stream
  });

  return {
    ok: true,
    messageId: response.MessageID,
  };
}
