import mongoose from "mongoose";

type GlobalWithMongoose = typeof globalThis & {
  _mongoose?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const g = global as GlobalWithMongoose;
if (!g._mongoose) g._mongoose = { conn: null, promise: null };

export async function connectToDB() {
  const uri = process.env.MONGODB_URI;
  if (g._mongoose!.conn) return g._mongoose!.conn;
  if (!uri) throw new Error("Missing MONGODB_URI");

  if (!g._mongoose!.promise) {
    g._mongoose!.promise = mongoose.connect(uri, { dbName: "rag_faq_bot" });
  }
  g._mongoose!.conn = await g._mongoose!.promise;
  return g._mongoose!.conn;
}
