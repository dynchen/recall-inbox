import type { SavedItem } from "../../types.js";

const GITHUB_STARS_URL = "https://api.github.com/user/starred?per_page=100";

interface GitHubOwner {
  login: string;
}

interface GitHubRepo {
  archived?: boolean;
  default_branch?: string | null;
  full_name: string;
  fork?: boolean;
  forks_count?: number;
  homepage?: string | null;
  html_url: string;
  description: string | null;
  language: string | null;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  open_issues_count?: number;
  pushed_at?: string | null;
  stargazers_count: number;
  topics?: string[];
  updated_at?: string | null;
  owner: GitHubOwner;
}

interface GitHubStar {
  starred_at: string;
  repo: GitHubRepo;
}

export interface FetchGitHubStarsOptions {
  knownItemIds?: Set<string>;
  maxPages?: number;
  stopOnKnownPage?: boolean;
}

function nextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part.trim());
    if (match) return match[1];
  }
  return undefined;
}

function starToSavedItem(star: GitHubStar, discoveredAt: string): SavedItem {
  const repo = star.repo;
  const metadata = Object.fromEntries(
    Object.entries({
      license: repo.license?.spdx_id || repo.license?.name || undefined,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      archived: repo.archived,
      fork: repo.fork,
      homepage: repo.homepage || undefined,
      defaultBranch: repo.default_branch || undefined,
      updatedAt: repo.updated_at || undefined,
      pushedAt: repo.pushed_at || undefined
    }).filter(([, value]) => value !== undefined)
  );
  const text = [
    repo.full_name,
    repo.description,
    repo.language ? `Language: ${repo.language}` : undefined,
    `Stars: ${repo.stargazers_count}`,
    repo.topics?.length ? `Topics: ${repo.topics.join(", ")}` : undefined
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `github:${repo.full_name}`,
    source: "github",
    sourceItemId: repo.full_name,
    url: repo.html_url,
    authorName: repo.owner.login,
    authorHandle: repo.owner.login,
    text,
    discoveredAt,
    createdAt: star.starred_at,
    tags: [],
    ...(Object.keys(metadata).length ? { metadata: { github: metadata } } : {})
  };
}

export async function fetchGitHubStars(
  token: string,
  options: FetchGitHubStarsOptions = {}
): Promise<SavedItem[]> {
  const items: SavedItem[] = [];
  let url: string | undefined = GITHUB_STARS_URL;
  let fetchedPages = 0;
  const discoveredAt = new Date().toISOString();

  while (url) {
    fetchedPages += 1;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.star+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "recall-inbox"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub stars request failed: ${response.status} ${await response.text()}`);
    }

    const pageItems = ((await response.json()) as GitHubStar[]).map((star) =>
      starToSavedItem(star, discoveredAt)
    );
    items.push(...pageItems);

    url = nextLink(response.headers.get("link"));
    if (options.maxPages && fetchedPages >= options.maxPages) {
      break;
    }
    if (
      options.stopOnKnownPage !== false &&
      options.knownItemIds &&
      pageItems.length > 0 &&
      pageItems.every((item) => options.knownItemIds?.has(item.id))
    ) {
      break;
    }
  }

  return items;
}
