import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import { pathToFileURL } from "node:url";

import { PI_ROOT, resource, REPO, TUI_ROOT, JITI_ROOT } from './support.mjs';
const TOOL_CARD = resource('extensions/carbon-ui/tool-card.ts');
const loadPi = (path) => import(pathToFileURL(`${PI_ROOT}/${path}`).href);

const { createJiti } = await import(pathToFileURL(`${JITI_ROOT}/lib/jiti.mjs`).href);
const jiti = createJiti(import.meta.url, {
	interopDefault: true,
	moduleCache: false,
	alias: {
		"@earendil-works/pi-coding-agent": `${PI_ROOT}/dist/index.js`,
		"@earendil-works/pi-tui": `${TUI_ROOT}/dist/index.js`,
	},
});
const { CarbonToolCard, decorateToolDefinition } = await jiti.import(TOOL_CARD, { default: false });
const {
	createBashToolDefinition,
	createEditToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	generateDiffString,
} = await loadPi("dist/index.js");
const { ToolExecutionComponent } = await loadPi("dist/modes/interactive/components/tool-execution.js");
const themeModule = await loadPi("dist/modes/interactive/theme/theme.js");
const tui = await import(pathToFileURL(`${TUI_ROOT}/dist/index.js`));

const ui = { requestRender() {} };
const cwd = REPO;
const dark = themeModule.getThemeByName("dark");
assert.ok(dark);
themeModule.setThemeInstance(dark);

function toolComponent(definition, args, options = {}) {
	return new ToolExecutionComponent(
		definition.name,
		`fixture-${definition.name}`,
		args,
		{ showImages: false, ...options },
		decorateToolDefinition(definition),
		ui,
		cwd,
	);
}

function rendered(component, width) {
	const lines = component.render(width);
	for (const line of lines) {
		assert.ok(tui.visibleWidth(line) <= width, `${width}: ${stripVTControlCharacters(line)}`);
	}
	return lines;
}

function plain(component, width = 80) {
	return rendered(component, width).map(stripVTControlCharacters);
}

function frameLines(component, width = 80) {
	return plain(component, width).filter((line) => line.length > 0);
}

function assertCardGeometry(component, width) {
	const lines = frameLines(component, width);
	assert.match(lines[0], /^╭─+╮$/u);
	assert.match(lines.at(-1), /^╰─+╯$/u);
	for (const line of lines.slice(1, -1)) assert.match(line, /^(?:│ .* │|├─+┤)$/u);
	const measured = lines.map((line) => tui.visibleWidth(line));
	assert.equal(new Set(measured).size, 1);
	assert.ok(measured[0] <= width);
	return lines;
}

test("decorator changes only rendering fields and preserves executable metadata references", () => {
	const parameters = { type: "object" };
	const execute = async () => ({ content: [{ type: "text", text: "ok" }] });
	const prepareArguments = (value) => value;
	const promptGuidelines = ["Keep this exact array."];
	const definition = {
		name: "external_task",
		label: "External task",
		description: "fixture",
		parameters,
		execute,
		prepareArguments,
		promptSnippet: "fixture snippet",
		promptGuidelines,
	};
	const decorated = decorateToolDefinition(definition);
	assert.notEqual(decorated, definition);
	assert.equal(decorated.renderShell, "self");
	assert.equal(decorated.execute, execute);
	assert.equal(decorated.parameters, parameters);
	assert.equal(decorated.prepareArguments, prepareArguments);
	assert.equal(decorated.promptSnippet, definition.promptSnippet);
	assert.equal(decorated.promptGuidelines, promptGuidelines);
	assert.equal(typeof decorated.renderCall, "function");
	assert.equal(typeof decorated.renderResult, "function");
});

