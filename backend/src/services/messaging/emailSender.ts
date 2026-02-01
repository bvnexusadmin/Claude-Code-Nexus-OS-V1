import postmark from "postmark";

const postmarkClient = new postmark.ServerClient(
  process.env.POSTMARK_API_TOKEN as string
);

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
