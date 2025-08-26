import { Schema, model, models, Types } from "mongoose";

export interface IChunk {
  _id: Types.ObjectId;
  tenantId: string;
  docId: Types.ObjectId; // ref para Document
  source: "pdf" | "url" | "gdrive";
  page?: number; // nº da página (quando vier de PDF)
  heading?: string; // seção/título quando houver
  text: string; // conteúdo do chunk
  tokens?: number; // contagem aproximada (p/ métricas)
  embedding?: number[]; // vetor (dev/local)
  createdAt: Date; // preenchido via timestamps
}

const ChunkSchema = new Schema<IChunk>(
  {
    tenantId: { type: String, index: true, required: true },

    docId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      index: true,
      required: true,
    },

    source: { type: String, enum: ["pdf", "url", "gdrive"], required: true },

    // ⬇️ campo de topo, não dentro de docId
    page: { type: Number, index: true },

    heading: String,

    text: { type: String, required: true },

    tokens: Number,

    // sem índice vetorial no Mongo local; deixar como array simples
    // default: undefined evita salvar [] vazia
    embedding: { type: [Number], index: false, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Índices úteis (BM25 e filtros)
ChunkSchema.index({ text: "text" }); // busca textual
ChunkSchema.index({ tenantId: 1, docId: 1 }); // filtros rápidos

export const ChunkModel = models.Chunk || model<IChunk>("Chunk", ChunkSchema);
