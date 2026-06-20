import Groq from "groq-sdk";

function sanitizeGroqKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\r/g, "")
    .replace(/^\uFEFF/, "");
}

export function parseGroqApiKeys(): string[] {
  const sources = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
  ];

  for (const source of sources) {
    if (!source?.trim()) continue;
    const keys = source
      .split(",")
      .map(sanitizeGroqKey)
      .filter((k) => k.length > 0);
    if (keys.length > 0) return keys;
  }
  return [];
}

const keys = parseGroqApiKeys();
if (keys.length > 0 && keys.some((k) => !k.startsWith("gsk_"))) {
  console.warn("[groq] One or more keys do not match expected gsk_ prefix.");
}

export const groq = new Groq({ apiKey: keys[0] ?? "" });
