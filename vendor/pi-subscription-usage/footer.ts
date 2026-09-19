import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type {
  RefreshOutcome,
  SubscriptionUsageState,
} from "./controller.ts";

interface ControllerView {
  getState(): SubscriptionUsageState;
  requestRefresh(): Promise<RefreshOutcome>;
  dispose(): void;
}

type FooterTheme = ExtensionContext["ui"]["theme"];

export interface SubscriptionFooterOptions {
  ctx: ExtensionContext;
  footerData: ReadonlyFooterDataProvider;
  controller: ControllerView;
  tui: Pick<TUI, "requestRender">;
  theme: FooterTheme;
  now?: () => number;
  home?: string;
}

type UsageShape = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
};

function sanitizeSingleLine(text: string): string {
  return stripTerminalSequences(text)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export function formatTokens(count: number): string {
  if (count < 1_000) return count.toString();
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

export function formatCwd(cwd: string, home: string | undefined): string {
  if (!home) return cwd;
  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const insideHome = relativeToHome === ""
    || (relativeToHome !== ".."
      && !relativeToHome.startsWith(`..${sep}`)
      && !isAbsolute(relativeToHome));
  if (!insideHome) return cwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");
}

function formatReset(resetsAt: number | undefined, now: number): string {
  if (resetsAt === undefined || resetsAt <= now) return "";
  const minutes = Math.ceil((resetsAt - now) / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainder = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && remainder) parts.push(`${remainder}m`);
  return ` (resets in ${parts.join(" ") || "<1m"})`;
}

export function formatSubscriptionMarker(
  state: SubscriptionUsageState,
  now: number,
  options: { compact?: boolean } = {},
): string {
  const prefix = sanitizeSingleLine(state.target.label);
  if (state.kind === "loading") return `${prefix} · loading… · ↻`;
  if (state.kind === "unavailable") return `${prefix} · N/D · ↻`;
  if (state.kind === "error") return `${prefix} · error · ↻`;

  const windows = state.usage.windows.map(window => {
    const reset = options.compact ? "" : formatReset(window.resetsAt, now);
    return `${sanitizeSingleLine(window.label)} ${formatPercent(window.usedPercent)}% used${reset}`;
  });
  const tokenSpend = state.usage.tokenSpend;
  if (tokenSpend && !options.compact) {
    const period = tokenSpend.periodLabel ? `/${sanitizeSingleLine(tokenSpend.periodLabel)}` : "";
    windows.push(`tokens ${formatTokens(tokenSpend.usedTokens)} used${period}${formatReset(tokenSpend.resetsAt, now)}`);
  }
  if (state.kind === "stale") windows.push("stale");
  return `${prefix} · ${windows.join(" · ")} · ↻`;
}

function fitLocation(cwd: string, branch: string | null, width: number): string {
  if (width <= 0) return "";
  const branchSuffix = branch ? ` (${branch})` : "";
  const branchWidth = visibleWidth(branchSuffix);
  if (branchWidth > width) return truncateToWidth(branchSuffix.trimStart(), width, "...");
  const cwdWidth = width - branchWidth;
  return `${truncateToWidth(cwd, cwdWidth, "...")}${branchSuffix}`;
}

function fitMarkerWithRefresh(marker: string, width: number): string {
  if (visibleWidth(marker) <= width) return marker;
  const refreshSuffix = " ↻";
  const suffixWidth = visibleWidth(refreshSuffix);
  if (width < suffixWidth) return truncateToWidth(marker, width, "");
  const body = marker.slice(0, marker.lastIndexOf("↻")).trimEnd();
  return `${truncateToWidth(body, width - suffixWidth, "...")}${refreshSuffix}`;
}

function collectUsage(entries: readonly unknown[]): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  latestCacheHitRate?: number;
} {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let latestCacheHitRate: number | undefined;
  const add = (usage: UsageShape | undefined, trackCacheRate: boolean) => {
    if (!usage) return;
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const cacheRead = usage.cacheRead ?? 0;
    const cacheWrite = usage.cacheWrite ?? 0;
    totals.input += input;
    totals.output += output;
    totals.cacheRead += cacheRead;
    totals.cacheWrite += cacheWrite;
    totals.cost += usage.cost?.total ?? 0;
    if (trackCacheRate) {
      const prompt = input + cacheRead + cacheWrite;
      latestCacheHitRate = prompt > 0 ? (cacheRead / prompt) * 100 : undefined;
    }
  };

  for (const value of entries) {
    if (!value || typeof value !== "object") continue;
    const entry = value as {
      type?: string;
      usage?: UsageShape;
      message?: { role?: string; usage?: UsageShape };
    };
    if (entry.type === "message" && entry.message?.role === "assistant") {
      add(entry.message.usage, true);
    } else if (entry.type === "message" && entry.message?.role === "toolResult") {
      add(entry.message.usage, false);
    } else if (entry.type === "branch_summary" || entry.type === "compaction") {
      add(entry.usage, false);
    }
  }
  return { ...totals, ...(latestCacheHitRate === undefined ? {} : { latestCacheHitRate }) };
}

export function createSubscriptionFooter(options: SubscriptionFooterOptions) {
  const { ctx, footerData, controller, tui, theme } = options;
  const now = options.now ?? Date.now;
  const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
  let refreshBounds: { start: number; end: number } | undefined;

  return {
    invalidate() {},
    dispose: unsubscribeBranch,
    render(width: number): string[] {
      const branchValue = footerData.getGitBranch();
      const branch = branchValue ? sanitizeSingleLine(branchValue) : null;
      const cwd = sanitizeSingleLine(formatCwd(
        ctx.cwd,
        options.home ?? process.env.HOME ?? process.env.USERPROFILE,
      ));
      const state = controller.getState();
      const fullMarker = formatSubscriptionMarker(state, now());
      const sessionNameValue = ctx.sessionManager.getSessionName();
      const sessionSuffix = sessionNameValue ? ` • ${sanitizeSingleLine(sessionNameValue)}` : "";
      const fullLocation = branch ? `${cwd} (${branch})` : cwd;
      const fullLine = `${fullLocation}${sessionSuffix}`;

      const usage = collectUsage(ctx.sessionManager.getEntries());
      const parts: string[] = [];
      if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
      if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
      if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
      if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
      if ((usage.cacheRead || usage.cacheWrite) && usage.latestCacheHitRate !== undefined) {
        parts.push(`CH${usage.latestCacheHitRate.toFixed(1)}%`);
      }
      if (usage.cost) parts.push(`$${usage.cost.toFixed(3)}`);

      const context = ctx.getContextUsage();
      const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
      const contextPercent = context?.percent === null || context?.percent === undefined
        ? "?"
        : context.percent.toFixed(1);
      const contextDisplay = contextPercent === "?"
        ? `?/${formatTokens(contextWindow)}`
        : `${contextPercent}%/${formatTokens(contextWindow)}`;
      if ((context?.percent ?? 0) > 90) parts.push(theme.fg("error", contextDisplay));
      else if ((context?.percent ?? 0) > 70) parts.push(theme.fg("warning", contextDisplay));
      else parts.push(contextDisplay);

      const stats = parts.join(" ");
      const markerBudget = Math.max(0, width - Math.min(Math.floor(width / 3), visibleWidth(stats)) - 2);
      const marker = visibleWidth(fullMarker) <= markerBudget
        ? fullMarker
        : fitMarkerWithRefresh(formatSubscriptionMarker(state, now(), { compact: true }), markerBudget);
      const markerWidth = visibleWidth(marker);
      const leftBudget = Math.max(0, width - markerWidth - 2);
      const locationBudget = Math.max(0, Math.min(Math.floor(width / 3),
        leftBudget - visibleWidth(visibleWidth(stats) + 2 < leftBudget ? stats : contextDisplay) - 2));
      const renderedLocation = visibleWidth(fullLine) <= locationBudget
        ? fullLine
        : fitLocation(cwd, branch, locationBudget);
      const statsBudget = Math.max(0, leftBudget - (renderedLocation ? visibleWidth(renderedLocation) + 2 : 0));
      const fittedStats = truncateToWidth(visibleWidth(stats) <= statsBudget ? stats : parts[parts.length - 1], statsBudget, "");
      const statsLeft = renderedLocation ? `${renderedLocation}  ${fittedStats}` : fittedStats;
      const padding = " ".repeat(Math.max(0, width - visibleWidth(statsLeft) - markerWidth));
      const lines = [theme.fg("dim", statsLeft + padding + marker)];
      const statuses = [...footerData.getExtensionStatuses().entries()]
        .sort(([left], [rightKey]) => left.localeCompare(rightKey))
        .map(([key, text]) => key === "om" ? theme.fg("dim", sanitizeSingleLine(text)) : sanitizeSingleLine(text));
      const statusText = statuses.join(" ");
      const modelName = sanitizeSingleLine(ctx.model?.id ?? "no-model");
      const thinkingLevel = sanitizeSingleLine(ctx.thinkingLevel ?? "off");
      let right = ctx.model?.reasoning
        ? `${modelName} • ${thinkingLevel === "off" ? "thinking off" : thinkingLevel}`
        : modelName;
      if (ctx.model && footerData.getAvailableProviderCount() > 1) {
        const withProvider = `(${sanitizeSingleLine(ctx.model.provider)}) ${right}`;
        if (visibleWidth(statusText) + 2 + visibleWidth(withProvider) <= width) right = withProvider;
      }
      const gap = statusText && width > 2 ? 2 : 0;
      const availableRight = Math.max(0, width - gap - Math.min(visibleWidth(statusText), Math.floor(width / 2)));
      const renderedRight = truncateToWidth(right, availableRight, "");
      const statusLeft = truncateToWidth(statusText, Math.max(0, width - visibleWidth(renderedRight) - gap), "...");
      const statusPadding = " ".repeat(Math.max(0, width - visibleWidth(statusLeft) - visibleWidth(renderedRight)));
      lines.push(statusLeft + theme.fg("dim", statusPadding + renderedRight));
      const refreshIndex = marker.lastIndexOf("↻");
      const refreshStart = width - markerWidth + visibleWidth(marker.slice(0, refreshIndex));
      refreshBounds = refreshIndex >= 0 ? { start: refreshStart, end: refreshStart + 1 } : undefined;
      return lines;
    },
    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
      if (event.type !== "click" || event.button !== "left" || event.y !== 0 || !refreshBounds) return undefined;
      if (event.x < refreshBounds.start || event.x >= refreshBounds.end) return undefined;
      void controller.requestRefresh();
      tui.requestRender();
      return { handled: true, render: true };
    },
  };
}
