import type { AppConfig, SavedItem } from "./types.js";

function buildPrompt(items: SavedItem[]): string {
  const content = items
    .map((item, index) => {
      const author = item.authorHandle ? `@${item.authorHandle}` : item.authorName ?? "unknown";
      return `${index + 1}. ${author}: ${item.text}\n${item.url}`;
    })
    .join("\n\n");

  return `Summarize these saved posts for a personal daily review.

Return Markdown in Chinese with exactly these sections:
## Themes
## Key Notes
## Suggested Actions

Saved posts:
${content}`;
}

function extractOutputText(response: unknown): string {
  const object = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (object.output_text) return object.output_text;

  return (
    object.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" && part.text)
      .map((part) => part.text)
      .join("\n") ?? ""
  );
}

export async function summarizeItems(
  config: AppConfig,
  items: SavedItem[]
): Promise<string | undefined> {
  if (!config.summaryApiKey || items.length === 0) return undefined;

  const response = await fetch(config.summaryBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.summaryApiKey}`
    },
    body: JSON.stringify({
      model: config.summaryModel,
      input: buildPrompt(items),
      max_output_tokens: 1200
    })
  });

  if (!response.ok) {
    throw new Error(`Summary request failed: ${response.status} ${await response.text()}`);
  }

  const text = extractOutputText(await response.json()).trim();
  return text || undefined;
}
