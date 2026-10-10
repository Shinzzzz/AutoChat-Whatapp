"use client";

import { useState } from "react";
import { confirmImportAction } from "./actions.js";

interface Extraction {
  name?: string;
  phone?: string;
  email?: string;
  enquiryType?: string;
  summary?: string;
  mock?: boolean;
}

export function ImportUploader() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; extracted: Extraction } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", input.files[0]);
      const res = await fetch("/api/imports", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "upload failed");
      const data = (await res.json()) as { id: string; extracted: Extraction };
      setResult({ id: data.id, extracted: data.extracted ?? {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Upload a chat screenshot</h2>
      <p className="muted small">
        From another number or device. Claude reads the name, number and enquiry, then the AI
        takes over the conversation.
      </p>
      <form onSubmit={onUpload} style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <input className="input" type="file" name="file" accept="image/*" required style={{ flex: 1 }} />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Reading…" : "Extract"}
        </button>
      </form>
      {error && <div className="err-text">{error}</div>}

      {result && (
        <form action={confirmImportAction} style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <input type="hidden" name="importId" value={result.id} />
          {result.extracted.mock && (
            <div className="banner">Mock extraction (no ANTHROPIC_API_KEY) — edit the fields below.</div>
          )}
          <p className="muted small">{result.extracted.summary}</p>
          <div className="grid cols-2">
            <div className="field"><label>Name</label><input className="input" name="name" defaultValue={result.extracted.name ?? ""} /></div>
            <div className="field"><label>Phone</label><input className="input" name="phone" defaultValue={result.extracted.phone ?? ""} /></div>
            <div className="field"><label>Email</label><input className="input" name="email" defaultValue={result.extracted.email ?? ""} /></div>
            <div className="field"><label>Enquiry type</label><input className="input" name="enquiryType" defaultValue={result.extracted.enquiryType ?? ""} /></div>
          </div>
          <button className="btn primary" type="submit">Confirm &amp; hand to AI</button>
        </form>
      )}
    </div>
  );
}
