import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { groupItemsByCreatedDay, renderDailyMarkdown } from "./markdown.js";
import type { SavedItem } from "./types.js";

export async function writeDailyMarkdown(
  outputDir: string,
  date: string,
  items: SavedItem[],
  summary?: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${date}.md`);
  await writeFile(filePath, renderDailyMarkdown(date, items, summary), "utf8");
  return filePath;
}

export async function writeDailyMarkdownFiles(
  outputDir: string,
  items: SavedItem[]
): Promise<string[]> {
  const groups = groupItemsByCreatedDay(items);
  const paths: string[] = [];
  for (const day of [...groups.keys()].sort()) {
    paths.push(await writeDailyMarkdown(outputDir, day, groups.get(day) ?? []));
  }
  return paths;
}
