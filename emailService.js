import nodemailer from "nodemailer";

/**
 * Dev-only: send HTML email via Ethereal and return preview URL.
 */
export async function sendEmailHTML(recipients, subject, html, textFallback = "") {
  const testAccount = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });

  const info = await transporter.sendMail({
    from: '"Meeting Summarizer" <no-reply@mock.dev>',
    to: recipients.join(","),
    subject,
    text: textFallback || html.replace(/<[^>]+>/g, ""),
    html
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log("📧 Mock email sent:", info.messageId);
  console.log("🔗 Preview URL:", previewUrl);
  return previewUrl;
}
