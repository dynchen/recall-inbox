import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("review page is built as a Vite React app with Base UI primitives", async () => {
  const html = await readFile("src/view/client/index.html", "utf8");
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const packageJson = await readFile("package.json", "utf8");

  assert.match(html, /id="root"/);
  assert.match(html, /<title>Recall Inbox<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
  assert.match(packageJson, /vite build/);
  assert.match(packageJson, /"@base-ui\/react"/);
  assert.match(app, /function formatDateTime/);
  assert.match(app, /import \{ Input \} from "@base-ui\/react\/input"/);
  assert.match(app, /import \{ Collapsible \} from "@base-ui\/react\/collapsible"/);
  assert.match(app, /import \{ Select \} from "@base-ui\/react\/select"/);
});

test("review page ships a simple favicon", async () => {
  const favicon = await readFile("src/view/client/public/favicon.svg", "utf8");

  assert.match(favicon, /<svg/);
  assert.match(favicon, /viewBox="0 0 32 32"/);
  assert.match(favicon, /aria-label="Recall Inbox"/);
  assert.match(favicon, /<title>Recall Inbox<\/title>/);
  assert.match(favicon, /<rect/);
  assert.match(favicon, /<path/);
});

test("review page keeps controls usable on narrow screens", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /className="desktop-search-field"/);
  assert.match(app, /className="mobile-tools"/);
  assert.match(app, /className="mobile-search-disclosure"/);
  assert.match(app, /id="mobileSearch"/);
  assert.match(app, /id="mobileDateFilter"/);
  assert.match(app, /id="mobileSourceFilter"/);
  assert.match(app, /id="mobileStatusFilter"/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.item-header\s*{[\s\S]*flex-wrap: wrap;/);
  assert.match(css, /\.item-text\s*{[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.mobile-tools\s*{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.desktop-search-field\s*{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.mobile-tools\s*{[^}]*display: inline-flex;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.toolbar\s*{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.mobile-search-disclosure\s*{[^}]*display: block;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.mobile-search-popover\s*{[^}]*right: 0;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.workflow-filters\s*{[^}]*display: none;/);
  assert.match(css, /\.select-item-text\s*{[^}]*white-space: nowrap;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.item-side-actions\s*{[^}]*display: contents;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.open-link\s*{[^}]*grid-column: 2;/);
});

test("review page clamps short text with many lines", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");

  assert.match(app, /function shouldClampText/);
  assert.match(app, /split\(\s*\/\\r\?\\n\/\s*\)\.length > 4/);
  assert.match(app, /shouldClamp: shouldClampText\(item\.text\)/);
  assert.match(app, /const shouldClamp = item\.shouldClamp;/);
  assert.match(app, /shouldClamp && !expanded && !details/);
  assert.match(app, /shouldClamp && !expanded && !details \?/);
  assert.match(app, /function ExpandTextIcon/);
  assert.match(app, /className="text-toggle"[\s\S]*aria-label="Expand text"/);
  assert.doesNotMatch(app, />\s*Expand\s*<\/button>/);
  assert.doesNotMatch(app, /Collapse/);
});

test("review page cards do not stretch to fill sparse date views", async () => {
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(css, /\.layout\s*{[^}]*align-items: start;/);
  assert.match(css, /\.items\s*{[^}]*align-content: start;/);
});

test("review page has mobile-first navigation and processing affordances", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /useTransition/);
  assert.match(app, /const INITIAL_RENDER_LIMIT = 50;/);
  assert.match(app, /const RENDER_BATCH_SIZE = 50;/);
  assert.match(app, /const \[, startItemsTransition\] = useTransition\(\)/);
  assert.match(app, /const \[visibleItemLimit, setVisibleItemLimit\] = useState\(INITIAL_RENDER_LIMIT\)/);
  assert.match(app, /startItemsTransition\(\(\) => \{/);
  assert.match(app, /setItems\(data\.items \|\| \[\]\)/);
  assert.match(app, /setVisibleItemLimit\(INITIAL_RENDER_LIMIT\)/);
  assert.match(app, /const renderedItems = useMemo/);
  assert.match(app, /filteredItems\.slice\(0, visibleItemLimit\)/);
  assert.match(app, /renderedItems\.map\(\(item\) =>/);
  assert.doesNotMatch(app, /filteredItems\.map\(\(item\) =>/);
  assert.match(app, /const \[loadingItems, setLoadingItems\] = useState\(true\)/);
  assert.match(app, /setLoadingItems\(true\)/);
  assert.match(app, /finally\s*{\s*setLoadingItems\(false\)/);
  assert.match(app, /Loading items\.\.\./);
  assert.match(app, /className="loading-list"/);
  assert.match(app, /Loading saved items\.\.\./);
  assert.match(css, /\.loading-list/);
  assert.match(css, /\.loading-card/);
  assert.match(css, /@keyframes loading-pulse/);
  assert.match(app, /id="dateFilter"/);
  assert.match(app, /id="mobileDateFilter"/);
  assert.match(app, /function changeDate/);
  assert.match(app, /document\.startViewTransition/);
  assert.match(app, /changeDate\("all"\)/);
  assert.match(app, /changeDate\(date\)/);
  assert.match(app, /onValueChange=\{changeDate\}/);
  assert.match(app, /data-date-key=\{selectedDate\}/);
  assert.doesNotMatch(app, /<div key=\{selectedDate\} id="items"/);
  assert.match(app, /className=\{itemsAnimating \? "items date-changing" : "items"\}/);
  assert.match(app, /setItemsAnimating\(true\)/);
  assert.match(app, /className="mobile-date-filter"/);
  assert.doesNotMatch(app, /<select[\s\S]*id="dateFilter"/);
  assert.match(app, /function ReviewPanel/);
  assert.match(app, /<Collapsible\.Root/);
  assert.match(css, /\.mobile-date-filter\s*{[^}]*display: none;/);
  assert.doesNotMatch(css, /#search,\s*#dateFilter/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.sidebar\s*{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.mobile-date-filter\s*{[^}]*display: block;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.queue-summary\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.review-panel\[data-panel-open="false"\] \.review-form\s*{[^}]*display: none;/);
  assert.match(css, /view-transition-name: saved-items-list;/);
  assert.match(css, /::view-transition-old\(saved-items-list\)/);
  assert.match(css, /::view-transition-new\(saved-items-list\)/);
  assert.match(css, /@keyframes saved-items-old/);
  assert.match(css, /@keyframes saved-items-new/);
  assert.match(css, /\.items\.date-changing\s*{[^}]*opacity: 0\.96;/);
  assert.doesNotMatch(css, /\.items\.date-changing\s*{[^}]*transform:/);
  assert.doesNotMatch(css, /@keyframes saved-items-old\s*{\s*to\s*{[^}]*transform:/);
  assert.doesNotMatch(css, /@keyframes saved-items-new\s*{\s*from\s*{[^}]*transform:/);
  assert.doesNotMatch(css, /@keyframes date-items-in/);
});

test("review server defaults to Vite build output", async () => {
  const server = await readFile("src/server.ts", "utf8");
  const viteConfig = await readFile("vite.config.ts", "utf8");

  assert.match(server, /"\.\.\/view"/);
  assert.match(viteConfig, /outDir:\s*"\.\.\/\.\.\/\.\.\/dist\/view"/);
});

test("review page follows Base UI select anatomy and visual tokens", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /function BaseSelect/);
  assert.match(app, /<Select\.Root/);
  assert.match(app, /<Select\.Trigger/);
  assert.match(app, /<Select\.Portal>/);
  assert.match(app, /<Select\.Positioner/);
  assert.match(app, /<Select\.Popup/);
  assert.match(app, /<Select\.ItemIndicator/);
  assert.match(app, /className="mobile-date-filter"/);
  assert.match(css, /--surface:/);
  assert.match(css, /\.select-popup/);
  assert.match(css, /box-shadow:\s*0 10px 30px/);
  assert.match(css, /\[data-highlighted\]/);
  assert.doesNotMatch(css, /\.select-value\s*{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /\.select-item-text\s*{[^}]*text-overflow:\s*ellipsis/);
});

test("review page has a refined inbox layout with clear item hierarchy", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /className="queue-summary"/);
  assert.match(app, /className="item-content"/);
  assert.match(app, /className="item-body"/);
  assert.match(app, /className="date-count"/);
  assert.match(css, /--surface-subtle:/);
  assert.match(css, /\.queue-summary/);
  assert.match(css, /\.item-card\.status-inbox/);
  assert.match(css, /\.date-button\.active::before/);
  assert.match(css, /\.content-shell/);
});

test("review page keeps the feed compact and separates source-specific content", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.doesNotMatch(app, /reviewOpen=\{!isMobile \|\| openReviewItems\.has\(item\.id\)\}/);
  assert.match(app, /reviewOpen=\{openReviewItems\.has\(item\.id\)\}/);
  assert.match(app, /Inbox/);
  assert.match(app, /Keep/);
  assert.match(app, /Action/);
  assert.match(app, /Dismiss/);
  assert.match(app, /function normalizeStatus/);
  assert.doesNotMatch(app, /Processed/);
  assert.doesNotMatch(app, /Hidden/);
  assert.doesNotMatch(app, /todo/);
  assert.doesNotMatch(app, /done/);
  assert.doesNotMatch(app, /ignored/);
  assert.match(app, /className="github-details"/);
  assert.match(app, /className="open-link"/);
  assert.match(app, /function ExternalLinkIcon/);
  assert.match(app, /aria-label="Open item"/);
  assert.doesNotMatch(app, />\s*Open\s*<\/a>/);
  assert.match(app, /className="review-summary"/);
  assert.match(app, /className="review-fields"/);
  assert.doesNotMatch(app, /className="item-actions"/);
  assert.doesNotMatch(app, /keepMounted/);
  assert.match(css, /\.date-list\s*{[^}]*overflow-y: auto;/);
  assert.match(css, /\.open-link\s*{[\s\S]*width: 30px;/);
  assert.match(css, /\.open-link svg\s*{[^}]*display: block;/);
  assert.match(css, /\.review-panel\[data-panel-open="false"\] \.review-form\s*{[^}]*display: none;/);
  assert.doesNotMatch(css, /\.item-card\.status-inbox\s*{[^}]*border-color:/);
  assert.match(css, /@starting-style\s*{[\s\S]*\.select-popup/);
  assert.match(css, /@keyframes select-popup-in/);
});

test("review page normalizes long topics and review form controls", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /function splitTopics/);
  assert.match(app, /className="topic-list"/);
  assert.match(app, /className="review-form"/);
  assert.match(app, /className="review-control"/);
  assert.match(app, /function saveTagsOnBlur/);
  assert.match(app, /function saveNoteOnBlur/);
  assert.match(app, /if \(nextTags\.join\("\\0"\) === tags\.join\("\\0"\)\) return;/);
  assert.match(app, /if \(nextNote === \(item\.note \|\| ""\)\) return;/);
  assert.match(app, /rows=\{1\}/);
  assert.match(css, /\.topic-list/);
  assert.match(css, /\.topic-chip\s*{[\s\S]*max-width:/);
  assert.match(css, /\.review-form/);
  assert.match(css, /\.review-control\s*{[\s\S]*min-width: 0;/);
  assert.match(css, /\.review-control textarea\s*{[\s\S]*min-height: 42px;/);
  assert.match(css, /\.review-save-state/);
  assert.match(css, /\.select-popup\s*{[\s\S]*animation: select-popup-in 180ms/);
});

test("review page surfaces X metadata without showing language", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /metadata\?: Record<string, unknown>/);
  assert.match(app, /interface XMetadata/);
  assert.match(app, /function xMetadata/);
  assert.match(app, /function xSignalChips/);
  assert.match(app, /className="source-signal-list"/);
  assert.match(app, /className="source-details"/);
  assert.match(app, /Source details/);
  assert.match(app, /expanded_url/);
  assert.match(app, /bookmark_count/);
  assert.match(app, /referencedTweetObjects/);
  assert.match(app, /className="source-details-heading"/);
  assert.match(app, /className="source-detail-list readable"/);
  assert.doesNotMatch(app, /<details className="source-details">/);
  assert.doesNotMatch(app, /xMetadata\(item\)\?\.lang/);
  assert.match(css, /\.source-signal-list/);
  assert.match(css, /\.source-signal-chip/);
  assert.match(css, /\.source-details/);
  assert.match(css, /\.source-detail-list\.readable span/);
  assert.match(css, /\.source-detail-list\.readable span\s*{[\s\S]*white-space: normal;/);
  assert.match(css, /\.source-detail-list\.readable span\s*{[\s\S]*overflow-wrap: anywhere;/);
});

test("review page surfaces GitHub metadata without showing language in the card", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");

  assert.match(app, /interface GitHubMetadata/);
  assert.match(app, /function githubMetadata/);
  assert.match(app, /function githubSignalChips/);
  assert.match(app, /function sourceSignalChips/);
  assert.match(app, /metadata\?\.license/);
  assert.match(app, /metadata\?\.forks/);
  assert.match(app, /metadata\?\.openIssues/);
  assert.match(app, /metadata\?\.archived/);
  assert.match(app, /metadata\?\.defaultBranch/);
  assert.match(app, /metadata\?\.homepage/);
  assert.doesNotMatch(app, /\{details\.language \? <span>\{details\.language\}<\/span> : null\}/);
});

test("review page keeps filters and review controls visually quiet", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /className="toolbar-panel"/);
  assert.match(app, /className="workflow-filters"/);
  assert.match(app, /className="review-trigger-label"/);
  assert.match(app, /className="review-editor"/);
  assert.match(app, /<p id="summary">[\s\S]*\{sourceControls\}[\s\S]*<\/p>/);
  assert.match(css, /\.toolbar-panel\s*{[\s\S]*background: color-mix\(in srgb, var\(--surface\) 70%, transparent\);/);
  assert.match(css, /\.toolbar-panel\s*{[\s\S]*border: 1px solid var\(--border-soft\);/);
  assert.match(css, /\.toolbar\s*{[\s\S]*max-width: 580px;/);
  assert.match(css, /\.toolbar-panel\s*{[\s\S]*grid-template-columns: minmax\(220px, 1fr\);/);
  assert.match(css, /#search\s*{[\s\S]*height: 36px;/);
  assert.match(css, /#summary\s*{[\s\S]*display: flex;/);
  assert.match(css, /#summary\s*{[\s\S]*gap: 6px;/);
  assert.match(css, /\.workflow-filters/);
  assert.match(css, /\.workflow-filters \.select-trigger/);
  assert.match(css, /\.toolbar \.select-trigger\s*{[\s\S]*background: transparent;/);
  assert.match(css, /\.review-panel\s*{[\s\S]*border-top: 1px solid color-mix\(in srgb, var\(--border-soft\) 68%, transparent\);/);
  assert.match(css, /\.review-trigger-label\s*{[\s\S]*border: 1px solid transparent;/);
  assert.match(css, /\.review-editor\s*{[\s\S]*background: color-mix\(in srgb, var\(--surface-muted\) 66%, transparent\);/);
  assert.match(css, /\.review-editor\s*{[\s\S]*border-radius: 8px;/);
  assert.match(css, /\.review-editor \.select-trigger,\s*\.review-editor input,\s*\.review-editor textarea\s*{[\s\S]*background: color-mix\(in srgb, var\(--surface\) 76%, transparent\);/);
  assert.match(css, /\.review-editor \.select-trigger,\s*\.review-editor input,\s*\.review-editor textarea\s*{[\s\S]*border: 1px solid transparent;/);
  assert.match(css, /\.review-editor textarea\s*{[\s\S]*resize: none;/);
  assert.doesNotMatch(css, /\.review-trigger\s*{[^}]*background: var\(--surface-muted\);/);
});

test("review page separates source setup, workflow, card hierarchy, and first-run states", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /className="topbar-title"/);
  assert.doesNotMatch(app, /className="toolbar-meta"/);
  assert.doesNotMatch(app, /className="side-tools"/);
  assert.match(app, /<Dialog\.Trigger className="source-text-trigger">Sources<\/Dialog\.Trigger>/);
  assert.doesNotMatch(app, /<\/div>\s*\{sourceControls\}\s*<\/div>\s*<\/header>/);
  assert.match(app, /className="workflow-board"/);
  assert.match(app, /aria-label="Review filters"/);
  assert.match(app, /className="queue-header"/);
  assert.match(app, /className="queue-description"/);
  assert.match(app, /className="item-primary-row"/);
  assert.match(app, /className="item-main"/);
  assert.match(app, /className="item-side-actions"/);
  assert.match(app, /className="review-workflow"/);
  assert.match(app, /className="review-step-list"/);
  assert.match(app, /className="review-field-label"/);
  assert.match(app, /className="empty-state"/);
  assert.match(app, /Connect a source/);
  assert.match(app, /Open Sources/);
  assert.match(css, /\.topbar-title/);
  assert.doesNotMatch(css, /\.toolbar-meta/);
  assert.doesNotMatch(css, /\.queue-actions/);
  assert.doesNotMatch(css, /\.side-tools/);
  assert.match(css, /\.source-text-trigger/);
  assert.match(css, /\.workflow-board/);
  assert.match(css, /\.queue-header/);
  assert.match(css, /\.item-primary-row/);
  assert.match(css, /\.item-side-actions/);
  assert.match(css, /\.review-workflow/);
  assert.match(css, /\.empty-state/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.queue-presets\s*{[\s\S]*overflow-x: auto;/);
});

test("review page supports a faster review workflow", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /const \[focusedItemId, setFocusedItemId\]/);
  assert.match(app, /const saveVersions = useRef\(new Map<string, number>\(\)\)/);
  assert.match(app, /function isEditableTarget/);
  assert.match(app, /function shortcutStatus/);
  assert.match(app, /window\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(app, /const version = \(saveVersions\.current\.get\(id\) \|\| 0\) \+ 1/);
  assert.match(app, /saveVersions\.current\.set\(id, version\)/);
  assert.match(app, /const previousItem = items\.find\(\(item\) => item\.id === id\)/);
  assert.match(app, /setItems\(\(current\) => current\.map\(\(item\) => \(item\.id === id \? \{ \.\.\.item, \.\.\.patch \} : item\)\)\)/);
  assert.match(app, /if \(saveVersions\.current\.get\(id\) !== version\) return/);
  assert.match(app, /previousItem \? previousItem : item/);
  assert.match(app, /saveItemPatch\(focusedItem\.id, \{ status \}\)/);
  assert.match(app, /setReviewOpen\(focusedItem\.id, true\)/);
  assert.match(app, /focused=\{focusedItemId === item\.id\}/);
  assert.match(app, /onFocusItem=\{\(\) => setFocusedItemId\(item\.id\)\}/);
  assert.match(app, /onQuickStatus=\{\(status\) => saveItemPatch\(item\.id, \{ status \}\)\}/);
  assert.match(app, /onSave=\{\(patch\) => saveItemPatch\(item\.id, patch\)\}/);
  assert.match(app, /className="status-actions"/);
  assert.match(app, /aria-label=\{`Mark as \$\{statusLabels\[option\]\}`\}/);
  assert.match(app, /className=\{`status-action status-\$\{option\}/);
  assert.match(css, /\.item-card\.active-review-item/);
  assert.match(css, /\.status-actions/);
  assert.match(css, /\.status-actions \.status-action/);
  assert.doesNotMatch(css, /(^|\n)\.status-action\s*{/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.status-actions\s*{[^}]*width: 100%;/);
});

test("queue preset status edits do not stay locked to the old status filter", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");

  assert.match(app, /function saveItemPatch\(id: string, patch: Partial<Pick<SavedItem, "status" \| "tags" \| "note">>\)/);
  assert.match(app, /patch\.status && !dailyReviewActive && selectedStatus !== "all" && selectedStatus !== patch\.status/);
  assert.match(app, /setSelectedStatus\("all"\)/);
  assert.match(app, /saveItemPatch\(focusedItem\.id, \{ status \}\)/);
  assert.match(app, /onQuickStatus=\{\(status\) => saveItemPatch\(item\.id, \{ status \}\)\}/);
  assert.match(app, /onSave=\{\(patch\) => saveItemPatch\(item\.id, patch\)\}/);
});

test("review page exposes a daily review view", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /const \[dailyReviewActive, setDailyReviewActive\]/);
  assert.match(app, /const latestReviewItem = sortedViewItems\.find\(\(item\) => item\.normalizedStatus === "inbox"\)/);
  assert.match(app, /const latestReviewDate = latestReviewItem\?\.dateKey/);
  assert.match(app, /function startDailyReview/);
  assert.match(app, /setDailyReviewActive\(true\)/);
  assert.match(app, /setSelectedDate\(latestReviewDate\)/);
  assert.match(app, /setSelectedSource\("all"\)/);
  assert.match(app, /setSelectedStatus\("inbox"\)/);
  assert.match(app, /setQuery\(""\)/);
  assert.match(app, /function stopDailyReview/);
  assert.match(app, /setDailyReviewActive\(false\)/);
  assert.match(app, /setSelectedDate\("all"\)/);
  assert.match(app, /setSelectedStatus\("all"\)/);
  assert.match(app, /className="review-mode-strip"/);
  assert.match(app, /Review inbox/);
  assert.match(app, /Exit review/);
  assert.match(app, /latestReviewDate \? `Next inbox: \$\{latestReviewDate\}` : "Inbox clear"/);
  assert.doesNotMatch(app, /Start daily review/);
  assert.doesNotMatch(app, /No items yet/);
  assert.match(css, /\.review-mode-strip/);
  assert.match(css, /\.daily-review-button/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.review-mode-strip\s*{[^}]*grid-template-columns: 1fr;/);
});

test("date changes reset status filtering to keep counts aligned", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");

  assert.match(app, /function changeDate\(nextDate: string\)/);
  assert.match(app, /function changeDate\(nextDate: string\)[\s\S]*setSelectedStatus\("all"\)[\s\S]*setSelectedDate\(nextDate\)/);
});

test("review page exposes queue presets for focused filters", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");
  const roadmap = await readFile("ROADMAP.md", "utf8");

  assert.match(app, /interface QueuePreset/);
  assert.match(app, /const queuePresets = useMemo/);
  assert.match(app, /id: "unreviewed"/);
  assert.match(app, /label: "Unreviewed"/);
  assert.match(app, /id: "action-items"/);
  assert.match(app, /label: "Action items"/);
  assert.match(app, /sources\.map\(\(source\) => \(\{/);
  assert.match(app, /label: `\$\{sourceLabel\(source\)\} inbox`/);
  assert.match(app, /function applyQueuePreset/);
  assert.match(app, /setDailyReviewActive\(false\)/);
  assert.match(app, /setSelectedDate\("all"\)/);
  assert.match(app, /setSelectedSource\(preset\.source\)/);
  assert.match(app, /setSelectedStatus\(preset\.status\)/);
  assert.match(app, /className="queue-presets"/);
  assert.match(app, /aria-label="Focused queues"/);
  assert.match(app, /className=\{`queue-preset/);
  assert.match(css, /\.queue-presets/);
  assert.match(css, /\.queue-preset/);
  assert.match(css, /\.queue-preset\.active/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.queue-presets\s*{[^}]*grid-template-columns: 1fr;/);
  assert.match(roadmap, /Basic queue presets now cover unreviewed, action, and source-specific review flows\./);
  assert.doesNotMatch(roadmap, /Improve filters for unreviewed items, action items, and source-specific\s+queues\./);
});

test("review page precomputes item view data for faster filtering", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /useDeferredValue/);
  assert.match(app, /interface ViewItem extends SavedItem/);
  assert.match(app, /function buildSearchText/);
  assert.match(app, /const deferredQuery = useDeferredValue\(query\)/);
  assert.match(app, /const viewItems = useMemo/);
  assert.match(app, /dateKey: itemDate\(item\)/);
  assert.match(app, /sortKey: item\.createdAt \|\| item\.discoveredAt/);
  assert.match(app, /normalizedStatus: normalizeStatus\(item\.status\)/);
  assert.match(app, /searchText: buildSearchText\(item\)/);
  assert.match(app, /createdLabel: formatDateTime\(item\.createdAt\)/);
  assert.match(app, /discoveredLabel: formatDateTime\(item\.discoveredAt\)/);
  assert.match(app, /details: githubDetails\(item\)/);
  assert.match(app, /shouldClamp: shouldClampText\(item\.text\)/);
  assert.match(app, /const sortedViewItems = useMemo/);
  assert.match(app, /sortItems\(viewItems\)/);
  assert.match(app, /matchesQuery\(item, deferredQuery\)/);
  assert.doesNotMatch(app, /sortItems\(items\)\s*\n\s*\.filter/);
  assert.match(css, /\.item-card\s*{[\s\S]*content-visibility: auto;/);
  assert.match(css, /\.item-card\s*{[\s\S]*contain-intrinsic-size: 220px;/);
});

test("review page exposes protected manual sync controls", async () => {
  const app = await readFile("src/view/client/src/App.tsx", "utf8");
  const css = await readFile("src/view/client/src/styles.css", "utf8");

  assert.match(app, /import \{ Dialog \} from "@base-ui\/react\/dialog"/);
  assert.match(app, /const sourceActions/);
  assert.match(app, /interface SourceStatus/);
  assert.match(app, /const \[adminSecret, setAdminSecret\]/);
  assert.match(app, /const \[accessLocked, setAccessLocked\]/);
  assert.match(app, /const \[demoMode, setDemoMode\]/);
  assert.match(app, /const \[adminStatus, setAdminStatus\]/);
  assert.match(app, /async function loadAdminStatus/);
  assert.match(app, /function startSourceAuth/);
  assert.match(app, /function runManualSync/);
  assert.match(app, /\/api\/admin\/status/);
  assert.match(app, /fetch\("\/api\/items", \{/);
  assert.match(app, /function authHeaders\(secret = adminSecret\)/);
  assert.match(app, /headers: authHeaders\(secret\)/);
  assert.match(app, /Authorization: `Bearer \$\{secret\}`/);
  assert.match(app, /Enter your access key to unlock items\./);
  assert.match(app, /Enter access key before editing items\./);
  assert.match(app, /Inbox locked/);
  assert.match(app, /Recall Inbox Demo/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.admin-dialog\s*{[\s\S]*top: 50%;[\s\S]*transform: translate\(-50%, -50%\);/);
  assert.match(css, /\.admin-dialog\s*{[\s\S]*will-change: opacity, transform;/);
  assert.doesNotMatch(css, /inset: auto 10px 10px;/);
  assert.match(app, /authPath: "\/api\/auth\/x\/start"/);
  assert.match(app, /method: "POST"/);
  assert.match(app, /fullScan \? "&fullScan=true" : ""/);
  assert.match(app, /runManualSync\("all", 50, true\)/);
  assert.doesNotMatch(app, /authPath\}\?token=/);
  assert.match(app, /id="adminSecret"/);
  assert.match(app, /<Dialog\.Root/);
  assert.match(app, /<Dialog\.Trigger/);
  assert.match(app, /<Dialog\.Popup/);
  assert.match(app, /Unlock inbox/);
  assert.match(app, /Nothing is loaded until access is confirmed\./);
  assert.match(app, /Sources & sync/);
  assert.match(app, /adminStatus \? "Refresh" : "Unlock"/);
  assert.match(app, /Recall Inbox/);
  assert.match(app, /Enter your access key to load private saved items and manage sources\./);
  assert.doesNotMatch(app, /ADMIN_SECRET/);
  assert.match(app, /Sync recent/);
  assert.match(app, /Backfill all/);
  assert.match(app, /Authorize \{action\.label\}/);
  assert.match(app, /Sync \{action\.label\}/);
  assert.match(app, /disabled=\{!canSyncAnySource/);
  assert.match(app, /disabled=\{!canSyncSource\(action\.source\)/);
  assert.match(app, /Check status/);
  assert.match(app, /source-status/);
  assert.match(css, /\.admin-unlock/);
  assert.match(css, /\.admin-lock-note/);
  assert.doesNotMatch(app, /function startXAuth/);
  assert.doesNotMatch(app, /Authorize X/);
  assert.doesNotMatch(app, /Sync X/);
  assert.doesNotMatch(app, /<h1>Saved Items<\/h1>/);
  assert.doesNotMatch(app, /className="admin-panel"/);
  assert.match(css, /\.source-status/);
  assert.match(css, /\.admin-dialog-body/);
  assert.match(css, /\.admin-trigger/);
  assert.match(css, /\.admin-backdrop/);
  assert.match(css, /\.admin-dialog/);
  assert.match(css, /\.admin-actions/);
  assert.match(css, /\.admin-button/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.admin-dialog\s*{[\s\S]*left: 50%;[\s\S]*top: 50%;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.admin-actions\s*{[^}]*grid-template-columns: 1fr;/);
  assert.match(css, /\.admin-button:disabled\s*{[\s\S]*cursor: not-allowed;/);
  assert.doesNotMatch(css, /\.admin-button:disabled\s*{[\s\S]*cursor: wait;/);
});
