import type { SavedItem } from "./types.js";

export function todayLocalDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function escapeMarkdown(text: string): string {
  return text.replace(/\r?\n/g, "\n  ");
}

function localDateFromIso(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(isoDate));
}

export function groupItemsByCreatedDay(items: SavedItem[]): Map<string, SavedItem[]> {
  const groups = new Map<string, SavedItem[]>();
  for (const item of items) {
    const day = localDateFromIso(item.createdAt ?? item.discoveredAt);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return groups;
}

export function renderDailyMarkdown(date: string, items: SavedItem[], summary?: string): string {
  const lines = [`# Daily Saved Items - ${date}`, ""];

  if (summary) {
    lines.push("## Summary", "", summary.trim(), "");
  }

  lines.push("## New Items", "");

  if (items.length === 0) {
    lines.push("No new saved items today.", "");
    return lines.join("\n");
  }

  const sortedItems = [...items].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
  for (const item of sortedItems) {
    const author = item.authorHandle
      ? `@${item.authorHandle}`
      : item.authorName ?? "Unknown author";
    lines.push(`### ${author}`, "");
    lines.push(`- Source: ${item.source}`);
    lines.push(`- Link: ${item.url}`);
    if (item.createdAt) lines.push(`- Created: ${item.createdAt}`);
    lines.push(`- Discovered: ${item.discoveredAt}`);
    lines.push("");
    lines.push(`> ${escapeMarkdown(item.text)}`);
    lines.push("");
    lines.push("- Status: inbox");
    lines.push("");
  }

  return lines.join("\n");
}
