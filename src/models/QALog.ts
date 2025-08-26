import { Schema, model, models, Types } from "mongoose";

export type Feedback = "up" | "down" | null;

export interface IQALog {
  _id: Types.ObjectId;
  tenantId: string;
  question: string;
  retrievedIds: Types.ObjectId[]; // ids dos chunks usados
  model: string; // ex.: gpt-4o-mini
  latencyMs: number;
  costUsd?: number;
  hadCitation: boolean;
  feedback: Feedback;
  createdAt: Date;
}

const QALogSchema = new Schema<IQALog>(
  {
    tenantId: { type: String, index: true, required: true },
    question: { type: String, required: true },
    retrievedIds: [{ type: Schema.Types.ObjectId, ref: "Chunk" }],
    model: String,
    latencyMs: Number,
    costUsd: Number,
    hadCitation: { type: Boolean, default: false },
    feedback: { type: String, enum: ["up", "down", null], default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

QALogSchema.index({ tenantId: 1, createdAt: -1 });

export const QALogModel = models.QALog || model<IQALog>("QALog", QALogSchema);
