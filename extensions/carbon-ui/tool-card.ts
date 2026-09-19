import {
	keyHint,
	truncateToVisualLines,
	type Theme,
	type ToolDefinition,
	type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
	Box,
	Container,
	Text,
	sliceByColumn,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";

type AnyToolDefinition = ToolDefinition<any, any, any>;
type ToolRenderContext = Parameters<NonNullable<AnyToolDefinition["renderCall"]>>[2];
type ToolResult = { content: Array<{ type: string; text?: string }>; details?: any };
type CardStatus = "pending" | "success" | "error";

interface CarbonRendererState {
	card: CarbonToolCard;
	nativeState: Record<string, unknown>;
	nativeCall?: Component;
	nativeResult?: Component;
	textResult?: CompactTextResult;
}

const STATE_KEY = "__carbonToolCardState";
const BODY_PREVIEW_LINES = 5;

function isBlank(line: string): boolean {
	return stripTerminalSequences(line).trim().length === 0;
}

function trimBlankEdges(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && isBlank(lines[start]!)) start++;
	while (end > start && isBlank(lines[end - 1]!)) end--;
	return lines.slice(start, end);
}

/** Remove padding emitted by native Text/Box components without stripping their ANSI styling. */
function trimNativePadding(rendered: string[], removeLeftPadding: boolean): string[] {
	const lines = trimBlankEdges(rendered);
	if (lines.length === 0) return [];

	let commonLeft = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		const plain = stripTerminalSequences(line);
		if (plain.trim().length === 0) continue;
		commonLeft = Math.min(commonLeft, plain.match(/^ */u)?.[0].length ?? 0);
	}
	if (!removeLeftPadding || !Number.isFinite(commonLeft)) commonLeft = 0;

	return lines.map((line) => {
		const plain = stripTerminalSequences(line);
		const trailing = plain.match(/ *$/u)?.[0].length ?? 0;
		const length = Math.max(0, visibleWidth(line) - commonLeft - trailing);
		return length === 0 ? "" : sliceByColumn(line, commonLeft, length, true);
	});
}

function renderComponent(component: Component | undefined, width: number): string[] {
	if (!component || width <= 0) return [];
	// Native edit wraps itself in a padded Box. Two spare columns let its real content use the
	// same width as unboxed renderers; the padding is removed immediately afterwards.
	const boxed = component instanceof Box;
	const renderWidth = boxed ? width + 2 : width;
	const lines = trimNativePadding(component.render(renderWidth), boxed);
	return lines.flatMap((line) => {
		if (line === "") return [""];
		return wrapTextWithAnsi(line, width);
	});
}

function textContent(result: ToolResult): string {
	return result.content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.replace(/\r/g, "");
}

function stripDuplicatedBashFooter(output: string, fullOutputPath: unknown): string {
	if (typeof fullOutputPath !== "string" || !output.endsWith("]")) return output;
	const footerStart = output.lastIndexOf("\n\n[");
	if (footerStart === -1 || !output.slice(footerStart).includes(fullOutputPath)) return output;
	return output.slice(0, footerStart).trimEnd();
}

class CompactTextResult implements Component {
	private result: ToolResult = { content: [] };
	private options: ToolRenderResultOptions = { expanded: false, isPartial: true };
	private theme!: Theme;
	private isError = false;
	private includeBashWarnings = false;

