import { useState } from "react";
import axios from "axios";

const DEFAULT_SUMMARY = {
  points: [],
  decisions: [],
  action_items: [] // { owner, task, due }
};

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [instruction, setInstruction] = useState("");
  const [summary, setSummary] = useState({ ...DEFAULT_SUMMARY });
  const [recipients, setRecipients] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [emailStatus, setEmailStatus] = useState(""); // ✅ new state

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const onUploadTxt = (file) => {
    const reader = new FileReader();
    reader.onload = () => setTranscript(String(reader.result || ""));
    reader.readAsText(file);
  };

  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const toLines = (arr) => safeArr(arr).join("\n");

  const generateSummary = async () => {
    if (!transcript.trim() || !instruction.trim()) {
      alert("Please enter both transcript and instruction");
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/generate-summary`, {
        transcript,
        instruction
      });
      const s = res?.data?.summary || DEFAULT_SUMMARY;
      setSummary({
        points: safeArr(s.points),
        decisions: safeArr(s.decisions),
        action_items: safeArr(s.action_items)
      });
      setPreviewUrl("");
      setEmailStatus(""); // clear old status
    } catch (err) {
      console.error(err);
      alert("Failed to generate summary");
    }
  };

  const sendSummary = async () => {
    const recipientsArr = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (!recipientsArr.length) {
      alert("Please enter at least one recipient email");
      return;
    }

    try {
      const payload = {
        summary: {
          points: safeArr(summary.points),
          decisions: safeArr(summary.decisions),
          action_items: safeArr(summary.action_items).map((a) => ({
            owner: a?.owner || "",
            task: a?.task || "",
            due: a?.due || ""
          }))
        },
        recipients: recipientsArr
      };

      const res = await axios.post(`${API_URL}/send-summary`, payload);
      const url = res?.data?.previewUrl || "";
      setPreviewUrl(url);
      setEmailStatus("success"); // ✅ set success flag
    } catch (err) {
      console.error(err);
      setEmailStatus("error"); // ✅ set error flag
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1>AI Meeting Notes Summarizer (Basic)</h1>

      {/* Upload .txt */}
      <div style={{ margin: "12px 0" }}>
        <input
          type="file"
          accept=".txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadTxt(f);
          }}
        />
      </div>

      {/* Transcript */}
      <textarea
        placeholder="Paste transcript here (or upload a .txt)"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={8}
        style={{ width: "100%", marginBottom: 8 }}
      />

      {/* Instruction */}
      <input
        placeholder='Instruction (e.g., "Summarize in bullet points for executives")'
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: 6 }}
      />

      <button onClick={generateSummary} style={{ marginBottom: 16 }}>
        Generate Summary
      </button>

      {/* Generated Summary (view) */}
      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
        <h3>Generated Summary</h3>

        <h4>Key Points</h4>
        <ul>
          {safeArr(summary.points).length
            ? summary.points.map((p, i) => <li key={i}>{p}</li>)
            : <li>—</li>}
        </ul>

        {safeArr(summary.decisions).length ? (
          <>
            <h4>Decisions</h4>
            <ul>
              {summary.decisions.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </>
        ) : null}

        {safeArr(summary.action_items).length ? (
          <>
            <h4>Action Items</h4>
            <ul>
              {summary.action_items.map((a, i) => (
                <li key={i}>
                  <strong>{a?.owner || "Owner"}</strong>: {a?.task || ""} — <em>{a?.due || ""}</em>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {/* Editable Areas */}
      <div style={{ border: "1px solid #eee", padding: 12, marginBottom: 12 }}>
        <h3>Edit Summary</h3>

        <div style={{ marginBottom: 8 }}>
          <strong>Points (one per line)</strong>
          <textarea
            value={toLines(summary.points)}
            onChange={(e) =>
              setSummary((s) => ({ ...s, points: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) }))
            }
            rows={6}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Decisions (one per line)</strong>
          <textarea
            value={toLines(summary.decisions)}
            onChange={(e) =>
              setSummary((s) => ({ ...s, decisions: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) }))
            }
            rows={4}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <strong>Action Items (one per line — format: owner | task | due)</strong>
          <textarea
            value={safeArr(summary.action_items)
              .map((it) => `${it?.owner || ""} | ${it?.task || ""} | ${it?.due || ""}`)
              .join("\n")}
            onChange={(e) =>
              setSummary((s) => ({
                ...s,
                action_items: e.target.value.split("\n").map((line) => {
                  const [owner = "", task = "", due = ""] = line.split("|").map((x) => x.trim());
                  return { owner, task, due };
                })
              }))
            }
            rows={6}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Email */}
      <input
        placeholder="Recipient emails (comma separated)"
        value={recipients}
        onChange={(e) => setRecipients(e.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: 6 }}
      />
      <button onClick={sendSummary}>Send Summary</button>

      {/* ✅ Success / Error UI */}
      {emailStatus === "success" && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid green", borderRadius: 4, background: "#e6ffed" }}>
          <p style={{ color: "green", fontWeight: "bold" }}>✅ Email Sent!</p>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "6px 12px",
                background: "#4f46e5",
                color: "white",
                borderRadius: 4,
                textDecoration: "none"
              }}
            >
              📧 Check Mail
            </a>
          )}
        </div>
      )}

      {emailStatus === "error" && (
        <p style={{ marginTop: 12, color: "red" }}>❌ Failed to send email</p>
      )}
    </div>
  );
}
