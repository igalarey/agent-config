/**
 * model-list — searchable list of models with configured auth.
 *
 * Pi 0.87's ModelSelectorComponent needs the session's ModelRuntime, which extensions
 * cannot reach, so this list uses only the public ctx.modelRegistry.
 */

import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSelectListTheme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  decodeKittyPrintable,
  fuzzyFilter,
  matchesKey,
  SelectList,
  truncateToWidth,
} from "@earendil-works/pi-tui";

const MAX_VISIBLE = 12;

const modelKey = (model: Model<any>) => `${model.provider}/${model.id}`;

export function createModelList(
  ctx: ExtensionContext,
  currentModel: Model<any> | undefined,
  onSelect: (model: Model<any>) => void,
  onCancel: () => void,
): Component & { focused: boolean } {
  const models = ctx.modelRegistry.getAvailable();
  let query = "";
  let list = build(models);

  function build(visible: Model<any>[]): SelectList {
    const next = new SelectList(
      visible.map((model) => ({ value: modelKey(model), label: modelKey(model), description: model.name })),
      MAX_VISIBLE,
      getSelectListTheme(),
    );
    const current = currentModel ? visible.findIndex((model) => modelKey(model) === modelKey(currentModel)) : -1;
    if (current >= 0) next.setSelectedIndex(current);
    next.onSelect = (item) => {
      const model = models.find((candidate) => modelKey(candidate) === item.value);
      if (model) onSelect(model);
    };
    next.onCancel = onCancel;
    return next;
  }

  function setQuery(value: string): void {
    query = value;
    list = build(query ? fuzzyFilter(models, query, modelKey) : models);
  }

  return {
    focused: false,
    render: (width) => [truncateToWidth(`Search: ${query}`, width), ...list.render(width)],
    invalidate: () => list.invalidate(),
    handleInput: (data) => {
      if (matchesKey(data, "backspace")) {
        if (query) setQuery(query.slice(0, -1));
        return;
      }
      const printable = decodeKittyPrintable(data) ?? (/^[\x20-\x7e]$/.test(data) ? data : undefined);
      if (printable !== undefined) {
        setQuery(query + printable);
        return;
      }
      list.handleInput(data);
    },
  };
}
