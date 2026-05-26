import { Input } from "@base-ui/react/input";
import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import type { ComponentProps } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

type SavedItemStatus = "inbox" | "keep" | "action" | "dismiss";

interface SavedItem {
  id: string;
  source: string;
  sourceItemId?: string;
  url: string;
  authorName?: string;
  authorHandle?: string;
  text: string;
  discoveredAt: string;
  createdAt?: string;
  tags?: string[];
  note?: string;
  status?: SavedItemStatus;
  metadata?: Record<string, unknown>;
}

interface DateCount {
  date: string;
  count: number;
}

interface SelectOption {
  label: string;
  value: string;
}

interface QueuePreset {
  id: string;
  label: string;
  description: string;
  source: string;
  status: SavedItemStatus;
}

interface ViewItem extends SavedItem {
  createdLabel: string;
  dateKey: string;
  details: GitHubDetails | null;
  discoveredLabel: string;
  normalizedStatus: SavedItemStatus;
  searchText: string;
  shouldClamp: boolean;
  sortKey: string;
}

type SyncSource = "all" | "x" | "github";
type SourceSync = Exclude<SyncSource, "all">;

interface SyncResult {
  newItems: number;
  stored: number;
  sources: Record<string, { status: string }>;
}

interface SourceAction {
  source: SourceSync;
  label: string;
  authPath?: string;
  description: string;
}

interface SourceStatus {
  configured: boolean;
  authorized: boolean;
  syncEnabled: boolean;
  reason?: string;
}

interface AdminStatus {
  sources: Record<SourceSync, SourceStatus>;
}

interface GitHubDetails {
  description: string;
  metadata: GitHubMetadata | null;
  repo: string;
  stars?: string;
  topics: string[];
}

interface GitHubMetadata {
  license?: string;
  forks?: number;
  openIssues?: number;
  archived?: boolean;
  fork?: boolean;
  homepage?: string;
  defaultBranch?: string;
  updatedAt?: string;
  pushedAt?: string;
}

interface XUrlEntity {
  url?: string;
  expanded_url?: string;
  display_url?: string;
}

interface XMedia {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
}

interface XReferencedTweet {
  type?: string;
  id?: string;
  text?: string;
}

interface XMetadata {
  publicMetrics?: Record<string, number>;
  entities?: {
    urls?: XUrlEntity[];
  };
  media?: XMedia[];
  referencedTweets?: XReferencedTweet[];
  referencedTweetObjects?: XReferencedTweet[];
  possiblySensitive?: boolean;
}

const statusOptions: SavedItemStatus[] = ["inbox", "keep", "action", "dismiss"];
const INITIAL_RENDER_LIMIT = 50;
const RENDER_BATCH_SIZE = 50;
const RENDER_BATCH_DELAY = 24;
const statusLabels: Record<SavedItemStatus, string> = {
  inbox: "Inbox",
  keep: "Keep",
  action: "Action",
  dismiss: "Dismiss"
};
const statusSelectOptions: SelectOption[] = statusOptions.map((status) => ({ label: statusLabels[status], value: status }));
const sourceActions: SourceAction[] = [
  {
    source: "x",
    label: "X",
    authPath: "/api/auth/x/start",
    description: "Requires one-time OAuth authorization before bookmark sync."
  },
  {
    source: "github",
    label: "GitHub",
    description: "Uses the configured GitHub token."
  }
];
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function itemDate(item: SavedItem): string {
  return dateFormatter.format(new Date(item.createdAt || item.discoveredAt));
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  return dateTimeFormatter.format(new Date(iso));
}

function shouldClampText(text: string): boolean {
  return text.length > 280 || text.split(/\r?\n/).length > 4;
}

function normalizeStatus(status?: string): SavedItemStatus {
  return statusOptions.includes(status as SavedItemStatus) ? (status as SavedItemStatus) : "inbox";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function shortcutStatus(key: string): SavedItemStatus | undefined {
  const normalized = key.toLowerCase();
  if (normalized === "i") return "inbox";
  if (normalized === "k") return "keep";
  if (normalized === "a") return "action";
  if (normalized === "d") return "dismiss";
  return undefined;
}

function sortItems<T extends { sortKey: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    b.sortKey.localeCompare(a.sortKey)
  );
}

