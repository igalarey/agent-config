import {
	CustomEditor,
	type ExtensionAPI,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { registerCarbonBuiltins } from "./builtin-tools.js";

type MarkedEditorFactory = ((
	tui: TUI,
	theme: EditorTheme,
	keybindings: KeybindingsManager,
) => CarbonEditor) & { __carbonUiEditor?: true };

const STATUS_KEY = "carbon-ui";
export class CarbonEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
	) {
		super(tui, theme, keybindings, { paddingX: 2 });
	}
}

export default function carbonUi(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		registerCarbonBuiltins(pi, ctx);
		ctx.ui.setHiddenThinkingLabel(`${ctx.ui.theme.fg("accent", "◌")} ${ctx.ui.theme.fg("thinkingText", "Thinking")}`);
		ctx.ui.setToolsExpanded(false);
		ctx.ui.setStatus(STATUS_KEY, undefined);

		const currentFactory = ctx.ui.getEditorComponent() as MarkedEditorFactory | undefined;
		if (!currentFactory || currentFactory.__carbonUiEditor) {
			const factory: MarkedEditorFactory = (tui, editorTheme, keybindings) =>
				new CarbonEditor(tui, editorTheme, keybindings);
			factory.__carbonUiEditor = true;
			ctx.ui.setEditorComponent(factory);
		}
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setHiddenThinkingLabel();
		}
	});
}