test("bash is a content-sized card at 20/40/80/120 columns with ANSI and CJK-safe output", () => {
	const component = toolComponent(createBashToolDefinition(cwd), {
		command: "printf 'línea 日本語 🙂'",
	});
	component.markExecutionStarted();
	component.updateResult(
		{
			content: [
				{
					type: "text",
					text: Array.from(
						{ length: 12 },
						(_, index) => `\u001b[3${index % 7}mresultado ${index + 1}: 日本語🙂\u001b[0m`,
					).join("\n"),
				},
			],
			details: {},
			isError: false,
		},
		false,
	);

	for (const width of [20, 40, 80, 120]) assertCardGeometry(component, width);
	for (const width of [1, 2, 3, 4, 5, 8, 12]) rendered(component, width);
	const wide = frameLines(component, 120);
	assert.ok(tui.visibleWidth(wide[0]) < 120, "card should use content width, not terminal width");
	assert.ok(rendered(component, 80).some((line) => line.includes("\u001b[3")), "ANSI styling survives");
	assert.ok(plain(component).join("\n").includes("日本語🙂"));
	assert.ok(!rendered(component, 80).join("").includes("\u001b[48;"), "card adds no solid background");
});

test("bash follows pending, partial, success and error states without duplicate bodies", () => {
	const component = toolComponent(createBashToolDefinition(cwd), { command: "build" });
	let output = rendered(component, 60).join("\n");
	assert.ok(output.includes(dark.getFgAnsi("thinkingMinimal")));

	component.markExecutionStarted();
	component.updateResult(
		{ content: [{ type: "text", text: "streaming once" }], details: {}, isError: false },
		true,
	);
	output = rendered(component, 60).join("\n");
	assert.ok(output.includes(dark.getFgAnsi("thinkingMinimal")));
	assert.equal(stripVTControlCharacters(output).match(/streaming once/gu)?.length, 1);

	component.updateResult(
		{ content: [{ type: "text", text: "finished once" }], details: {}, isError: false },
		false,
	);
	output = rendered(component, 60).join("\n");
	assert.ok(output.includes(dark.getFgAnsi("borderMuted")));
	assert.equal(stripVTControlCharacters(output).match(/finished once/gu)?.length, 1);

	component.updateResult(
		{ content: [{ type: "text", text: "failure once" }], details: {}, isError: true },
		false,
	);
	output = rendered(component, 60).join("\n");
	assert.ok(output.includes(dark.getFgAnsi("error")));
	assert.equal(stripVTControlCharacters(output).match(/failure once/gu)?.length, 1);
});

test("collapsed bash output is five visual lines plus hint; expanded keeps all output and warnings", () => {
	const component = toolComponent(createBashToolDefinition(cwd), { command: "long-job" });
	const originalResult = {
		content: [{ type: "text", text: Array.from({ length: 14 }, (_, index) => `line ${index + 1}`).join("\n") }],
		details: {
			truncation: { truncated: true, truncatedBy: "lines", outputLines: 14, totalLines: 100 },
			fullOutputPath: "/tmp/full-output.log",
		},
		isError: false,
	};
	const untouched = structuredClone(originalResult);
	component.updateResult(originalResult, false);
	const collapsed = plain(component, 80).join("\n");
	assert.match(collapsed, /líneas más/u);
	assert.match(collapsed, /Output/u);
	assert.match(collapsed, /9 líneas más/u);
	assert.match(collapsed, /Full output: \/tmp\/full-output\.log/u);
	assert.match(collapsed, /Truncated: showing 14 of 100 lines/u);
	assert.equal(collapsed.includes("line 1 "), false);

	const collapsedHeight = rendered(component, 80).length;
	component.setExpanded(true);
	const expanded = plain(component, 80).join("\n");
	assert.ok(rendered(component, 80).length > collapsedHeight);
	assert.match(expanded, /line 1/u);
	assert.match(expanded, /line 14/u);
	assert.deepEqual(originalResult, untouched, "display rendering must not alter the LLM result");
});

test("argument updates replace the header instead of appending another card", () => {
	const definition = {
		name: "external_task",
		label: "External task",
		description: "fixture",
		parameters: {},
		async execute() {
			return { content: [] };
		},
	};
	const component = toolComponent(definition, { taskId: "T-1", status: "queued", path: "旧.txt", ignored: { huge: true } });
	let output = plain(component).join("\n");
	assert.match(output, /external_task T-1 queued 旧\.txt/u);
	assert.doesNotMatch(output, /huge/u);

	component.updateArgs({ taskId: "T-2", status: "running", path: "新.txt" });
	component.updateResult({ content: [{ type: "text", text: "done" }], details: {}, isError: false });
	output = plain(component).join("\n");
	assert.doesNotMatch(output, /T-1|旧\.txt/u);
	assert.equal(output.match(/external_task/gu)?.length, 1);
	assert.match(output, /T-2 running 新\.txt/u);
});

