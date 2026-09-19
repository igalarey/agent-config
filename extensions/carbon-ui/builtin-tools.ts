import {
	createBashToolDefinition,
	createReadToolDefinition,
	createEditToolDefinition,
	createWriteToolDefinition,
	createGrepToolDefinition,
	createFindToolDefinition,
	createLsToolDefinition,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { decorateToolDefinition } from "./tool-card.js";

export function registerCarbonBuiltins(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const settings = SettingsManager.create(ctx.cwd, undefined, { projectTrusted: ctx.isProjectTrusted() });
	const definitions = [
		createBashToolDefinition(ctx.cwd, {
			shellPath: settings.getShellPath(),
			commandPrefix: settings.getShellCommandPrefix(),
		}),
		createReadToolDefinition(ctx.cwd, { autoResizeImages: settings.getImageAutoResize() }),
		createEditToolDefinition(ctx.cwd),
		createWriteToolDefinition(ctx.cwd),
		createGrepToolDefinition(ctx.cwd),
		createFindToolDefinition(ctx.cwd),
		createLsToolDefinition(ctx.cwd),
	];
	const active = pi.getActiveTools();
	const tools = new Map(pi.getAllTools().map(tool => [tool.name, tool]));
	for (const definition of definitions) {
		const existing = tools.get(definition.name);
		if (existing && existing.sourceInfo.source !== "builtin") continue;
		pi.registerTool(decorateToolDefinition(definition));
	}
	// Registering inactive built-ins must not bypass --tools, --exclude-tools or defaultTools.
	pi.setActiveTools(active);
}
