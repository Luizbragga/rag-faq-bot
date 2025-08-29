// src/app/upload/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";

type Tab = "pdf" | "text";

export default function UploadPage() {
  console.log("UI build: tabs PDF+Texto carregada"); // marcador visual de versão
  const [tab, setTab] = useState<Tab>("pdf");

  // comuns
  const [tenantId, setTenantId] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (m: string) => setLog((l) => [...l, m]);

  // PDF
  const [file, setFile] = useState<File | null>(null);

  // Texto
  const [seedName, setSeedName] = useState("seed-manual");
  const [seedText, setSeedText] = useState("");

  async function backfill() {
    push("Gerando embeddings (pode demorar na 1ª vez)...");
    const r = await fetch(
      `/api/embeddings/backfill?tenantId=${encodeURIComponent(
        tenantId
      )}&limit=1024`,
      { method: "POST" }
    );
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Falha no backfill");
    push(`OK: ${j.processed} chunk(s) vetorizaram.`);
  }

  async function submitPdf() {
    if (!file) throw new Error("Selecione um PDF");
    push("Enviando PDF...");
    const fd = new FormData();
    fd.append("tenantId", tenantId);
    fd.append("file", file);

    const r1 = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
    const j1 = await r1.json();
    if (!j1.ok) throw new Error(j1.error || "Falha na ingestão do PDF");

    push(`OK: documento ${j1.docId} com ${j1.chunks} chunk(s).`);
    await backfill();
    push("Pronto! Vá para o /chat e pergunte 👇");
  }

  async function submitText() {
    const t = seedText.trim();
    if (!t) throw new Error("Digite algum texto");
    push("Criando documento de texto...");
    const r1 = await fetch("/api/ingest/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        name: seedName || "seed-manual",
        text: t,
      }),
    });
    const j1 = await r1.json();
    if (!j1.ok) throw new Error(j1.error || "Falha na ingestão do texto");

    push(`OK: documento ${j1.docId} com ${j1.chunks} chunk(s).`);
    await backfill();
    push("Pronto! Vá para o /chat e pergunte 👇");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLog([]);
    try {
      if (tab === "pdf") await submitPdf();
      else await submitText();
    } catch (err: any) {
      push("Erro: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = {
    maxWidth: 820,
    margin: "40px auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  };

  const label: React.CSSProperties = {
    display: "grid",
    gap: 6,
    marginBottom: 10,
  };
  const input: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    maxWidth: 360,
  };
  const btn: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #222",
    background: "#111",
    color: "#fff",
  };
  const btnGhost: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #ccc",
    textDecoration: "none",
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 8,
    border: active ? "1px solid #111" : "1px solid #ccc",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
  });

  return (
    <main style={box}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Upload (PDF ou Texto)</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("pdf")} style={tabBtn(tab === "pdf")}>
          PDF
        </button>
        <button onClick={() => setTab("text")} style={tabBtn(tab === "text")}>
          Texto
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={label}>
          <span>Tenant/Workspace</span>
          <input
            style={input}
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="demo"
          />
        </label>

        {tab === "pdf" ? (
          <label style={label}>
            <span>Arquivo PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        ) : (
          <>
            <label style={label}>
              <span>Nome do documento (opcional)</span>
              <input
                style={input}
                value={seedName}
                onChange={(e) => setSeedName(e.target.value)}
                placeholder="seed-manual"
              />
            </label>

            <label style={label}>
              <span>Texto</span>
              <textarea
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                rows={10}
                style={{
                  ...input,
                  width: "100%",
                  maxWidth: "100%",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
                placeholder="Cole aqui o conteúdo que deseja indexar…"
              />
            </label>
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button type="submit" disabled={busy} style={btn}>
            {busy ? "Processando…" : "Enviar e Indexar"}
          </button>
          <a href="/chat" style={btnGhost}>
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
