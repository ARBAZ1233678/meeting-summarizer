// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { sendEmailHTML } from "./emailService.js";

dotenv.config();
const app = express();

// ---------- CORS ----------
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// If you don’t set FRONTEND_ORIGINS, allow all (we’re not using cookies)
const corsOptions = {
  origin: FRONTEND_ORIGINS.length ? FRONTEND_ORIGINS : true,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
};
app.use(cors(corsOptions)); // handles preflight too

// ---------- Body parsing ----------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// ---------- Health ----------
app.get("/", (_req, res) => res.send("<h1>Backend is running ✅</h1>"));

// ---------- Config ----------
const parseBool = (val, defaultVal = false) =>
  val == null ? defaultVal : ["true", "1", "yes"].includes(String(val).toLowerCase());

const USE_MOCK = parseBool(process.env.USE_MOCK, false); // DEFAULT NOW FALSE
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY);
const groq = HAS_GROQ ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const ensureSummaryShape = (obj) => ({
  points: Array.isArray(obj?.points) ? obj.points : [],
  decisions: Array.isArray(obj?.decisions) ? obj.decisions : [],
  action_items: Array.isArray(obj?.action_items)
    ? obj.action_items.map((a) => ({
        owner: a?.owner || "Unassigned",
        task: a?.task || "",
        due: a?.due || ""
      }))
    : []
});

// ---------- Routes ----------
app.post("/generate-summary", async (req, res) => {
  try {
    const { transcript, instruction } = req.body || {};
    if (!transcript || !instruction) {
      return res.status(400).json({ error: "Transcript and instruction are required" });
    }

    // Mock mode (explicit only)
    if (USE_MOCK) {
      console.log("[generate-summary] MODE=mock");
      const lines = String(transcript).split(/\r?\n|[.?!]\s+/).map((s) => s.trim()).filter(Boolean);

      // Make the mock a bit smarter (reflect the instruction a little)
      const points = lines
        .filter((l) => !/^\s*\.\.\.\s*$/.test(l))
        .slice(0, 8);

      const summary = ensureSummaryShape({
        points,
        decisions: points.some((p) => /demo|approve|decision|agree/i.test(p))
          ? ["Stakeholders aligned on next steps."]
          : [],
        action_items: points
          .filter((p) => /by (monday|tuesday|wednesday|thursday|friday)|due|deliver|send/i.test(p))
          .slice(0, 3)
          .map((p, i) => ({ owner: ["John", "Sarah", "Alex"][i] || "Owner", task: p, due: "" }))
      });

      return res.json({ summary });
    }

    // Real Groq mode
    if (!groq) {
      return res.status(500).json({
        error: "GROQ_API_KEY not configured. Set USE_MOCK=true to test without LLM."
      });
    }

    console.log("[generate-summary] MODE=groq");

    const messages = [
      {
        role: "system",
        content:
          "You are a meeting notes summarizer. Output STRICT JSON with keys: " +
          "points (string[]), decisions (string[]), action_items (array of {owner, task, due}). " +
          "Do NOT output prose or markdown. Only JSON."
      },
      {
        role: "user",
        content:
          `Instruction: ${instruction}\n\nTranscript:\n${transcript}\n\n` +
          "Return STRICT JSON only. Example output:\n" +
          `{"points":["..."],"decisions":["..."],"action_items":[{"owner":"Name","task":"Task","due":"Date"}]}`
      }
    ];

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages,
      temperature: 0.2
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "{}";
    text = text.replace(/^```json\s*|\s*```$/g, ""); // strip fenced blocks if present

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("Groq returned invalid JSON:", text);
      return res.status(502).json({ error: "Groq returned invalid JSON" });
    }

    return res.json({ summary: ensureSummaryShape(json) });
  } catch (err) {
    console.error("generate-summary error:", err);
    return res.status(500).json({ error: "Failed to generate summary (server error)" });
  }
});

app.post("/send-summary", async (req, res) => {
  try {
    const rawSummary = req.body?.summary || {};
    const recipients = req.body?.recipients || [];
    const summary = ensureSummaryShape(rawSummary);
    if (!recipients.length) {
      return res.status(400).json({ error: "Recipients array is required" });
    }

    const bullets = summary.points.map((p) => `<li>${p}</li>`).join("");
    const decisionsHTML = summary.decisions.length
      ? `<h4>Decisions</h4><ul>${summary.decisions.map((d) => `<li>${d}</li>`).join("")}</ul>`
      : "";
    const actionsHTML = summary.action_items.length
      ? `<h4>Action Items</h4><ul>${summary.action_items
          .map((a) => `<li><strong>${a.owner}</strong>: ${a.task} — <em>${a.due}</em></li>`)
          .join("")}</ul>`
      : "";

    const html = `<h2>Meeting Summary</h2><h4>Key Points</h4><ul>${bullets}</ul>${decisionsHTML}${actionsHTML}`;

    const previewUrl = await sendEmailHTML(recipients, "Meeting Summary", html);
    return res.json({ message: "Email sent (preview available)", previewUrl });
  } catch (err) {
    console.error("send-summary error:", err);
    return res.status(500).json({ error: "Failed to send summary" });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
