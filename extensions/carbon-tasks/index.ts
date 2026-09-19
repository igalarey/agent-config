import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { decorateToolDefinition } from "../carbon-ui/tool-card.js";

function sourceOf(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (!entry || typeof entry !== "object") return undefined;
	const source = (entry as { source?: unknown }).source;
	return typeof source === "string" ? source : undefined;
}

function isPiTasksSource(source: string): boolean {
	const normalized = source.replaceAll("\\", "/").replace(/\/+$/u, "");
	return normalized === "pi-tasks" || normalized.endsWith("/pi-tasks");
}

async function resolveTasksFactory(): Promise<ExtensionFactory> {
	const settingsPath = join(getAgentDir(), "settings.json");
	const settings = JSON.parse(await readFile(settingsPath, "utf8")) as { packages?: unknown };
	if (!Array.isArray(settings.packages)) {
		throw new Error("Carbon tasks requires a packages array in global Pi settings");
	}
	const sources = settings.packages.map(sourceOf).filter((source): source is string =>
		typeof source === "string" && isPiTasksSource(source));
	if (sources.length !== 1) {
		throw new Error(`Carbon tasks expected one configured @tintinweb/pi-tasks source, found ${sources.length}`);
	}

	const packageRoot = resolve(dirname(settingsPath), sources[0]!);
	const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { name?: unknown };
	if (metadata.name !== "@tintinweb/pi-tasks") {
		throw new Error(`Carbon tasks found an unexpected package at ${packageRoot}`);
	}
	const loaded = await import(pathToFileURL(join(packageRoot, "src/index.ts")).href) as { default?: unknown };
	if (typeof loaded.default !== "function") {
		throw new Error("Carbon tasks could not load the @tintinweb/pi-tasks extension factory");
	}
	return loaded.default as ExtensionFactory;
}

export default async function carbonTasks(pi: ExtensionAPI): Promise<void> {
	const tasks = await resolveTasksFactory();
	await tasks({
		...pi,
		registerTool(definition) {
			pi.registerTool(decorateToolDefinition(definition));
		},
	});
}
