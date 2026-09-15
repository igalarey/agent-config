import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const MAX_OPTIONS = 12;
const DONE_PREFIX = "✓ Done";
const UNDO_PREFIX = "↶ Undo last:";

const AskUserQuestionParams = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 2000, description: "One focused question with enough context to answer directly" }),
  kind: StringEnum(["text", "single", "multiple"] as const, { description: "Expected answer form" }),
  options: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 2, maxItems: MAX_OPTIONS })),
  placeholder: Type.Optional(Type.String({ maxLength: 300 })),
});

export type AskUserQuestionInput = Static<typeof AskUserQuestionParams>;
type QuestionResult = { question: string; kind: AskUserQuestionInput["kind"]; answers: string[]; cancelled: boolean };

function cancelled(question: string, kind: AskUserQuestionInput["kind"]) {
  const details: QuestionResult = { question, kind, answers: [], cancelled: true };
  return {
    content: [{ type: "text" as const, text: "The user cancelled the question. Do not infer or invent an answer." }],
    details,
  };
}

export function normalizeOptions(params: AskUserQuestionInput): string[] {
  if (params.kind === "text") return [];
  const options = (params.options ?? []).map(value => value.trim()).filter(Boolean);
  if (options.length < 2) throw new Error(`${params.kind} questions require at least two non-empty options`);
  if (options.length > MAX_OPTIONS) throw new Error(`At most ${MAX_OPTIONS} options are supported`);
  if (new Set(options).size !== options.length) throw new Error("Question options must be unique");
  return options;
}

async function askMultiple(
  question: string,
  options: string[],
  ctx: ExtensionContext,
  signal?: AbortSignal,
): Promise<string[] | null> {
  const remaining = [...options];
  const selected: string[] = [];
  while (true) {
    if (signal?.aborted) return null;
    const numbered = remaining.map((label, index) => `${index + 1}. ${label}`);
    const undo = selected.length ? `${UNDO_PREFIX} ${selected.at(-1)}` : null;
    const finish = selected.length ? `${DONE_PREFIX} (${selected.length} selected)` : "Cancel";
    const menu = [...numbered, ...(undo ? [undo] : []), finish];
    const choice = await ctx.ui.select(question, menu, { signal });
    if (choice === undefined || choice === "Cancel") return null;
    if (choice.startsWith(DONE_PREFIX)) return [...selected];
    if (choice.startsWith(UNDO_PREFIX)) {
      const restored = selected.pop();
      if (restored) remaining.splice(options.indexOf(restored), 0, restored);
      continue;
    }
    const index = numbered.indexOf(choice);
    if (index < 0) return null;
    selected.push(remaining[index]!);
    remaining.splice(index, 1);
    if (remaining.length === 0) return selected;
  }
}

export default function askUserQuestion(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask user",
    description:
      "Ask the user one focused blocking question through Pi's UI. Supports free text, one option, or multiple options. " +
      "Use only when a material ambiguity, user preference, or irreversible decision prevents safe progress; not for routine confirmation.",
    promptSnippet: "Ask the user one focused question only when a material decision or blocker requires their input",
    promptGuidelines: [
      "Use ask_user_question only for a material ambiguity, user preference, or irreversible decision that blocks safe progress.",
      "Do not use ask_user_question for routine confirmations or local reversible choices; choose a conservative default and continue.",
      "If ask_user_question reports cancellation, do not invent an answer.",
    ],
    parameters: AskUserQuestionParams,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error("ask_user_question requires an interactive Pi UI or RPC UI client");
      const question = params.question.trim();
      if (!question) throw new Error("Question cannot be empty");
      const options = normalizeOptions(params);
      let answers: string[] | null;
      if (params.kind === "text") {
        const answer = await ctx.ui.input(question, params.placeholder, { signal });
        answers = answer?.trim() ? [answer.trim()] : null;
      } else if (params.kind === "single") {
        const answer = await ctx.ui.select(question, options, { signal });
        answers = answer === undefined ? null : [answer];
      } else {
        answers = await askMultiple(question, options, ctx, signal);
      }
      if (!answers) return cancelled(question, params.kind);
      const details: QuestionResult = { question, kind: params.kind, answers, cancelled: false };
      return {
        content: [{ type: "text" as const, text: answers.length === 1 ? `User answered: ${answers[0]}` : `User selected:\n${answers.map(value => `- ${value}`).join("\n")}` }],
        details,
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("ask_user_question "))}${theme.fg("muted", args.question)}`, 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as QuestionResult | undefined;
      if (!details) return new Text("", 0, 0);
      if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      return new Text(`${theme.fg("success", "✓ ")}${details.answers.join(", ")}`, 0, 0);
    },
  });
}