	setData(
		result: ToolResult,
		options: ToolRenderResultOptions,
		theme: Theme,
		isError: boolean,
		includeBashWarnings: boolean,
	): void {
		this.result = result;
		this.options = options;
		this.theme = theme;
		this.isError = isError;
		this.includeBashWarnings = includeBashWarnings;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		const details = this.result.details;
		let output = textContent(this.result).replace(/\n+$/u, "");
		if (this.includeBashWarnings) {
			output = stripDuplicatedBashFooter(output, details?.fullOutputPath);
		}

		let lines: string[];
		let skipped = 0;
		if (this.options.expanded) {
			lines = output ? wrapTextWithAnsi(output, width) : [];
		} else {
			const preview = truncateToVisualLines(output, BODY_PREVIEW_LINES, width);
			lines = preview.visualLines;
			skipped = preview.skippedCount;
		}

		const color = this.isError ? "error" : "toolOutput";
		const rendered = lines.map((line) => this.theme.fg(color, line));
		if (skipped > 0) {
			const hint =
				this.theme.fg("muted", `… ${skipped} líneas más · `) +
				keyHint("app.tools.expand", "para expandir");
			rendered.unshift(truncateToWidth(hint, width));
		}

		if (this.includeBashWarnings) {
			const warnings: string[] = [];
			if (typeof details?.fullOutputPath === "string") {
				warnings.push(`Full output: ${details.fullOutputPath}`);
			}
			if (details?.truncation?.truncated) {
				const truncation = details.truncation;
				warnings.push(
					truncation.truncatedBy === "lines"
						? `Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`
						: `Truncated: ${truncation.outputLines} lines shown`,
				);
			}
			if (warnings.length > 0) {
				rendered.push(
					...wrapTextWithAnsi(this.theme.fg("warning", `[${warnings.join(". ")}]`), width),
				);
			}
		}
		return rendered;
	}

	invalidate(): void {}
}

/** A content-sized, background-free tool frame. */
export class CarbonToolCard implements Component {
	private theme: Theme;
	private status: CardStatus = "pending";
	private call?: Component;
	private callIsHeaderOnly = false;
	private result?: Component;

	constructor(theme: Theme) {
		this.theme = theme;
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
	}

	setStatus(status: CardStatus): void {
		this.status = status;
	}

	setCall(component: Component, headerOnly = false): void {
		this.call = component;
		this.callIsHeaderOnly = headerOnly;
	}

	setResult(component: Component | undefined): void {
		this.result = component;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		if (width < 5) return [truncateToWidth(this.border("╭─╮"), width, "")];

		const maxContentWidth = width - 4;
		const callLines = renderComponent(this.call, maxContentWidth);
		const previewStart = this.callIsHeaderOnly ? -1 : callLines.findIndex(isBlank);
		const header = previewStart < 0 ? callLines : callLines.slice(0, previewStart);
		const callBody = previewStart < 0 ? [] : trimBlankEdges(callLines.slice(previewStart + 1));
		const resultBody = trimBlankEdges(renderComponent(this.result, maxContentWidth));
		const body = [...callBody];
		if (resultBody.length > 0) {
			body.push(this.theme.fg("dim", "Output"), ...resultBody);
		}
		const allContent = [...header, ...body];
		const contentWidth = Math.min(maxContentWidth, Math.max(1, ...allContent.map(visibleWidth)));
		const horizontal = "─".repeat(contentWidth + 2);
		const framed = (line: string) => {
			const clipped = truncateToWidth(line, contentWidth, "");
			return `${this.border("│")} ${clipped}${" ".repeat(Math.max(0, contentWidth - visibleWidth(clipped)))} ${this.border("│")}`;
		};

		const lines = [this.border(`╭${horizontal}╮`), ...header.map(framed)];
		if (body.length > 0) {
			lines.push(this.border(`├${horizontal}┤`));
			for (const line of body) lines.push(framed(this.theme.fg("toolOutput", line)));
		}
		lines.push(this.border(`╰${horizontal}╯`));
		return lines;
	}

	invalidate(): void {
		this.call?.invalidate();
		this.result?.invalidate();
	}

	private border(text: string): string {
		const color =
			this.status === "error"
				? "error"
				: this.status === "pending"
					? "thinkingMinimal"
					: "borderMuted";
		return this.theme.fg(color, text);
	}
}

function statusFromContext(context: ToolRenderContext): CardStatus {
	if (context.isError) return "error";
	return context.isPartial ? "pending" : "success";
}

