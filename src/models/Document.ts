import { Schema, model, models, Types } from "mongoose";

export type DocType = "pdf" | "url" | "gdrive";
export type DocStatus = "processing" | "ready" | "failed";

export interface IDocument {
  _id: Types.ObjectId;
  tenantId: string; // separação por cliente/workspace
  name: string; // nome amigável
  type: DocType;
  sourceUrl?: string; // para URLs (ou link do Drive)
  storageKey?: string; // caminho do arquivo (S3/GridFS), se houver
  pageCount?: number;
  status: DocStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    tenantId: { type: String, index: true, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["pdf", "url", "gdrive"], required: true },
    sourceUrl: String,
    storageKey: String,
    pageCount: Number,
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
  },
  { timestamps: true }
);

export const DocumentModel =
  models.Document || model<IDocument>("Document", DocumentSchema);
