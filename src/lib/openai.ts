import "server-only";
import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!_client) {
    if (!key) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}
