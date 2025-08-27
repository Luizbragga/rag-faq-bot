"use client";

import { useState } from "react";

type Citation = {
  id: string;
  name: string;
  snippet: string;
  page?: number;
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [cites, setCites] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleAsk(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorMsg("");
    setAnswer("");
    setCites([]);

    const question = input.trim();
    if (!question) return;

    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, // <<=== IMPORTANTE: 'question'
          tenantId: "demo",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);

      setAnswer(json.answer || "(sem resposta)");
      setCites(json.citations || []);
    } catch (err: any) {
      setErrorMsg(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">RAG FAQ – Demo</h1>

      <form onSubmit={handleAsk} className="flex gap-3">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Pergunte algo…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Perguntando..." : "Perguntar"}
        </button>
      </form>

      {errorMsg && <p className="mt-3 text-red-600 text-sm">{errorMsg}</p>}

      {answer && (
        <div className="mt-6">
          <h2 className="font-medium mb-2">Resposta</h2>
          <div className="whitespace-pre-wrap text-sm leading-6">{answer}</div>
        </div>
      )}

      {cites.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium mb-2">Citações</h3>
          <ul className="space-y-3">
            {cites.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="font-semibold">
                  {c.name}
                  {c.page != null ? ` (p. ${c.page})` : ""}
                </div>
                <div className="opacity-80">{c.snippet}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
