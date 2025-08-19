// server.js (replace your existing file)
import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { sendEmailHTML } from "./emailService.js";

dotenv.config();

const app = express();

<<<<<<< HEAD
// Support large JSON payloads (for long transcripts)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// CORS setup
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Preflight requests for all routes
app.options("*", cors());
=======
/**
 * IMPORTANT: set this env var in Render to the exact frontend origin:
 * FRONTEND_ORIGIN=https://meeting-summarizer-k4eb.vercel.app
 */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// --- Small debug logger (safe to keep) ---
const DEBUG_CORS = (process.env.DEBUG_CORS || "false").toLowerCase() === "true";
app.use((req, res, next) => {
  if (DEBUG_CORS) {
    console.log(`[REQ] ${req.method} ${req.originalUrl} Origin:${req.headers.origin || "-"}`);
  }
  next();
});

// --- Preflight & CORS middleware (custom, guarantees headers) ---
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // If no origin (server-to-server call), continue
  if (!origin) {
    return next();
  }

  // Only allow the configured frontend origin (strict)
  if (origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // Not allowed by CORS: respond with 403 for preflight, but we still continue for non-OPTIONS to give clearer logs.
    if (DEBUG_CORS) {
      console.warn(`[CORS] blocked origin: ${origin}`);
    }
    // We DON'T early return here to allow debugging; but for stricter behavior you could return 403.
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // If preflight, end here with 204 (No Content)
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Support large JSON payloads (for long transcripts)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
>>>>>>> 67df06b (Fix CORS: robust preflight handling & large payload support)

// Health check
app.get("/", (_req, res) => res.send("<h1>Backend is running ✅</h1>"));

// AI / Groq config + helper
const USE_MOCK = (process.env.USE_MOCK ?? "true").toString().toLowerCase() === "true";
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY);
const groq = HAS_GROQ ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

<<<<<<< HEAD
// Helper to ensure summary structure
=======
>>>>>>> 67df06b (Fix CORS: robust preflight handling & large payload support)
const ensureSummaryShape = (obj) => ({
  points: Array.isArray(obj?.points) ? obj.points : [],
  decisions: Array.isArray(obj?.decisions) ? obj.decisions : [],
  action_items: Array.isArray(obj?.action_items) ? obj.action_items : []
});

// Generate Summary endpoint
app.post("/generate-summary", async (req, res) => {
<<<<<<< HEAD
  const { transcript, instruction } = req.body || {};
  if (!transcript || !instruction) {
    return res.status(400).json({ error: "Transcript and instruction are required" });
  }

  // MOCK fallback
  if (USE_MOCK || !groq) {
    const lines = String(transcript)
      .split(/\r?\n|[.?!]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const summary = ensureSummaryShape({
      points: lines.slice(0, 4).length
        ? lines.slice(0, 4)
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

  // GROQ AI
=======
>>>>>>> 67df06b (Fix CORS: robust preflight handling & large payload support)
  try {
    const { transcript, instruction } = req.body || {};
    if (!transcript || !instruction) return res.status(400).json({ error: "Transcript and instruction are required" });

    // Mock
    if (USE_MOCK || !groq) {
      const lines = String(transcript).split(/\r?\n|[.?!]\s+/).map(s => s.trim()).filter(Boolean);
      const summary = ensureSummaryShape({
        points: lines.slice(0, 6),
        decisions: ["Proceed with current timeline."],
        action_items: [
          { owner: "John", task: "Finish API integration", due: "Friday" },
          { owner: "Sarah", task: "Design frontend UI", due: "Wednesday" }
        ]
      });
      return res.json({ summary });
    }

    // GROQ path (if enabled)
    const messages = [
      { role: "system", content: "You are a meeting notes summarizer. Output STRICT JSON only: points[], decisions[], action_items[]." },
      { role: "user", content: `Instruction: ${instruction}\n\nTranscript:\n${transcript}\n\nReturn STRICT JSON only.` }
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.2
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "{}";
<<<<<<< HEAD
    text = text.replace(/^```json\s*|\s*```$/g, ""); // remove code fences
=======
    text = text.replace(/^```json\s*|\s*```$/g, "");
>>>>>>> 67df06b (Fix CORS: robust preflight handling & large payload support)
    const json = JSON.parse(text);
    return res.json({ summary: ensureSummaryShape(json) });
  } catch (err) {
    console.error("generate-summary error:", err);
    return res.status(500).json({ error: "Failed to generate summary (server error)" });
  }
});

<<<<<<< HEAD
// Send Summary endpoint (mock email)
app.post("/send-summary", async (req, res) => {
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
        .map((a) => `<li><strong>${a.owner || "Owner"}</strong>: ${a.task || ""} — <em>${a.due || ""}</em></li>`)
        .join("")}</ul>`
    : "";

  const html = `<h2>Meeting Summary</h2><h4>Key Points</h4><ul>${bullets}</ul>${decisionsHTML}${actionsHTML}`;

=======
// Send Summary (email mock)
app.post("/send-summary", async (req, res) => {
>>>>>>> 67df06b (Fix CORS: robust preflight handling & large payload support)
  try {
    const rawSummary = req.body?.summary || {};
    const recipients = req.body?.recipients || [];
    const summary = ensureSummaryShape(rawSummary);
    if (!recipients.length) return res.status(400).json({ error: "Recipients array is required" });

    const bullets = summary.points.map(p => `<li>${p}</li>`).join("");
    const decisionsHTML = summary.decisions.length ? `<h4>Decisions</h4><ul>${summary.decisions.map(d => `<li>${d}</li>`).join("")}</ul>` : "";
    const actionsHTML = summary.action_items.length ? `<h4>Action Items</h4><ul>${summary.action_items.map(a => `<li><strong>${a.owner||"Owner"}</strong>: ${a.task||""} — <em>${a.due||""}</em></li>`).join("")}</ul>` : "";

    const html = `<h2>Meeting Summary</h2><h4>Key Points</h4><ul>${bullets}</ul>${decisionsHTML}${actionsHTML}`;

    const previewUrl = await sendEmailHTML(recipients, "Meeting Summary", html);
    return res.json({ message: "Mock email sent", previewUrl });
  } catch (err) {
    console.error("send-summary error:", err);
    return res.status(500).json({ error: "Failed to send summary" });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
