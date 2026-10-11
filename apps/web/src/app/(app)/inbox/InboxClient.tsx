"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Convo {
  id: string;
  name: string;
  channel: string;
  status: string;
  preview: string;
  lastMessageAt: string | null;
  unreadCount: number;
}
interface Msg {
  id: string;
  direction: string;
  sender: string;
  text: string | null;
  createdAt: string;
  deliveryStatus: string;
  aiMeta?: unknown;
}

export function InboxClient() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sim, setSim] = useState("Hi, what's the price for 1000 branded 500ml bottles?");
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  selectedRef.current = selected;

  const loadConvos = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = (await res.json()) as { conversations: Convo[] };
      setConvos(data.conversations);
      setSelected((cur) => cur ?? data.conversations[0]?.id ?? null);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (res.ok) {
      const data = (await res.json()) as { messages: Msg[] };
      setMessages(data.messages);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void loadConvos();
  }, [loadConvos]);

  // Load messages when selection changes.
  useEffect(() => {
    if (selected) void loadMessages(selected);
  }, [selected, loadMessages]);

  // Realtime via SSE.
  useEffect(() => {
    const es = new EventSource("/api/realtime");
    const onMsg = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { conversationId: string; message?: Msg };
        if (payload.conversationId === selectedRef.current && payload.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!],
          );
        }
        void loadConvos();
      } catch {
        /* ignore */
      }
    };
    const onConvo = () => {
      void loadConvos();
      if (selectedRef.current) void loadMessages(selectedRef.current);
    };
    es.addEventListener("message.created", onMsg);
    es.addEventListener("conversation.updated", onConvo);
    return () => es.close();
  }, [loadConvos, loadMessages]);

  // Autoscroll.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!selected || !draft.trim()) return;
    setBusy(true);
    await fetch(`/api/conversations/${selected}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draft }),
    });
    setDraft("");
    await loadMessages(selected);
    setBusy(false);
  };

  const action = async (type: string) => {
    if (!selected) return;
    setBusy(true);
    await fetch(`/api/conversations/${selected}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    });
    await loadMessages(selected);
    await loadConvos();
    setBusy(false);
  };

  const simulate = async () => {
    if (!sim.trim()) return;
    setBusy(true);
    await fetch("/api/dev/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sim }),
    });
    setBusy(false);
  };

  const current = convos.find((c) => c.id === selected) ?? null;

  return (
    <div className="inbox">
      {/* conversation list */}
      <div className="convo-list">
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div className="small muted" style={{ marginBottom: 6 }}>Simulate inbound (demo)</div>
          <input className="input" value={sim} onChange={(e) => setSim(e.target.value)} placeholder="Customer message…" />
          <button className="btn small primary" disabled={busy} onClick={simulate} style={{ marginTop: 6, width: "100%", justifyContent: "center" }}>
            Send as customer
          </button>
        </div>
        {convos.map((c) => (
          <div
            key={c.id}
            className={`convo-item${c.id === selected ? " active" : ""}`}
            onClick={() => setSelected(c.id)}
          >
            <div className="name">
              <span>{c.name}</span>
              {c.unreadCount > 0 && <span className="nav-badge">{c.unreadCount}</span>}
            </div>
            <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.preview}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="tag">{c.channel}</span>
              <span className={`pill ${c.status === "needs_human" ? "error" : "connected"}`} style={{ marginLeft: 4 }}>
                <span className="led" />
                {c.status.replace("_", " ")}
              </span>
            </div>
          </div>
        ))}
        {convos.length === 0 && <div className="muted small" style={{ padding: 12 }}>No conversations yet. Use the simulate box above.</div>}
      </div>

      {/* thread */}
      <div className="thread">
        <div className="thread-head">
          <div>
            <strong>{current?.name ?? "Select a conversation"}</strong>
            {current && <span className="muted small" style={{ marginLeft: 8 }}>· {current.channel}</span>}
          </div>
          {current && (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn small" disabled={busy} onClick={() => action("ai_run")}>Ask AI to reply</button>
              {current.status === "needs_human" ? (
                <button className="btn small" disabled={busy} onClick={() => action("release")}>Hand back to AI</button>
              ) : (
                <button className="btn small" disabled={busy} onClick={() => action("takeover")}>Take over</button>
              )}
              <button className="btn small" disabled={busy} onClick={() => action("learn")} title="Distill durable knowledge from this chat">Learn</button>
              {current.status !== "closed" && (
                <button className="btn small" disabled={busy} onClick={() => action("close")} title="Close + save to contact memory">Close</button>
              )}
            </div>
          )}
        </div>
        <div className="messages">
          {messages.map((m) => {
            const cls = m.direction === "inbound" ? "inbound" : m.sender === "ai" ? "ai" : "outbound";
            return (
              <div key={m.id} className={`bubble ${cls}`}>
                {m.text}
                <div className="meta">
                  {m.sender}
                  {m.direction === "outbound" ? ` · ${m.deliveryStatus}` : ""}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {current && (
          <div className="composer">
            <input
              className="input"
              value={draft}
              placeholder="Type a reply as a human…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn primary" disabled={busy || !draft.trim()} onClick={send}>Send</button>
          </div>
        )}
      </div>

      {/* contact panel */}
      <div className="contact-panel">
        <h3 style={{ textTransform: "uppercase", fontSize: ".75rem", color: "var(--text-muted)" }}>Contact</h3>
        {current ? (
          <>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginTop: 6 }}>{current.name}</div>
            <div className="muted small">{current.channel}</div>
            <div style={{ marginTop: 12 }}>
              <span className={`pill ${current.status === "needs_human" ? "error" : "connected"}`}>
                <span className="led" />
                {current.status.replace("_", " ")}
              </span>
            </div>
            <p className="muted small" style={{ marginTop: 16 }}>
              Orders, quote history and CRM fields appear here. Use “Take over” to pause the
              AI and reply yourself; “Hand back” resumes automation.
            </p>
          </>
        ) : (
          <div className="muted small">Select a conversation.</div>
        )}
      </div>
    </div>
  );
}
