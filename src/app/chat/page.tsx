"use client";

import { useState } from "react";

type Citation = {
  chunkId: string;
  docId: string;
  docName: string;
  preview: string;
  page?: number | null;
};

export default function ChatPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [cites, setCites] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // feedback
  const [logId, setLogId] = useState<string | null>(null);
  const [sentFeedback, setSentFeedback] = useState<"up" | "down" | null>(null);
  const [sendingFb, setSendingFb] = useState(false);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCites([]);
    setLogId(null);
    setSentFeedback(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "demo", query }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Erro ao consultar");
      setAnswer(data.answer as string);
      setCites((data.citations as Citation[]) || []);
      if (data.logId) setLogId(String(data.logId));
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(fb: "up" | "down") {
    if (!logId || sendingFb || sentFeedback) return;
    setSendingFb(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, feedback: fb }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Erro ao enviar feedback");
      setSentFeedback(fb);
    } catch (e: any) {
      alert(e?.message ?? "Falha ao enviar feedback");
    } finally {
      setSendingFb(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>RAG FAQ – Demo</h1>
      <form
        onSubmit={onAsk}
        style={{ display: "flex", gap: 8, marginBottom: 16 }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite sua pergunta… ex: horário de suporte"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #222",
            background: "#111",
            color: "#fff",
          }}
        >
          {loading ? "Consultando…" : "Perguntar"}
        </button>
      </form>

      {error && (
        <div style={{ color: "#b00020", marginBottom: 12 }}>Erro: {error}</div>
      )}

      {answer && (
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Resposta</h2>
          <p style={{ lineHeight: 1.6 }}>{answer}</p>

          {/* Feedback */}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              disabled={!logId || sendingFb || !!sentFeedback}
              onClick={() => sendFeedback("up")}
              title="Útil"
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background:
                  sentFeedback === "up" ? "rgba(0,200,0,.1)" : "transparent",
              }}
            >
              👍 Útil
            </button>
            <button
              disabled={!logId || sendingFb || !!sentFeedback}
              onClick={() => sendFeedback("down")}
              title="Não ajudou"
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background:
                  sentFeedback === "down" ? "rgba(200,0,0,.1)" : "transparent",
              }}
            >
              👎 Não ajudou
            </button>
            {sentFeedback && (
              <span style={{ color: "#555", alignSelf: "center" }}>
                Obrigado pelo feedback!
              </span>
            )}
          </div>
        </section>
      )}

      {cites.length > 0 && (
        <section>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>
            Citações ({cites.length})
          </h3>
          <ul
            style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}
          >
            {cites.map((c) => (
              <li
                key={c.chunkId}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {c.docName} {c.page ? `(p. ${c.page})` : ""}
                </div>
                <div style={{ color: "#444" }}>{c.preview}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
