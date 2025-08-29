// src/app/upload/page.tsx
"use client"; // ← tem que vir primeiro
export const dynamic = "force-dynamic";

import { useState } from "react";

type Mode = "pdf" | "text";

export default function UploadPage() {
  const [tenantId, setTenantId] = useState("demo");
  const [mode, setMode] = useState<Mode>("pdf");

  // PDF
  const [file, setFile] = useState<File | null>(null);

  // TEXTO
  const [textName, setTextName] = useState("texto-manual");
  const [textBody, setTextBody] = useState("");

  // UI
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function push(msg: string) {
    setLog((l) => [...l, msg]);
  }

  async function backfillEmbeddings() {
    push(
      "Gerando embeddings… (primeira vez pode demorar por causa do download do modelo)"
    );
    const r = await fetch(
      `/api/embeddings/backfill?tenantId=${encodeURIComponent(
        tenantId
      )}&limit=2000`,
      { method: "POST" }
    );
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Falha no backfill");
    push(`OK: ${j.processed} chunk(s) vetorizado(s).`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLog([]);

    try {
      if (mode === "pdf") {
        if (!file) throw new Error("Selecione um PDF");
        push("Enviando PDF…");

        const fd = new FormData();
        fd.append("tenantId", tenantId);
        fd.append("file", file);

        const r1 = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
        const j1 = await r1.json();
        if (!j1.ok) throw new Error(j1.error || "Falha na ingestão do PDF");

        push(`OK: documento ${j1.docId} com ${j1.chunks} chunk(s).`);
        await backfillEmbeddings();
        push("Pronto! Abra a página /chat e faça perguntas 👇");
      } else {
        // TEXT
        const body = (textBody || "").trim();
        if (!body) throw new Error("Digite um texto para indexar");

        push("Enviando TEXTO…");
        const r1 = await fetch("/api/ingest/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            name: textName || `seed-${new Date().toISOString().slice(0, 19)}`,
            text: body,
          }),
        });
        const j1 = await r1.json();
        if (!j1.ok) throw new Error(j1.error || "Falha na ingestão do texto");

        push(`OK: documento ${j1.docId} com ${j1.chunks} chunk(s).`);
        await backfillEmbeddings();
        push("Pronto! Abra a página /chat e faça perguntas 👇");
      }
    } catch (err: any) {
      push("Erro: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
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
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Upload (PDF ou Texto)</h1>

      {/* Tenant */}
      <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <span>Tenant/Workspace</span>
        <input
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            maxWidth: 260,
          }}
        />
      </label>

      {/* Modo */}
      <div style={{ display: "flex", gap: 12, margin: "12px 0 16px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="radio"
            name="mode"
            value="pdf"
            checked={mode === "pdf"}
            onChange={() => setMode("pdf")}
          />
          PDF
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="radio"
            name="mode"
            value="text"
            checked={mode === "text"}
            onChange={() => setMode("text")}
          />
          Texto
        </label>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        {mode === "pdf" ? (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Arquivo PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </>
        ) : (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Nome do documento (opcional)</span>
              <input
                value={textName}
                onChange={(e) => setTextName(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  maxWidth: 320,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Texto para indexar</span>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                rows={10}
                placeholder="Cole aqui o texto que deseja indexar…"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  width: "100%",
                  resize: "vertical",
                }}
              />
            </label>
          </>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={busy || (mode === "pdf" ? !file : false)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #222",
              background: "#111",
              color: "#fff",
            }}
          >
            {busy ? "Processando…" : "Enviar e Indexar"}
          </button>

          <a
            href="/chat"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              textDecoration: "none",
            }}
          >
            Ir para o chat →
          </a>
        </div>
      </form>

      {log.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Status</h2>
          <ol style={{ paddingLeft: 18 }}>
            {log.map((l, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {l}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