function buildSearchText(item: SavedItem): string {
  return [item.text, item.authorName, item.authorHandle, ...(item.tags || [])]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function matchesQuery(item: ViewItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return item.searchText.includes(normalized);
}

function buildDateCounts(items: { dateKey: string }[]): DateCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const date = item.dateKey;
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function sourceLabel(source: string): string {
  return source === "github" ? "GitHub" : "X";
}

function splitTopics(topics?: string): string[] {
  if (!topics) return [];
  return topics
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function githubDetails(item: SavedItem): GitHubDetails | null {
  if (item.source !== "github") return null;
  const lines = item.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const repo = item.sourceItemId || lines[0] || item.authorName || "GitHub repository";
  const stars = lines.find((line) => line.startsWith("Stars: "))?.replace("Stars: ", "");
  const topics = splitTopics(lines.find((line) => line.startsWith("Topics: "))?.replace("Topics: ", ""));
  const description = lines
    .filter(
      (line) =>
        line !== repo &&
        !line.startsWith("Language: ") &&
        !line.startsWith("Stars: ") &&
        !line.startsWith("Topics: ")
    )
    .join(" ");

  return { description, metadata: githubMetadata(item), repo, stars, topics };
}

function githubMetadata(item: SavedItem): GitHubMetadata | null {
  return item.source === "github" && item.metadata?.github && typeof item.metadata.github === "object"
    ? item.metadata.github as GitHubMetadata
    : null;
}

function githubSignalChips(item: SavedItem): string[] {
  const metadata = githubMetadata(item);

  const chips: string[] = [];
  if (metadata?.license) chips.push(metadata.license);
  if (typeof metadata?.forks === "number") chips.push(`${metadata.forks} forks`);
  if (typeof metadata?.openIssues === "number") chips.push(`${metadata.openIssues} issues`);
  if (metadata?.archived) chips.push("archived");
  if (metadata?.fork) chips.push("fork");
  return chips;
}

function sourceSignalChips(item: SavedItem): string[] {
  return item.source === "github" ? githubSignalChips(item) : xSignalChips(item);
}

function xMetadata(item: SavedItem): XMetadata | null {
  return item.source === "x" && item.metadata?.x && typeof item.metadata.x === "object"
    ? item.metadata.x as XMetadata
    : null;
}

function xSignalChips(item: SavedItem): string[] {
  const metadata = xMetadata(item);
  if (!metadata) return [];

  const urls = metadata.entities?.urls ?? [];
  const media = metadata.media ?? [];
  const referencedTweets = metadata.referencedTweets ?? [];
  const metrics = metadata.publicMetrics ?? {};
  const chips: string[] = [];

  if (urls.length) chips.push(`${urls.length} ${urls.length === 1 ? "link" : "links"}`);
  if (media.length) {
    const mediaTypes = [...new Set(media.map((item) => item.type).filter(Boolean))];
    chips.push(mediaTypes.length ? mediaTypes.join(" / ") : `${media.length} media`);
  }
  if (referencedTweets.some((tweet) => tweet.type === "quoted")) chips.push("quote");
  if (metadata.possiblySensitive) chips.push("sensitive");
  if (typeof metrics.bookmark_count === "number") chips.push(`${metrics.bookmark_count} bookmarks`);
  if (typeof metrics.like_count === "number") chips.push(`${metrics.like_count} likes`);

  return chips;
}

function metricEntries(metrics?: Record<string, number>): Array<[string, number]> {
  if (!metrics) return [];
  return Object.entries(metrics).filter(([, value]) => typeof value === "number");
}

function sourceUrls(metadata: XMetadata): XUrlEntity[] {
  return metadata.entities?.urls ?? [];
}

export function App() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dailyReviewActive, setDailyReviewActive] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSecret, setAdminSecret] = useState(() => sessionStorage.getItem("recall-inbox-admin-secret") || "");
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncingAction, setSyncingAction] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const [openReviewItems, setOpenReviewItems] = useState<Set<string>>(() => new Set());
  const [savingItems, setSavingItems] = useState<Map<string, string>>(() => new Map());
  const [focusedItemId, setFocusedItemId] = useState("");
  const [itemsAnimating, setItemsAnimating] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);
  const [visibleItemLimit, setVisibleItemLimit] = useState(INITIAL_RENDER_LIMIT);
  const [, startItemsTransition] = useTransition();
  const itemsAnimationTimer = useRef<number | undefined>(undefined);
  const saveVersions = useRef(new Map<string, number>());

  async function loadItems() {
    setLoadingItems(true);
    try {
      const response = await fetch("/api/items");
      if (!response.ok) throw new Error("Failed to load items.");
      const data = (await response.json()) as { items?: SavedItem[] };
      startItemsTransition(() => {
        setItems(data.items || []);
        setVisibleItemLimit(INITIAL_RENDER_LIMIT);
        setLoadError(false);
      });
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    loadItems().catch(() => setLoadError(true));
  }, []);

  const viewItems = useMemo<ViewItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        createdLabel: formatDateTime(item.createdAt),
        dateKey: itemDate(item),
        details: githubDetails(item),
        discoveredLabel: formatDateTime(item.discoveredAt),
        normalizedStatus: normalizeStatus(item.status),
        searchText: buildSearchText(item),
        shouldClamp: shouldClampText(item.text),
        sortKey: item.createdAt || item.discoveredAt
      })),
    [items]
  );
  const sortedViewItems = useMemo(() => sortItems(viewItems), [viewItems]);
  const dateCounts = useMemo(() => buildDateCounts(viewItems), [viewItems]);
  const latestReviewItem = sortedViewItems.find((item) => item.normalizedStatus === "inbox");
  const latestReviewDate = latestReviewItem?.dateKey;
  const latestReviewInboxCount = useMemo(
    () =>
      latestReviewDate
        ? viewItems.filter((item) => item.dateKey === latestReviewDate && item.normalizedStatus === "inbox").length
        : 0,
    [latestReviewDate, viewItems]
  );
  const dateOptions = useMemo(
    () => [
      { label: `All dates (${items.length})`, value: "all" },
      ...dateCounts.map(({ date, count }) => ({ label: `${date} (${count})`, value: date }))
    ],
    [dateCounts, items.length]
  );
  const sources = useMemo(() => [...new Set(viewItems.map((item) => item.source))].sort(), [viewItems]);
  const allStatusCounts = useMemo(
    () =>
      viewItems.reduce(
        (counts, item) => {
          counts[item.normalizedStatus] += 1;
          return counts;
        },
        { inbox: 0, keep: 0, action: 0, dismiss: 0 } as Record<SavedItemStatus, number>
      ),
    [viewItems]
  );
  const sourceInboxCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of viewItems) {
      if (item.normalizedStatus === "inbox") {
        counts.set(item.source, (counts.get(item.source) || 0) + 1);
      }
    }
    return counts;
  }, [viewItems]);
  const queuePresets = useMemo<QueuePreset[]>(
    () => [
      {
        id: "unreviewed",
        label: "Unreviewed",
        description: `${allStatusCounts.inbox} inbox`,
        source: "all",
        status: "inbox"
      },
      {
        id: "action-items",
        label: "Action items",
        description: `${allStatusCounts.action} action`,
        source: "all",
        status: "action"
      },
      ...sources.map((source) => ({
        id: `${source}-inbox`,
        label: `${sourceLabel(source)} inbox`,
        description: `${sourceInboxCounts.get(source) || 0} inbox`,
        source,
        status: "inbox" as SavedItemStatus
      }))
    ],
    [allStatusCounts.action, allStatusCounts.inbox, sourceInboxCounts, sources]
  );
  const sourceOptions = useMemo(
    () => [
      { label: "All sources", value: "all" },
      ...sources.map((source) => ({ label: sourceLabel(source), value: source }))
    ],
    [sources]
  );
  const filteredItems = useMemo(
    () =>
      sortedViewItems
        .filter((item) => selectedDate === "all" || item.dateKey === selectedDate)
        .filter((item) => selectedSource === "all" || item.source === selectedSource)
        .filter((item) => selectedStatus === "all" || item.normalizedStatus === selectedStatus)
        .filter((item) => matchesQuery(item, deferredQuery)),
    [deferredQuery, selectedDate, selectedSource, selectedStatus, sortedViewItems]
  );
  const renderedItems = useMemo(
    () => filteredItems.slice(0, visibleItemLimit),
    [filteredItems, visibleItemLimit]
  );
  const visibleStatusCounts = useMemo(
    () =>
      filteredItems.reduce(
        (counts, item) => {
          counts[item.normalizedStatus] += 1;
          return counts;
        },
        { inbox: 0, keep: 0, action: 0, dismiss: 0 } as Record<SavedItemStatus, number>
      ),
    [filteredItems]
  );
  const activeQueueLabel = dailyReviewActive
    ? "Daily Review"
    : selectedStatus !== "all"
      ? statusLabels[selectedStatus as SavedItemStatus]
      : selectedSource !== "all"
        ? sourceLabel(selectedSource)
        : "All Items";
  const activeQueueDescription = dailyReviewActive
    ? `${filteredItems.length} inbox items for ${selectedDate}`
    : `${filteredItems.length} visible after filters`;

  useEffect(
    () => () => {
      if (itemsAnimationTimer.current !== undefined) {
        window.clearTimeout(itemsAnimationTimer.current);
      }
    },
    []
  );

  useEffect(() => {
    setVisibleItemLimit(INITIAL_RENDER_LIMIT);
  }, [deferredQuery, selectedDate, selectedSource, selectedStatus]);

  useEffect(() => {
    if (loadingItems || visibleItemLimit >= filteredItems.length) return;
    const timer = window.setTimeout(() => {
      setVisibleItemLimit((current) => Math.min(current + RENDER_BATCH_SIZE, filteredItems.length));
    }, RENDER_BATCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [filteredItems.length, loadingItems, visibleItemLimit]);

  useEffect(() => {
    if (!filteredItems.length) {
      setFocusedItemId("");
      return;
    }
    if (!filteredItems.some((item) => item.id === focusedItemId)) {
      setFocusedItemId(filteredItems[0].id);
    }
  }, [filteredItems, focusedItemId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      const focusedItem = filteredItems.find((item) => item.id === focusedItemId) || filteredItems[0];
      if (!focusedItem) return;

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setFocusedItemId(focusedItem.id);
        setReviewOpen(focusedItem.id, true);
        return;
      }

      const status = shortcutStatus(event.key);
      if (!status) return;
      event.preventDefault();
      setFocusedItemId(focusedItem.id);
      saveItemPatch(focusedItem.id, { status });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredItems, focusedItemId]);

  function finishItemsAnimation(delay = 160) {
    if (itemsAnimationTimer.current !== undefined) {
      window.clearTimeout(itemsAnimationTimer.current);
    }
    itemsAnimationTimer.current = window.setTimeout(() => setItemsAnimating(false), delay);
  }

  function changeDate(nextDate: string) {
    if (nextDate === selectedDate) return;

    const applyDate = () => {
      if (dailyReviewActive && nextDate !== latestReviewDate) {
        setDailyReviewActive(false);
      }
      setSelectedStatus("all");
      setSelectedDate(nextDate);
    };
    if ("startViewTransition" in document) {
      document.startViewTransition(applyDate);
      return;
    }

    setItemsAnimating(true);
    applyDate();
    finishItemsAnimation();
  }

  function changeStatus(nextStatus: string) {
    if (dailyReviewActive && nextStatus !== "inbox") {
      setDailyReviewActive(false);
    }
    setSelectedStatus(nextStatus);
  }

  function applyQueuePreset(preset: QueuePreset) {
    setDailyReviewActive(false);
    setSelectedDate("all");
    setSelectedSource(preset.source);
    setSelectedStatus(preset.status);
    setFocusedItemId("");
  }

  function isQueuePresetActive(preset: QueuePreset) {
    return (
      !dailyReviewActive &&
      selectedDate === "all" &&
      selectedSource === preset.source &&
      selectedStatus === preset.status
    );
  }

  function startDailyReview() {
    if (!latestReviewDate) return;
    setDailyReviewActive(true);
    setSelectedDate(latestReviewDate);
    setSelectedSource("all");
    setSelectedStatus("inbox");
    setQuery("");
    setFocusedItemId("");
  }

  function stopDailyReview() {
    setDailyReviewActive(false);
    setSelectedDate("all");
    setSelectedStatus("all");
    setFocusedItemId("");
  }

  function saveAdminSecret(value: string) {
    setAdminSecret(value);
    setAdminStatus(null);
    if (value) {
      sessionStorage.setItem("recall-inbox-admin-secret", value);
    } else {
      sessionStorage.removeItem("recall-inbox-admin-secret");
    }
  }

  async function loadAdminStatus(options: { quiet?: boolean } = {}) {
    if (!adminSecret) {
      setSyncMessage("Enter ADMIN_SECRET first.");
      return;
    }
    if (!options.quiet) setSyncMessage("Checking sources...");
    try {
      const response = await fetch("/api/admin/status", {
        headers: { Authorization: `Bearer ${adminSecret}` }
      });
      const data = (await response.json()) as AdminStatus | { error?: string };
      if (!response.ok) throw new Error("error" in data ? data.error : "Failed to check sources.");
      setAdminStatus(data as AdminStatus);
      if (!options.quiet) setSyncMessage("Source status loaded.");
    } catch (error) {
      setAdminStatus(null);
      setSyncMessage(error instanceof Error ? error.message : "Failed to check sources.");
    }
  }

  async function startSourceAuth(action: SourceAction) {
    if (!adminSecret) {
      setSyncMessage("Enter ADMIN_SECRET first.");
      return;
    }
    if (!action.authPath) return;
    try {
      const response = await fetch(action.authPath, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminSecret}` }
      });
      const data = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Failed to start authorization.");
      window.location.href = data.authorizationUrl;
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Failed to start authorization.");
    }
  }

  function sourceStatus(source: SourceSync): SourceStatus | undefined {
    return adminStatus?.sources[source];
  }

  function canSyncSource(source: SourceSync): boolean {
    return Boolean(sourceStatus(source)?.syncEnabled) && !syncingAction;
  }

  const canSyncAnySource = Boolean(adminStatus && Object.values(adminStatus.sources).some((status) => status.syncEnabled)) && !syncingAction;

  async function runManualSync(source: SyncSource, maxPages: number, fullScan = false) {
    if (!adminSecret) {
      setSyncMessage("Enter ADMIN_SECRET first.");
      return;
    }
    const action = `${source}:${maxPages}`;
    setSyncingAction(action);
    setSyncMessage("Syncing...");
    try {
      const fullScanParam = fullScan ? "&fullScan=true" : "";
      const response = await fetch(`/api/sync?source=${source}&maxPages=${maxPages}${fullScanParam}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminSecret}` }
      });
      const data = (await response.json()) as SyncResult | { error?: string };
      if (!response.ok) throw new Error("error" in data ? data.error : "Sync failed.");
      const result = data as SyncResult;
      const sourceNames = Object.keys(result.sources).join(", ") || "no sources";
      const message = `Synced ${sourceNames}. ${result.newItems} new, ${result.stored} stored.`;
      await loadAdminStatus({ quiet: true });
      await loadItems();
      setSyncMessage(message);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setSyncingAction("");
    }
  }

  async function saveItem(id: string, patch: Partial<Pick<SavedItem, "status" | "tags" | "note">>) {
    const version = (saveVersions.current.get(id) || 0) + 1;
    saveVersions.current.set(id, version);
    const previousItem = items.find((item) => item.id === id);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSavingItems((current) => new Map(current).set(id, "Saving..."));
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!response.ok) throw new Error("Failed to save item.");
      const data = (await response.json()) as { item: SavedItem };
      if (saveVersions.current.get(id) !== version) return;
      setItems((current) => current.map((item) => (item.id === data.item.id ? data.item : item)));
      setSavingItems((current) => new Map(current).set(id, "Saved"));
    } catch {
      if (saveVersions.current.get(id) !== version) return;
      setItems((current) => current.map((item) => (item.id === id ? previousItem ? previousItem : item : item)));
      setSavingItems((current) => new Map(current).set(id, "Save failed"));
    }
  }

  function saveItemPatch(id: string, patch: Partial<Pick<SavedItem, "status" | "tags" | "note">>) {
    if (patch.status && !dailyReviewActive && selectedStatus !== "all" && selectedStatus !== patch.status) {
      setSelectedStatus("all");
    }
    return saveItem(id, patch);
  }

  function toggleExpanded(id: string) {
    setExpandedItems((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function setReviewOpen(id: string, open: boolean) {
    setOpenReviewItems((current) => {
      const next = new Set(current);
      if (open) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const sourceControls = (
    <Dialog.Root open={adminOpen} onOpenChange={setAdminOpen}>
      <Dialog.Trigger className="source-text-trigger">Sources</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="admin-backdrop" />
        <Dialog.Popup className="admin-dialog">
          <div className="admin-dialog-header">
            <div>
              <Dialog.Title className="admin-title">Sources & sync</Dialog.Title>
              <Dialog.Description className="admin-description">
                Use ADMIN_SECRET to check source readiness, authorize accounts, and run manual syncs.
              </Dialog.Description>
            </div>
            <Dialog.Close className="admin-close">Close</Dialog.Close>
          </div>
          <div className="admin-dialog-body" aria-label="Admin sync controls">
            <Input
              id="adminSecret"
              type="password"
              placeholder="ADMIN_SECRET"
              value={adminSecret}
              onValueChange={saveAdminSecret}
            />
            <div className="admin-actions">
              <button type="button" className="admin-button" onClick={() => loadAdminStatus()}>
                Check readiness
              </button>
              <button
                type="button"
                className="admin-button"
                disabled={!canSyncAnySource}
                onClick={() => runManualSync("all", 2)}
              >
                {syncingAction === "all:2" ? "Syncing" : "Sync recent"}
              </button>
              <button
                type="button"
                className="admin-button primary"
                disabled={!canSyncAnySource}
                onClick={() => runManualSync("all", 50, true)}
              >
                {syncingAction === "all:50" ? "Syncing" : "Backfill all"}
              </button>
            </div>
            <div className="source-action-list">
              {sourceActions.map((action) => (
                <div className="source-action" key={action.source}>
                  <div>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                    <span className={sourceStatus(action.source)?.syncEnabled ? "source-status ready" : "source-status"}>
                      {sourceStatus(action.source)?.syncEnabled
                        ? "Ready to sync"
                        : sourceStatus(action.source)?.reason || "Check status before syncing."}
                    </span>
                  </div>
                  <div className="source-action-buttons">
                    {action.authPath ? (
                      <button type="button" className="admin-button" onClick={() => startSourceAuth(action)}>
                        Authorize {action.label}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-button"
                      disabled={!canSyncSource(action.source)}
                      onClick={() => runManualSync(action.source, 2)}
                    >
                      {syncingAction === `${action.source}:2` ? "Syncing" : <>Sync {action.label}</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {syncMessage ? <div className="sync-status">{syncMessage}</div> : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <h1>Recall Inbox</h1>
          <p id="summary">
            <span>
              {loadError
                ? "Failed to load local items."
                : loadingItems
                  ? "Loading items..."
                  : `${filteredItems.length} shown, ${items.length} stored`}
            </span>
            <span aria-hidden="true">·</span>
            {sourceControls}
          </p>
        </div>
        <div className="mobile-tools">
          <details className="mobile-search-disclosure">
            <summary aria-label="Open search and filters">Search</summary>
            <div className="mobile-search-popover">
              <Input
                id="mobileSearch"
                type="search"
                placeholder="Search text, author, tag"
                value={query}
                onValueChange={setQuery}
              />
              <BaseSelect
                ariaLabel="Filter by date"
                id="mobileDateFilter"
                options={dateOptions}
                value={selectedDate}
                onValueChange={changeDate}
              />
              <BaseSelect
                ariaLabel="Filter by source"
                id="mobileSourceFilter"
                options={sourceOptions}
                value={selectedSource}
                onValueChange={setSelectedSource}
              />
              <BaseSelect
                ariaLabel="Filter by status"
                id="mobileStatusFilter"
                options={[{ label: "All status", value: "all" }, ...statusSelectOptions]}
                value={selectedStatus}
                onValueChange={changeStatus}
              />
            </div>
          </details>
        </div>
        <div className="toolbar">
          <div className="toolbar-panel">
            <div className="desktop-search-field">
              <Input
                id="search"
                type="search"
                placeholder="Search text, author, tag"
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <BaseSelect
              ariaLabel="Filter by date"
              className="mobile-date-filter"
              id="dateFilter"
              options={dateOptions}
              value={selectedDate}
              onValueChange={changeDate}
            />
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-title">Dates</div>
          <div id="dates" className="date-list">
            <button
              type="button"
              className={selectedDate === "all" ? "date-button active" : "date-button"}
              onClick={() => changeDate("all")}
            >
              <span>All</span>
              <span className="date-count">{items.length}</span>
            </button>
            {dateCounts.map(({ date, count }) => (
              <button
                key={date}
                type="button"
                className={selectedDate === date ? "date-button active" : "date-button"}
                onClick={() => changeDate(date)}
              >
                <span>{date}</span>
                <span className="date-count">{count}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="content-shell">
          <div className="workflow-board">
            <div className="queue-header">
              <div>
                <span className="summary-label">Focus Queue</span>
                <strong>{activeQueueLabel}</strong>
              </div>
              <span className="queue-description">{activeQueueDescription}</span>
            </div>
            <div className="workflow-filters" aria-label="Review filters">
              <BaseSelect
                ariaLabel="Filter by source"
                id="sourceFilter"
                options={sourceOptions}
                value={selectedSource}
                onValueChange={setSelectedSource}
              />
              <BaseSelect
                ariaLabel="Filter by status"
                id="statusFilter"
                options={[{ label: "All status", value: "all" }, ...statusSelectOptions]}
                value={selectedStatus}
                onValueChange={changeStatus}
              />
            </div>
            <div className="review-mode-strip" data-active={dailyReviewActive ? "true" : "false"}>
              <div>
                <span className="summary-label">Review inbox</span>
                <strong>
                  {dailyReviewActive
                    ? latestReviewDate ? `Reviewing inbox: ${latestReviewDate}` : "Inbox clear"
                    : latestReviewDate ? `Next inbox: ${latestReviewDate}` : "Inbox clear"}
                </strong>
                <span>
                  {dailyReviewActive
                    ? `${filteredItems.length} inbox items in focus`
                    : latestReviewDate ? `${latestReviewInboxCount} inbox items ready` : "No inbox items to review"}
                </span>
              </div>
              <button
                type="button"
                className="daily-review-button"
                disabled={!latestReviewDate}
                onClick={dailyReviewActive ? stopDailyReview : startDailyReview}
              >
                {dailyReviewActive ? "Exit review" : "Review inbox"}
              </button>
            </div>
            <div className="queue-presets" aria-label="Focused queues">
              {queuePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`queue-preset${isQueuePresetActive(preset) ? " active" : ""}`}
                  onClick={() => applyQueuePreset(preset)}
                >
                  <span>{preset.label}</span>
                  <strong>{preset.description}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="queue-summary" aria-label="Visible item summary">
            <div>
              <span className="summary-label">Inbox</span>
              <strong>{visibleStatusCounts.inbox}</strong>
            </div>
            <div>
              <span className="summary-label">Keep</span>
              <strong>{visibleStatusCounts.keep}</strong>
            </div>
            <div>
              <span className="summary-label">Action</span>
              <strong>{visibleStatusCounts.action}</strong>
            </div>
            <div>
              <span className="summary-label">Dismiss</span>
              <strong>{visibleStatusCounts.dismiss}</strong>
            </div>
          </div>
          <div
            id="items"
            className={itemsAnimating ? "items date-changing" : "items"}
            data-date-key={selectedDate}
            aria-live="polite"
          >
            {loadingItems ? (
              <div className="loading-list" role="status" aria-label="Loading saved items">
                <span>Loading saved items...</span>
                <div className="loading-card" />
                <div className="loading-card" />
                <div className="loading-card" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <strong>{items.length === 0 ? "Connect a source" : "No matching items"}</strong>
                <p>
                  {items.length === 0
                    ? "Open Sources to add credentials, authorize services, and run the first sync."
                    : "Try another date, queue, source, or search term."}
                </p>
                {items.length === 0 ? (
                  <button type="button" className="empty-action" onClick={() => setAdminOpen(true)}>
                    Open Sources
                  </button>
                ) : null}
              </div>
            ) : (
              renderedItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  expanded={expandedItems.has(item.id)}
                  reviewOpen={openReviewItems.has(item.id)}
                  saveState={savingItems.get(item.id) || "Saved"}
                  focused={focusedItemId === item.id}
                  onToggleExpanded={() => toggleExpanded(item.id)}
                  onReviewOpenChange={(open) => setReviewOpen(item.id, open)}
                  onFocusItem={() => setFocusedItemId(item.id)}
                  onQuickStatus={(status) => saveItemPatch(item.id, { status })}
                  onSave={(patch) => saveItemPatch(item.id, patch)}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function BaseSelect({
  id,
  ariaLabel,
  className,
  options,
  value,
  onValueChange
}: {
  id?: string;
  ariaLabel: string;
  className?: string;
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={className ? `select-field ${className}` : "select-field"}>
      <Select.Root items={options} value={value} onValueChange={(nextValue) => onValueChange(String(nextValue))}>
        <Select.Trigger id={id} aria-label={ariaLabel} className="select-trigger">
          <Select.Value className="select-value" />
          <Select.Icon className="select-icon">
            <CaretUpDownIcon />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="select-positioner" sideOffset={6} alignItemWithTrigger={false}>
            <Select.Popup className="select-popup">
              <Select.ScrollUpArrow className="select-scroll-arrow">
                <CaretUpIcon />
              </Select.ScrollUpArrow>
              <Select.List className="select-list">
                {options.map((option) => (
                  <Select.Item key={option.value} value={option.value} className="select-item">
                    <Select.ItemIndicator className="select-item-indicator">
                      <CheckIcon />
                    </Select.ItemIndicator>
                    <Select.ItemText className="select-item-text">{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
              <Select.ScrollDownArrow className="select-scroll-arrow">
                <CaretDownIcon />
              </Select.ScrollDownArrow>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function CaretUpDownIcon(props: ComponentProps<"svg">) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M11 10H5l3 3.5zm0-4H5l3-3.5z" />
    </svg>
  );
}

function CaretUpIcon(props: ComponentProps<"svg">) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 10H4l4-4.5z" />
    </svg>
  );
}

function CaretDownIcon(props: ComponentProps<"svg">) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 6H4l4 4.5z" />
    </svg>
  );
}

function CheckIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="m2.5 8.5 4 4 7-9" />
    </svg>
  );
}

function ExternalLinkIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.5 4.5H4.25A1.75 1.75 0 0 0 2.5 6.25v5.5c0 .97.78 1.75 1.75 1.75h5.5c.97 0 1.75-.78 1.75-1.75V9.5" />
      <path d="M9 2.5h4.5V7" />
      <path d="m8.5 7.5 5-5" />
    </svg>
  );
}

function ExpandTextIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 6.25 8 10l4-3.75" />
      <path d="M4 2.75 8 6.5l4-3.75" />
    </svg>
  );
}

function ItemCard({
  item,
  expanded,
  reviewOpen,
  saveState,
  focused,
  onToggleExpanded,
  onReviewOpenChange,
  onFocusItem,
  onQuickStatus,
  onSave
}: {
  item: ViewItem;
  expanded: boolean;
  reviewOpen: boolean;
  saveState: string;
  focused: boolean;
  onToggleExpanded: () => void;
  onReviewOpenChange: (open: boolean) => void;
  onFocusItem: () => void;
  onQuickStatus: (status: SavedItemStatus) => void;
  onSave: (patch: Partial<Pick<SavedItem, "status" | "tags" | "note">>) => void;
}) {
  const status = item.normalizedStatus;
  const details = item.details;
  const shouldClamp = item.shouldClamp;
  const signalChips = sourceSignalChips(item);

  return (
    <article
      className={`item-card status-${status}${focused ? " active-review-item" : ""}`}
      aria-current={focused ? "true" : undefined}
      tabIndex={0}
      onFocus={onFocusItem}
      onMouseEnter={onFocusItem}
    >
      <div className="item-header">
        <div className="item-primary-row">
          <div className="item-main">
            <div className="item-title">
              <span className={`source-badge source-${item.source}`}>{sourceLabel(item.source)}</span>
              <strong>{details?.repo || (item.authorHandle ? `@${item.authorHandle}` : item.authorName || "Unknown author")}</strong>
              <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>
            </div>
            <div className="meta">
              <span>Created {item.createdLabel}</span>
              <span>Discovered {item.discoveredLabel}</span>
            </div>
          </div>
          <div className="item-side-actions">
            <div className="status-actions" aria-label="Quick review actions">
              {statusOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Mark as ${statusLabels[option]}`}
                  className={`status-action status-${option}${status === option ? " active" : ""}`}
                  onClick={() => onQuickStatus(option)}
                >
                  {statusLabels[option]}
                </button>
              ))}
            </div>
            <a className="open-link" href={item.url} target="_blank" rel="noreferrer" aria-label="Open item">
              <ExternalLinkIcon />
            </a>
          </div>
        </div>
      </div>
      <div className="item-content">
        <div className="item-body">
          {details ? (
            <div className="github-details">
              {details.description ? <p className="item-text">{details.description}</p> : null}
              <div className="detail-chips">
                {details.stars ? <span>{details.stars} stars</span> : null}
              </div>
              {details.topics.length ? (
                <div className="topic-list">
                  {details.topics.map((topic) => (
                    <span key={topic} className="topic-chip" title={topic}>
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className={shouldClamp && !expanded && !details ? "item-text clamped" : "item-text"}>{item.text}</p>
          )}
          {signalChips.length ? (
            <div className="source-signal-list" aria-label="Source signals">
              {signalChips.map((chip) => (
                <span key={chip} className="source-signal-chip">{chip}</span>
              ))}
            </div>
          ) : null}
        </div>
        {shouldClamp && !expanded && !details ? (
          <button type="button" className="text-toggle" onClick={onToggleExpanded} aria-label="Expand text">
            <ExpandTextIcon />
          </button>
        ) : null}
      </div>
      <ReviewPanel
        item={item}
        open={reviewOpen}
        saveState={saveState}
        onOpenChange={onReviewOpenChange}
        onSave={onSave}
      />
    </article>
  );
}

function ReviewPanel({
  item,
  open,
  saveState,
  onOpenChange,
  onSave
}: {
  item: SavedItem;
  open: boolean;
  saveState: string;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<Pick<SavedItem, "status" | "tags" | "note">>) => void;
}) {
  const tags = item.tags || [];
  const hasNote = Boolean(item.note?.trim());
  const x = xMetadata(item);
  const metadata = githubMetadata(item);
  const urls = x ? sourceUrls(x) : [];
  const metrics = metricEntries(x?.publicMetrics);
  const referencedTweets = x?.referencedTweetObjects ?? [];
  const media = x?.media ?? [];
  const hasGitHubDetails = Boolean(metadata && (metadata.homepage || metadata.defaultBranch || metadata.updatedAt || metadata.pushedAt || metadata.license));
  const hasSourceDetails = Boolean(
    (x && (urls.length || metrics.length || referencedTweets.length || media.length || x.possiblySensitive)) ||
    hasGitHubDetails
  );

  function saveTagsOnBlur(value: string) {
    const nextTags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (nextTags.join("\0") === tags.join("\0")) return;
    onSave({ tags: nextTags });
  }

  function saveNoteOnBlur(value: string) {
    const nextNote = value.trim();
    if (nextNote === (item.note || "")) return;
    onSave({ note: nextNote });
  }

  return (
    <Collapsible.Root
      className="review-panel"
      data-panel-open={open ? "true" : "false"}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Collapsible.Trigger className="review-trigger">
        <span className="review-summary">
          <span className="review-trigger-label">{open ? "Hide review" : "Review"}</span>
          <span className="review-preview">
            {tags.length ? `${tags.length} tags` : "No tags"} · {hasNote ? "Note" : "No note"}
          </span>
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="review-fields">
        <div className="review-editor">
          <div className="review-workflow">
            <span className="review-field-label">Workflow</span>
            <div className="review-step-list" aria-label="Review workflow status">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`review-step status-${status}${normalizeStatus(item.status) === status ? " active" : ""}`}
                  onClick={() => onSave({ status })}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </div>
          <div className="review-form">
            <label className="review-control">
              <span className="review-field-label">Tags</span>
              <Input defaultValue={tags.join(", ")} onBlur={(event) => saveTagsOnBlur(event.currentTarget.value)} />
            </label>
            <label className="review-control">
              <span className="review-field-label">Note</span>
              <textarea rows={1} defaultValue={item.note || ""} onBlur={(event) => saveNoteOnBlur(event.target.value)} />
            </label>
            <div className={`review-save-state save-state ${saveState === "Save failed" ? "failed" : ""}`}>
              {saveState}
            </div>
          </div>
          {hasSourceDetails ? (
            <div className="source-details">
              <div className="source-details-heading">Source details</div>
              <div className="source-details-grid">
                {metadata?.homepage ? (
                  <div>
                    <span className="review-field-label">Homepage</span>
                    <div className="source-detail-list">
                      <a href={metadata.homepage} target="_blank" rel="noreferrer">{metadata.homepage}</a>
                    </div>
                  </div>
                ) : null}
                {metadata ? (
                  <div>
                    <span className="review-field-label">Repository</span>
                    <div className="source-detail-list compact">
                      {metadata?.license ? <span>license: {metadata.license}</span> : null}
                      {metadata?.defaultBranch ? <span>default branch: {metadata.defaultBranch}</span> : null}
                      {metadata?.updatedAt ? <span>updated: {formatDateTime(metadata.updatedAt)}</span> : null}
                      {metadata?.pushedAt ? <span>pushed: {formatDateTime(metadata.pushedAt)}</span> : null}
                    </div>
                  </div>
                ) : null}
                {urls.length ? (
                  <div>
                    <span className="review-field-label">Links</span>
                    <div className="source-detail-list">
                      {urls.map((url, index) => (
                        <a key={`${url.expanded_url ?? url.url ?? index}`} href={url.expanded_url ?? url.url} target="_blank" rel="noreferrer">
                          {url.display_url ?? url.expanded_url ?? url.url}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {media.length ? (
                  <div>
                    <span className="review-field-label">Media</span>
                    <div className="source-detail-list">
                      {media.map((item, index) => (
                        <span key={item.media_key ?? index}>{item.type ?? "media"}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {referencedTweets.length ? (
                  <div>
                    <span className="review-field-label">Referenced</span>
                    <div className="source-detail-list readable">
                      {referencedTweets.map((tweet, index) => (
                        <span key={tweet.id ?? index}>{tweet.text ?? tweet.id}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {metrics.length ? (
                  <div>
                    <span className="review-field-label">Metrics</span>
                    <div className="source-detail-list compact">
                      {metrics.map(([key, value]) => (
                        <span key={key}>{key.replace(/_/g, " ")}: {value}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {x?.possiblySensitive ? <span className="source-warning">Possibly sensitive</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
