/**
 * model-picker — searchable model list for the /supervise model command.
 */

import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createModelList } from "./model-list.js";

/**
 * Open the interactive model picker.
 * Returns the selected Model, or null if the user cancelled.
 */
export async function pickModel(
  ctx: ExtensionContext,
  currentProvider?: string,
  currentModelId?: string
): Promise<Model<any> | null> {
  // Resolve the currently-selected supervisor model (to pre-highlight it)
  const currentModel =
    currentProvider && currentModelId
      ? ctx.modelRegistry.find(currentProvider, currentModelId)
      : undefined;

  return ctx.ui.custom<Model<any> | null>((tui, _theme, _kb, done) => {
    const component = createModelList(
      ctx,
      currentModel,
      (model) => done(model),
      () => done(null)
    );

    // Give focus so the search input is active immediately
    component.focused = true;

    return {
      render: (width) => component.render(width),
      invalidate: () => component.invalidate(),
      handleInput: (data) => {
        component.handleInput?.(data);
        tui.requestRender();
      },
    };
  });
}
