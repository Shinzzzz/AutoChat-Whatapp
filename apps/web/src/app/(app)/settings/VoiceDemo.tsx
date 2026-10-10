"use client";

import { useState } from "react";

interface Turn {
  caller: string;
  agent: string;
}

export function VoiceDemo() {
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [who, setWho] = useState<string>("");

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/voice/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { contact?: string; turns?: Turn[] };
      setWho(data.contact ?? "");
      setTurns(data.turns ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn primary" onClick={run} disabled={busy}>
        {busy ? "Calling…" : "Run a demo call"}
      </button>
      {turns && (
        <div className="messages" style={{ marginTop: 12, maxHeight: 320, borderRadius: 10 }}>
          {who && <div className="muted small">Simulated call with {who}</div>}
          {turns.map((t, i) => (
            <div key={i}>
              <div className="bubble inbound">🗣️ {t.caller}</div>
              <div className="bubble ai" style={{ marginTop: 6 }}>🤖 {t.agent}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
