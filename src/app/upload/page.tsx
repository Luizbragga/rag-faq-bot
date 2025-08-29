"use client";

import { useState } from "react";

export default function UploadPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [tenantId, setTenantId] = useState("demo");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function push(msg: string) {
    setLog((l) => [...l, msg]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setBusy(true);
    setLog([]);

    try {
      // 1) Ingestão do PDF
      push("Enviando PDF…");
      const fd = new FormData();
      fd.append("tenantId", tenantId);
      fd.append("file", file);

      const r1 = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
      const j1 = await r1.json();
      if (!j1.ok) throw new Error(j1.error || "Falha na ingestão");

      push(`OK: documento ${j1.docId} com ${j1.chunks} chunk(s).`);

      // 2) Backfill de embeddings
      push("Gerando embeddings… (primeira vez pode demorar)");
      const r2 = await fetch(
        `/api/embeddings/backfill?tenantId=${encodeURIComponent(
          tenantId
        )}&limit=1024`,
        { method: "POST" }
      );
      const j2 = await r2.json();
      if (!j2.ok) throw new Error(j2.error || "Falha no backfill");

      push(`OK: ${j2.processed} chunk(s) vetorizado(s).`);
      push("Pronto! Abra a página /chat e faça perguntas 👇");
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
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Upload de PDF</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Tenant/Workspace</span>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              maxWidth: 240,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Arquivo PDF</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={!file || busy}
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
            href="/upload/text"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              textDecoration: "none",
            }}
          >
            Inserir texto →
          </a>

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
