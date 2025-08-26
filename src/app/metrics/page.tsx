"use client";

import { useEffect, useMemo, useState } from "react";

type Overview = {
  ok: boolean;
  totals: { qasAll: number; qas7d: number };
  latency: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
    avg: number | null;
  };
  daily: Array<{ day: string; count: number }>;
  topDocs: Array<{ docId: string; docName: string; hits: number }>;
  sampleSize: number;
  tenantId: string;
};

export default function MetricsPage() {
  const [tenantId, setTenantId] = useState("demo");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/metrics/overview?tenantId=${encodeURIComponent(tenantId)}`
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Erro ao carregar métricas");
      setData(json);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  const maxDaily = useMemo(() => {
    return data ? Math.max(1, ...data.daily.map((d) => d.count)) : 1;
  }, [data]);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 28 }}>Métricas — RAG FAQ</h1>
        <nav style={{ display: "flex", gap: 8 }}>
          <a href="/upload" style={linkBtn}>
            Upload
          </a>
          <a href="/chat" style={linkBtn}>
            Chat
          </a>
        </nav>
      </header>

      <section
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span>Tenant</span>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              minWidth: 160,
            }}
          />
        </label>
        <button onClick={load} disabled={loading} style={primaryBtn}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </section>

      {err && (
        <div style={{ color: "#b00020", marginBottom: 12 }}>Erro: {err}</div>
      )}

      {!data ? (
        <div>Carregando…</div>
      ) : (
        <>
          {/* Cards */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Card title="Q&As (7 dias)" value={data.totals.qas7d} />
            <Card title="Q&As (total)" value={data.totals.qasAll} />
            <Card title="Latência p50" value={ms(data.latency.p50)} />
            <Card title="Latência p95" value={ms(data.latency.p95)} />
            <Card title="Latência p99" value={ms(data.latency.p99)} />
            <Card title="Latência média" value={ms(data.latency.avg)} />
          </section>

          {/* Gráfico diário (7 dias por padrão) */}
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>
              Série diária (últimos {data.daily.length} dias)
            </h2>
            <div
              style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "end",
                  gap: 8,
                  height: 160,
                }}
              >
                {data.daily.map((d) => (
                  <div
                    key={d.day}
                    style={{ flex: 1, display: "grid", alignItems: "end" }}
                  >
                    <div
                      title={`${d.day}: ${d.count}`}
                      style={{
                        height: `${(d.count / maxDaily) * 140 + 4}px`,
                        background: "#111",
                        borderRadius: 6,
                      }}
                    />
                    <div
                      style={{
                        textAlign: "center",
                        marginTop: 6,
                        fontSize: 12,
                        color: "#555",
                      }}
                    >
                      {d.day.slice(5)}
                      {/* mostra MM-DD */}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Top documentos */}
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>
              Top documentos citados
            </h2>
            {data.topDocs.length === 0 ? (
              <div style={{ color: "#666" }}>Sem dados ainda.</div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  display: "grid",
                  gap: 8,
                }}
              >
                {data.topDocs.map((d) => (
                  <li
                    key={d.docId}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{d.docName}</div>
                    <div style={{ color: "#444" }}>Citações: {d.hits}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Rodapé mini */}
          <div style={{ marginTop: 18, color: "#666", fontSize: 12 }}>
            Amostra: {data.sampleSize} logs • tenant:{" "}
            <code>{data.tenantId}</code>
          </div>
        </>
      )}
    </main>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: number | string | null;
}) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
      <div style={{ color: "#666", fontSize: 13, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontWeight: 700, fontSize: 22 }}>{value ?? "—"}</div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "8px 12px",
  textDecoration: "none",
  color: "#111",
};

const primaryBtn: React.CSSProperties = {
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
};

function ms(x: number | null) {
  if (x == null) return "—";
  return `${x} ms`;
}
