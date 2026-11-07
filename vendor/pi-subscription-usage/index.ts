import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createDefaultSubscriptionProviders } from "./adapters.ts";
import {
  SubscriptionUsageController,
  type SubscriptionScheduler,
} from "./controller.ts";
import { createSubscriptionFooter } from "./footer.ts";
import type {
  SubscriptionModel,
  SubscriptionUsageProvider,
} from "./provider.ts";

export * from "./adapters.ts";
export * from "./controller.ts";
export * from "./footer.ts";
export * from "./provider.ts";

export interface SubscriptionUsageExtensionOptions {
  getAgentDir?: () => string;
  providers?: readonly SubscriptionUsageProvider[];
  providerFactory?: (
    modelRegistry: ExtensionContext["modelRegistry"],
  ) => readonly SubscriptionUsageProvider[];
  pollIntervalMs?: number;
  minRefreshIntervalMs?: number;
  now?: () => number;
  scheduler?: SubscriptionScheduler;
}

function currentModel(ctx: ExtensionContext): SubscriptionModel | undefined {
  return ctx.model;
}

function readFooterSettings(agentDir: () => string): { showFooter: boolean; pathAfterTokens: boolean } {
  try {
    const settings = JSON.parse(readFileSync(join(agentDir(), "settings.json"), "utf8"));
    return {
      showFooter: settings?.subscriptionUsage?.showFooter !== false,
      pathAfterTokens: settings?.footerLayout?.pathAfterTokens === true,
    };
  } catch {
    return { showFooter: true, pathAfterTokens: false };
  }
}

export function createSubscriptionUsageExtension(
  options: SubscriptionUsageExtensionOptions = {},
) {
  return function subscriptionUsageExtension(pi: ExtensionAPI): void {
    let showFooter = true;
    let nextRuntimeGeneration = 0;
    let active: {
      controller?: SubscriptionUsageController;
      generation: number;
      dispose(): void;
    } | undefined;

    pi.registerCommand("subscription-refresh", {
      description: "Refresh subscription usage data without reloading Pi",
      handler: async (_args, ctx) => {
        if (ctx.mode !== "tui") {
          ctx.ui.notify("Subscription refresh is available only in interactive TUI mode.", "info");
          return;
        }
        if (!showFooter) {
          ctx.ui.notify("Subscription footer is hidden by subscriptionUsage.showFooter. Set it to true in global settings.json and run /reload.", "info");
          return;
        }
        const runtime = active;
        if (!runtime?.controller) {
          ctx.ui.notify("Subscription footer is not active.", "warning");
          return;
        }
        const generation = runtime.generation;
        const outcome = await runtime.controller.requestRefresh();
        if (active !== runtime || runtime.generation !== generation) return;
        if (outcome === "throttled") {
          ctx.ui.notify("Subscription refresh is rate-limited; cached data is unchanged.", "info");
        } else if (outcome === "coalesced") {
          ctx.ui.notify("Subscription refresh is already in progress.", "info");
        } else if (outcome === "unavailable") {
          ctx.ui.notify("Subscription usage is N/D for the active model.", "warning");
        } else if (outcome === "started") {
          const state = runtime.controller.getState();
          ctx.ui.notify(
            state.kind === "connected"
              ? "ChatGPT subscription connection detected. Usage is not exposed by this connection. Check https://chatgpt.com/settings/usage"
              : state.kind === "error"
              ? "Subscription refresh failed."
              : state.kind === "stale"
                ? "Subscription refresh failed; showing previous data."
                : state.kind === "unavailable"
                  ? "Subscription usage is N/D for the active model."
                  : "Subscription usage refreshed.",
            state.kind === "known" || state.kind === "connected" ? "info" : "warning",
          );
        }
      },
    });

    pi.on("session_start", (_event, ctx) => {
      const hadActive = active !== undefined;
      active?.dispose();
      if (ctx.mode !== "tui") return;

      const settings = readFooterSettings(options.getAgentDir ?? getAgentDir);
      showFooter = settings.showFooter;
      if (!showFooter && !settings.pathAfterTokens) {
        if (hadActive) ctx.ui.setFooter(undefined);
        return;
      }

      ctx.ui.setFooter((tui, theme, footerData) => {
        active?.dispose();
        let disposed = false;
        const controller = settings.showFooter ? new SubscriptionUsageController({
          providers: options.providers
            ?? options.providerFactory?.(ctx.modelRegistry)
            ?? createDefaultSubscriptionProviders(ctx.modelRegistry, { now: options.now }),
          pollIntervalMs: options.pollIntervalMs,
          minRefreshIntervalMs: options.minRefreshIntervalMs,
          now: options.now,
          scheduler: options.scheduler,
          onChange: () => tui.requestRender(),
        }) : undefined;
        const footer = createSubscriptionFooter({
          ctx,
          footerData,
          controller,
          pathAfterTokens: settings.pathAfterTokens,
          tui,
          theme,
          now: options.now,
        });
        const runtime = {
          controller,
          generation: ++nextRuntimeGeneration,
          dispose() {
            if (disposed) return;
            disposed = true;
            runtime.generation++;
            footer.dispose();
            controller?.dispose();
            if (active === runtime) active = undefined;
          },
        };
        active = runtime;
        controller?.start(currentModel(ctx));
        return {
          invalidate: footer.invalidate,
          render: footer.render,
          handleMouse: footer.handleMouse,
          dispose: runtime.dispose,
        };
      });
    });

    pi.on("model_select", event => {
      const runtime = active;
      if (!runtime) return;
      runtime.generation++;
      runtime.controller?.setModel(event.model);
    });

    pi.on("session_shutdown", () => {
      active?.dispose();
    });
  };
}

export default createSubscriptionUsageExtension();
