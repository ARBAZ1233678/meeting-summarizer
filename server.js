// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { sendEmailHTML } from "./emailService.js";

dotenv.config();
const app = express();

/* ---------------- CORS ----------------
   OPTION A (open to all): leave FRONTEND_ORIGINS unset/empty.
   OPTION B (allow-list): set FRONTEND_ORIGINS to comma-separated origins, e.g.
   FRONTEND_ORIGINS=https://meeting-summarizer-k4eb.vercel.app,http://localhost:3000
*/
const ALLOWLIST = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);              // server-to-server
    if (ALLOWLIST.length === 0) return cb(null, true); // allow all if none configured
    if (ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(null, false);                          // politely deny (no crash/log spam)
  },
  credentials: false, // we're not using cookies; simpler
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // cache preflight for a day
};

app.use(cors(corsOptions));

// IMPORTANT: In Express 5, DO NOT use "*" as a path (causes path-to-regexp error).
// Use a RegExp to handle all preflights:
app.options(/.*/, cors(corsOptions));

/* ------------- Body parsing ------------- */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

/* ------------- Health ------------- */
app.get("/", (_req, res) => res.send("<h1>Backend is running ✅</h1>"));

/* ------------- Config / helpers ------------- */
const parseBool = (val, def = true) => {
  if (val === undefined || val === null || val === "") return def;
  return ["true", "1", "yes"].includes(String(val).toLowerCase());
};

const USE_MOCK = parseBool(process.env.USE_MOCK, true);
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY);
const groq = HAS_GROQ ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const ensureSummaryShape = (obj) => ({
  points: Array.isArray(obj?.points) ? obj.points : [],
  decisions: Array.isArray(obj?.decisions) ? obj.decisions : [],
  action_items: Array.isArray(obj?.action_items)
    ? obj.action_items.map((a) => ({
        owner: a?.owner || "Unassigned",
        task: a?.task || "",
        due: a?.due || "",
      }))
    : [],
});

/* ------------- Routes ------------- */
app.post("/generate-summary", async (req, res) => {
  try {
    const { transcript, instruction } = req.body || {};
    if (!transcript || !instruction) {
      return res.status(400).json({ error: "Transcript and instruction are required" });
    }

    // Mock path (default until GROQ_API_KEY provided and USE_MOCK=false)
    if (USE_MOCK || !groq) {
      const lines = String(transcript)
        .split(/\r?\n|[.?!]\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const summary = ensureSummaryShape({
        points: lines.slice(0, 6),
        decisions: ["Proceed with current timeline."],
        action_items: [
          { owner: "John", task: "Finish API integration", due: "Friday" },
          { owner: "Sarah", task: "Design frontend UI", due: "Wednesday" },
        ],
      });

      return res.json({ summary });
    }

    // Groq path
    const messages = [
      {
        role: "system",
        content:
          "You are a meeting notes summarizer. Output STRICT JSON only with keys: points (string[]), decisions (string[]), action_items (array of {owner, task, due}). No prose or markdown.",
      },
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nTranscript:\n${transcript}\n\nReturn STRICT JSON only.`,
      },
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.2,
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "{}";
    text = text.replace(/^```json\s*|\s*```$/g, ""); // strip code fences if present

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("Invalid JSON from Groq:", text);
      return res.status(500).json({ error: "Groq returned invalid JSON" });
    }

    return res.json({ summary: ensureSummaryShape(json) });
  } catch (err) {
    console.error("generate-summary error:", err.message);
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
    console.error("send-summary error:", err.message);
    return res.status(500).json({ error: "Failed to send summary" });
  }
});

/* ------------- Start ------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
