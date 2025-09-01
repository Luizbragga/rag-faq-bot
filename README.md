RAG FAQ – Demo

AI FAQ (RAG) demo construída com Next.js (App Router) + Groq (LLM) + MongoDB + embeddings locais (com opção de provedores externos).
Interface simples: /upload (PDF ou texto) para indexação e /chat para perguntas com citações.

Demo pública (seu deploy): https://rag-faq-bot-tau.vercel.app

Recursos

RAG com recuperação por similaridade + citações das fontes.

Upload via UI: PDF ou Texto em /upload.

Embeddings locais (modelo pequeno e rápido), com backfill automático.

LLM: Groq (ex.: llama-3.1-70b ou similar).

Idiomas: detecção automática pt-BR e en (responde no idioma da pergunta).

Demo mode: limite de documentos e proteção de abuso.

APIs REST para ingestão/depuração.

Stack

Next.js 15 (App Router)

TypeScript

MongoDB (Atlas ou local)

Groq (LLM)

Embeddings: local por padrão
(opcional: Jina, Cohere ou OpenAI como provedores alternativos)

Estrutura (simplificada)
src/
  app/
    api/
      chat/route.ts                # Endpoint do chat (RAG)
      ingest/
        pdf/route.ts               # Ingestão de PDF (multipart)
        text/route.ts              # Ingestão de texto (JSON)
      embeddings/backfill/route.ts # Vetorização pendente (local ou provedor)
      health/route.ts              # Ping de saúde
      dbcheck/route.ts             # Ping do Mongo
      modelcheck/route.ts          # Índices/estado
    chat/page.tsx                  # UI do chat
    upload/page.tsx                # UI com abas PDF/Text
  lib/…                            # DB, chunking, retrieval, etc.
  models/…                         # Mongoose schemas

Variáveis de ambiente

Crie um arquivo .env.local na raiz:

# Ambiente
NODE_ENV=development

# LLM (Groq)
GROQ_API_KEY=coloque_sua_chave_groq_aqui

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/rag_faq_bot
MONGODB_DB=ragfaq

# Demo
DEFAULT_TENANT=demo
DEMO_MODE=true
MAX_DOCS_PER_TENANT=5
DEMO_MAX_DOCS=20
QA_RATE_LIMIT_PER_MIN=30

# Embeddings (opções)
# Provedor padrão: local (não requer chave)
EMBEDDINGS_PROVIDER=local

# Caso queira usar Jina/Cohere/OpenAI:
# EMBEDDINGS_PROVIDER=jina
# JINA_API_KEY=sua_chave_jina

# EMBEDDINGS_PROVIDER=cohere
# COHERE_API_KEY=sua_chave_cohere

# EMBEDDINGS_PROVIDER=openai
# OPENAI_API_KEY=sua_chave_openai


Dica: Em produção (Vercel), cadastre as mesmas variáveis em Project → Settings → Environment Variables e Redeploy.

Rodando localmente
npm i
npm run dev
# abre http://localhost:3000

Ingestão de conteúdo
Via UI (recomendado)

Acesse /upload.

Escolha a aba PDF ou Texto.

Informe o Tenant (ex.: demo) e envie.

O backfill de embeddings é disparado pela própria página.

Via API (opcional)

Texto

curl -X POST "http://localhost:3000/api/ingest/text" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "demo",
    "name": "seed-manual",
    "text": "Cole aqui um conteúdo longo que o bot deve conhecer…"
  }'


PDF

curl -X POST "http://localhost:3000/api/ingest/pdf" \
  -F "tenantId=demo" \
  -F "file=@./seu-arquivo.pdf"


Backfill de embeddings (somente para chunks pendentes):

curl -X POST "http://localhost:3000/api/embeddings/backfill?tenantId=demo&limit=1024"

Chat

Acesse /chat.

Pergunte em pt-BR ou inglês; a resposta segue o idioma detectado.

O bot só responde com base no que foi indexado (se não houver base, ele informa que não há evidências).

As citações aparecem abaixo da resposta.

Endpoints úteis

GET /api/health → { ok: true }

GET /api/dbcheck → status do Mongo

GET /api/modelcheck → índices & contagens

POST /api/ingest/text → ingestão de texto

POST /api/ingest/pdf → ingestão de PDF (multipart)

POST /api/embeddings/backfill?tenantId=…&limit=… → vetorização

Deploy na Vercel

Importe o repo na Vercel.

Em Settings → Environment Variables, adicione todas as variáveis do .env.local.

Redeploy.

Use as rotas já publicadas:

/upload – indexação

/chat – perguntas

/api/health, /api/dbcheck, /api/modelcheck – diagnóstico

Dicas e problemas comuns

Respostas em múltiplos idiomas: a detecção é automática com fallback para pt-BR.

Muitas citações repetidas: isso é normal quando o mesmo documento contém várias partes relevantes. O ranking tenta diversificar, mas pode listar múltiplos trechos do mesmo “seed”.

Demo travando: verifique DEMO_MODE e limites (MAX_DOCS_PER_TENANT).

Jina/Cohere/OpenAI: mude EMBEDDINGS_PROVIDER e informe a chave correta; redeploy.

Licença

MIT — use livremente, dê os devidos créditos se te ajudou 

Contato

Autor: Luiz Henrique Braga

Demo: https://rag-faq-bot-tau.vercel.app

Dúvidas/sugestões: abra uma Issue no repositório.
