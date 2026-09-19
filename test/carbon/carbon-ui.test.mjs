import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { PI_ROOT, resource, REPO, TUI_ROOT, JITI_ROOT } from './support.mjs';
const EXTENSION = resource('extensions/carbon-ui/index.ts');
const loader = await import(pathToFileURL(`${PI_ROOT}/dist/core/extensions/loader.js`));
const tuiModule = await import(pathToFileURL(`${TUI_ROOT}/dist/index.js`));
const themeModule = await import(pathToFileURL(`${PI_ROOT}/dist/modes/interactive/theme/theme.js`));

async function loadCarbonUi() {
	const result = await loader.loadExtensions([EXTENSION], REPO);
	assert.deepEqual(result.errors, []);
	assert.equal(result.extensions.length, 1);
	let active = ["bash", "read", "edit", "write"];
	result.runtime.getActiveTools = () => [...active];
	result.runtime.getAllTools = () => ["bash", "read", "edit", "write", "grep", "find", "ls"].map(name => ({ name, sourceInfo: { source: "builtin" } }));
	result.runtime.setActiveTools = names => { active = [...names]; };
	return result.extensions[0];
}

function handlers(extension, name) {
	return extension.handlers.get(name) ?? [];
}

async function emit(extension, name, event, ctx) {
	for (const handler of handlers(extension, name)) await handler(event, ctx);
}

function createHarness({ existingEditor } = {}) {
	const theme = themeModule.getThemeByName("dark");
	assert.ok(theme);
	let editorFactory;
	let expanded;
	let footerCalls = 0;
	const statuses = new Map();
	const renders = { count: 0 };
	const ui = {
		theme,
		setHiddenThinkingLabel() {},
		setToolsExpanded(value) {
			expanded = value;
		},
		setStatus(key, value) {
			if (value === undefined) statuses.delete(key);
			else statuses.set(key, value);
		},
		setFooter() {
			footerCalls++;
		},
		getEditorComponent() {
			return existingEditor ?? editorFactory;
		},
		setEditorComponent(factory) {
			editorFactory = factory;
		},
	};
	let idle = false;
	const ctx = {
		mode: "tui",
		cwd: "/tmp",
		isProjectTrusted: () => false,
		hasUI: true,
		ui,
		isIdle: () => idle,
	};
	return {
		ctx,
		theme,
		statuses,
		renders,
		setIdle(value) {
			idle = value;
		},
		get editorFactory() {
			return editorFactory;
		},
		get expanded() {
			return expanded;
		},
		get footerCalls() {
			return footerCalls;
		},
	};
}

function editorTheme(theme) {
	return {
		borderColor: (text) => theme.fg("border", text),
		selectList: {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		},
	};
}

function fakeTui(renderCounter) {
	return {
		terminal: { rows: 30 },
		requestRender() {
			renderCounter.count++;
		},
	};
}

const keybindings = { matches: () => false };

test("Pi loader accepts the extension and it preserves the active footer", async () => {
	const extension = await loadCarbonUi();
	const harness = createHarness();
	await emit(extension, "session_start", { reason: "startup" }, harness.ctx);

	assert.equal(harness.expanded, false);
	assert.equal(harness.footerCalls, 0);
	assert.equal(harness.statuses.has("carbon-ui"), false);
	assert.ok(harness.editorFactory);
	assert.equal(extension.tools.size, 7);
	assert.equal(handlers(extension, "input").length, 0);
	assert.equal(handlers(extension, "context").length, 0);
	assert.equal(handlers(extension, "tool_call").length, 0);

	await emit(extension, "ui_prompt_start", { reason: "ui_prompt", kind: "select" }, harness.ctx);
	assert.equal(harness.statuses.has("carbon-ui"), false);
	await emit(extension, "ui_prompt_end", { reason: "ui_prompt" }, harness.ctx);
	assert.equal(harness.statuses.has("carbon-ui"), false);
	assert.equal(handlers(extension, "session_before_compact").length, 0);
	harness.setIdle(true);
	await emit(extension, "agent_settled", {}, harness.ctx);
	assert.equal(harness.statuses.has("carbon-ui"), false);
	await emit(extension, "session_shutdown", { reason: "quit" }, harness.ctx);
	assert.equal(harness.statuses.has("carbon-ui"), false);
});

test("an existing custom editor is not overwritten", async () => {
	const extension = await loadCarbonUi();
	const existing = () => ({ render: () => [], invalidate() {} });
	const harness = createHarness({ existingEditor: existing });
	await emit(extension, "session_start", { reason: "startup" }, harness.ctx);
	assert.equal(harness.editorFactory, undefined);
	assert.equal(harness.footerCalls, 0);
});

test("the editor keeps native input handling, paste, multiline text, cursor and autocomplete", async () => {
	const extension = await loadCarbonUi();
	const harness = createHarness();
	await emit(extension, "session_start", { reason: "startup" }, harness.ctx);
	const editor = harness.editorFactory(
		fakeTui(harness.renders),
		editorTheme(harness.theme),
		keybindings,
	);

	assert.equal(editor.getPaddingX(), 2);
	assert.equal(Object.hasOwn(Object.getPrototypeOf(editor), "handleInput"), false);

	editor.focused = true;
	assert.ok(editor.render(80).every(line => !/\x1b\[[0-9;]*48[;:]/u.test(line)), "empty editor must have no background fill");
	editor.handleInput("\x1b[200~línea uno\n第二 línea\x1b[201~");
	assert.equal(editor.getExpandedText(), "línea uno\n第二 línea");

	for (const width of [20, 40, 80, 120]) {
		const lines = editor.render(width);
		assert.ok(lines.some((line) => line.includes(tuiModule.CURSOR_MARKER)));
		for (const line of lines) {
			assert.ok(tuiModule.visibleWidth(line) <= width, `${width}: ${stripVTControlCharacters(line)}`);
			assert.ok(!line.includes(harness.theme.getBgAnsi("userMessageBg")), "editor must not paint the message background");
		}
	}

	const autocompleteEditor = harness.editorFactory(
		fakeTui(harness.renders),
		editorTheme(harness.theme),
		keybindings,
	);
	autocompleteEditor.setAutocompleteProvider({
		triggerCharacters: ["/"],
		getSuggestions() {
			return { prefix: "/", items: [{ value: "/unicode", label: "/unicode", description: "命令" }] };
		},
		applyCompletion(lines, line, col, item, prefix) {
			const current = lines[line] ?? "";
			return {
				lines: [...lines.slice(0, line), current.slice(0, col - prefix.length) + item.value + current.slice(col), ...lines.slice(line + 1)],
				cursorLine: line,
				cursorCol: col - prefix.length + item.value.length,
			};
		},
	});
	autocompleteEditor.handleInput("/");
	await new Promise((resolve) => setTimeout(resolve, 80));
	const rendered = autocompleteEditor.render(40).map(stripVTControlCharacters).join("\n");
	assert.match(rendered, /unicode/);
});

test("non-TUI startup is a no-op", async () => {
	const extension = await loadCarbonUi();
	const harness = createHarness();
	harness.ctx.mode = "rpc";
	await emit(extension, "session_start", { reason: "startup" }, harness.ctx);
	assert.equal(harness.expanded, undefined);
	assert.equal(harness.editorFactory, undefined);
	assert.equal(harness.footerCalls, 0);
	assert.equal(harness.statuses.size, 0);
});
