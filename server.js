import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { sendEmailHTML } from "./emailService.js";

dotenv.config();

const app = express();
app.use(express.json());

// CORS
const ALLOW_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: [ALLOW_ORIGIN], credentials: true }));

// Health
app.get("/", (_req, res) => res.send("<h1>Backend is running ✅</h1>"));

// AI config
const USE_MOCK = (process.env.USE_MOCK ?? "true").toLowerCase() === "true";
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY);
const groq = HAS_GROQ ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Helpers
const ensureSummaryShape = (obj) => ({
  points: Array.isArray(obj?.points) ? obj.points : [],
  decisions: Array.isArray(obj?.decisions) ? obj.decisions : [],
  action_items: Array.isArray(obj?.action_items) ? obj.action_items : []
});

// Generate Summary
app.post("/generate-summary", async (req, res) => {
  const { transcript, instruction } = req.body || {};
  if (!transcript || !instruction) {
    return res.status(400).json({ error: "Transcript and instruction are required" });
  }

  // MOCK
  if (USE_MOCK || !groq) {
    const lines = String(transcript)
      .split(/\r?\n|[.?!]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const points = lines.slice(0, 4);
    const summary = ensureSummaryShape({
      points: points.length
        ? points
        : [
            "Project timeline and next steps discussed.",
            "Owners assigned to action items.",
            "Next demo scheduled.",
            "Risks acknowledged and mitigations planned."
          ],
      decisions: ["Proceed with current timeline."],
      action_items: [
        { owner: "John", task: "Finish API integration", due: "Friday" },
        { owner: "Sarah", task: "Design frontend UI", due: "Wednesday" }
      ]
    });
    return res.json({ summary });
  }

  // GROQ
  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a precise meeting summarizer. Output STRICT JSON only with keys: points (string[]), decisions (string[]), action_items (array of {owner, task, due}). No prose or markdown."
      },
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nTranscript:\n${transcript}\n\nReturn STRICT JSON only.`
      }
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.2
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "{}";
    text = text.replace(/^```json\s*|\s*```$/g, ""); // strip fences if present
    const json = JSON.parse(text);
    return res.json({ summary: ensureSummaryShape(json) });
  } catch (e) {
    console.error("Groq error — fallback to mock:", e?.message);
    return res.json({
      summary: ensureSummaryShape({
        points: [
          "Summary generated via fallback (mock).",
          "Set USE_MOCK=false and add GROQ_API_KEY to enable real AI."
        ]
      })
    });
  }
});

// Send Summary (Ethereal)
app.post("/send-summary", async (req, res) => {
  const rawSummary = req.body?.summary || {};
  const recipients = req.body?.recipients || [];

  const summary = ensureSummaryShape(rawSummary);
  if (!recipients.length) {
    return res.status(400).json({ error: "Recipients array is required" });
  }

  const bullets = summary.points.map((p) => `<li>${String(p)}</li>`).join("");
  const decisionsHTML = summary.decisions.length
    ? `<h4>Decisions</h4><ul>${summary.decisions.map((d) => `<li>${d}</li>`).join("")}</ul>`
    : "";
  const actionsHTML = summary.action_items.length
    ? `<h4>Action Items</h4><ul>${summary.action_items
        .map(
          (a) =>
            `<li><strong>${a.owner || "Owner"}</strong>: ${a.task || ""} — <em>${a.due || ""}</em></li>`
        )
        .join("")}</ul>`
    : "";

  const html = `
    <h2>Meeting Summary</h2>
    <h4>Key Points</h4>
    <ul>${bullets}</ul>
    ${decisionsHTML}
    ${actionsHTML}
  `;

  try {
    const previewUrl = await sendEmailHTML(recipients, "Meeting Summary", html);
    return res.json({ message: "Mock email sent successfully ✅", previewUrl });
  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