test("native write highlighting and edit diff remain inside the card", () => {
	const write = toolComponent(createWriteToolDefinition(cwd), {
		path: "fixture.ts",
		content: "const answer = 42;\nfunction value() { return answer; }\n",
	});
	const writeAnsi = rendered(write, 80).join("\n");
	assertCardGeometry(write, 80);
	assert.ok(writeAnsi.includes(dark.fg("syntaxKeyword", "const")), "native write syntax highlighting remains");
	assert.match(stripVTControlCharacters(writeAnsi), /const answer = 42/u);

	const edit = toolComponent(createEditToolDefinition(cwd), {
		path: "fixture.ts",
		edits: [{ oldText: "const answer = 41;", newText: "const answer = 42;" }],
	});
	const diff = generateDiffString("const answer = 41;\n", "const answer = 42;\n");
	edit.updateResult(
		{
			content: [{ type: "text", text: "Successfully replaced 1 block(s) in fixture.ts." }],
			details: { diff: diff.diff, firstChangedLine: diff.firstChangedLine },
			isError: false,
		},
		false,
	);
	const editOutput = stripVTControlCharacters(rendered(edit, 80).join("\n"));
	assertCardGeometry(edit, 80);
	assert.match(editOutput, /-1 const answer = 41/u);
	assert.match(editOutput, /\+1 const answer = 42/u);
	assert.equal(editOutput.match(/\+1 const answer = 42/gu)?.length, 1, "edit result mutates its native call preview");
});

test("read keeps native expansion and image blocks stay out of card text", () => {
	const read = toolComponent(createReadToolDefinition(cwd), { path: "fixture.ts" });
	const imageData = "base64-must-not-be-rendered-as-text";
	read.updateResult(
		{
			content: [
				{ type: "text", text: "const café = '日本語';" },
				{ type: "image", data: imageData, mimeType: "image/png" },
			],
			details: {},
			isError: false,
		},
		false,
	);
	assert.doesNotMatch(plain(read).join("\n"), /base64-must/u);
	assert.doesNotMatch(plain(read).join("\n"), /const café/u);
	read.setExpanded(true);
	assert.match(plain(read).join("\n"), /const café = '日本語'/u);
});

test("theme invalidation reruns card and native renderers", () => {
	const component = toolComponent(createWriteToolDefinition(cwd), {
		path: "theme.ts",
		content: "const themed = true;",
	});
	const before = rendered(component, 80).join("\n");
	const light = themeModule.getThemeByName("light");
	assert.ok(light);
	themeModule.setThemeInstance(light);
	component.invalidate();
	const after = rendered(component, 80).join("\n");
	assert.notEqual(after, before);
	assert.ok(after.includes(light.getFgAnsi("borderMuted")) || after.includes(light.getFgAnsi("thinkingMinimal")));

	themeModule.setThemeInstance(dark);
	component.invalidate();
});

test("long multiline commands stay compact and expand with their output", () => {
	const component = toolComponent(createBashToolDefinition(cwd), {
		command: Array.from({ length: 12 }, (_, index) => `echo command-${index}`).join("\n"),
	});
	component.updateResult({ content: [{ type: "text", text: "  indented output\n" }], details: {}, isError: false });
	const collapsed = plain(component).join("\n");
	assert.match(collapsed, /9 líneas de comando/u);
	assert.doesNotMatch(collapsed, /command-11/u);
	assert.match(collapsed, /│   indented output/u);
	component.setExpanded(true);
	const expanded = plain(component).join("\n");
	assert.match(expanded, /command-11/u);
	assert.equal(expanded.match(/Output/gu)?.length, 1);
});

test("CarbonToolCard is directly exportable", () => {
	const card = new CarbonToolCard(dark);
	card.setCall({ render: () => ["direct"], invalidate() {} });
	assert.deepEqual(frameLines(card, 40).map((line) => line[0]), ["╭", "│", "╰"]);
});
