const EMBEDDING_API_URL = process.env.OPENAI_BASE_URL + "/embeddings";
const EMBEDDING_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-v4";

/**
 * Generate an embedding vector for the given text using the configured model.
 * Returns a float array of EMBEDDING_DIMENSIONS length.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

/**
 * Build the text to embed for a skill.
 * Combines name, description, category and tags for richer semantic coverage.
 */
export function buildSkillEmbeddingText(skill: {
  name: string;
  description: string;
  category: string;
  tags?: string[];
}): string {
  const tags = skill.tags?.join(", ") ?? "";
  return `${skill.name}. ${skill.description} Category: ${skill.category}. Tags: ${tags}`;
}