function pertinentArgs(args: any): string[] {
	if (!args || typeof args !== "object") return [];
	const values: string[] = [];
	for (const key of ["taskId", "task_id", "status", "path", "file_path"] as const) {
		const value = args[key];
		if ((typeof value === "string" || typeof value === "number") && String(value).length > 0) {
			values.push(String(value));
		}
	}
	return [...new Set(values)];
}

function fallbackCall(definition: AnyToolDefinition, args: any, theme: Theme): Component {
	const details = pertinentArgs(args);
	let text = theme.fg("toolTitle", theme.bold(definition.name));
	if (details.length > 0) text += ` ${details.map((value) => theme.fg("accent", value)).join(" ")}`;
	return new Text(text, 0, 0);
}

function bashCall(args: any, theme: Theme, expanded: boolean): Component {
	const command = typeof args?.command === "string" ? args.command : "...";
	let text = `${theme.fg("dim", "$")} ${theme.fg("syntaxFunction", command)}`;
	if (args?.timeout !== undefined) text += theme.fg("muted", ` (timeout ${args.timeout}s)`);
	return {
		render(width) {
			const lines = wrapTextWithAnsi(text, width);
			if (expanded || lines.length <= 3) return lines;
			return [...lines.slice(0, 3), truncateToWidth(
				theme.fg("muted", `… ${lines.length - 3} líneas de comando · `) + keyHint("app.tools.expand", "para expandir"), width,
			)];
		},
		invalidate() {},
	};
}

function getState(context: ToolRenderContext, theme: Theme): CarbonRendererState {
	const shared = context.state as Record<string, unknown>;
	let state = shared[STATE_KEY] as CarbonRendererState | undefined;
	if (!state) {
		state = { card: new CarbonToolCard(theme), nativeState: {} };
		shared[STATE_KEY] = state;
	}
	state.card.setTheme(theme);
	return state;
}

function nativeContext(
	context: ToolRenderContext,
	state: CarbonRendererState,
	lastComponent: Component | undefined,
): ToolRenderContext {
	return { ...context, state: state.nativeState, lastComponent };
}

/** Decorate a tool definition without changing its executable or prompt-facing metadata. */
export function decorateToolDefinition<T extends AnyToolDefinition>(definition: T): T {
	const nativeRenderCall = definition.renderCall;
	const nativeRenderResult = definition.renderResult;

	const decorated = {
		...definition,
		renderShell: "self" as const,
		renderCall(args: any, theme: Theme, context: ToolRenderContext) {
			const state = getState(context, theme);
			let call: Component;
			if (definition.name === "bash") {
				call = bashCall(args, theme, context.expanded);
			} else if (nativeRenderCall) {
				try {
					call = nativeRenderCall(args, theme, nativeContext(context, state, state.nativeCall));
					state.nativeCall = call;
				} catch {
					state.nativeCall = undefined;
					call = fallbackCall(definition, args, theme);
				}
			} else {
				call = fallbackCall(definition, args, theme);
			}
			state.card.setCall(call, definition.name === "bash" || !nativeRenderCall);
			state.card.setStatus(statusFromContext(context));
			return state.card;
		},
		renderResult(result: ToolResult, options: ToolRenderResultOptions, theme: Theme, context: ToolRenderContext) {
			const state = getState(context, theme);
			let rendered: Component | undefined;
			if (definition.name === "bash" || !nativeRenderResult) {
				const component = state.textResult ?? new CompactTextResult();
				state.textResult = component;
				component.setData(result, options, theme, context.isError, definition.name === "bash");
				rendered = component;
			} else {
				try {
					rendered = nativeRenderResult(
						result,
						options,
						theme,
						nativeContext(context, state, state.nativeResult),
					);
					state.nativeResult = rendered;
				} catch {
					state.nativeResult = undefined;
					const component = state.textResult ?? new CompactTextResult();
					state.textResult = component;
					component.setData(result, options, theme, context.isError, false);
					rendered = component;
				}
			}
			state.card.setResult(rendered);
			state.card.setStatus(statusFromContext(context));
			return new Container();
		},
	};
	return decorated as T;
}
