import assert from 'node:assert/strict';
import test from 'node:test';
import { PI_ROOT, TUI_ROOT, resource } from './support.mjs';
import { pathToFileURL } from 'node:url';
const root = PI_ROOT + '/';
const load = (path) => import(pathToFileURL(root + path).href);
const { loadThemeFromPath, setThemeInstance } = await load('dist/modes/interactive/theme/theme.js');
const { validateThemeJson } = await load('dist/modes/interactive/theme/theme-json.js');
const { visibleWidth } = await import(pathToFileURL(TUI_ROOT + '/dist/index.js'));
const { UserMessageComponent } = await load('dist/modes/interactive/components/user-message.js');
const { AssistantMessageComponent } = await load('dist/modes/interactive/components/assistant-message.js');
const { ToolExecutionComponent } = await load('dist/modes/interactive/components/tool-execution.js');
const { createBashToolDefinition } = await load('dist/core/tools/bash.js');
const { readFileSync } = await import('node:fs');
const themePath = resource('themes/carbon-violet.json');
test('Carbon theme validates and native messages retain expansion and visible errors', () => {
validateThemeJson(themePath, JSON.parse(readFileSync(themePath, 'utf8')));
setThemeInstance(loadThemeFromPath(themePath, 'truecolor'));
const user = new UserMessageComponent('Revisa el proyecto y ejecuta las comprobaciones. Mantén los cambios pequeños.');
const assistant = new AssistantMessageComponent({
  role: 'assistant', content: [
    {type: 'thinking', thinking: 'Plan de prueba sintético: revisar primero y verificar después.'},
    {type: 'text', text: 'Voy a comprobar el estado del proyecto y ejecutar las pruebas.'},
  ], stopReason: 'stop',
}, true);
const ui = { requestRender() {} };
const tool = new ToolExecutionComponent('bash', 'fixture', {command: 'npm test'}, {showImages: false}, createBashToolDefinition('/tmp'), ui, '/tmp');
tool.markExecutionStarted();
tool.updateResult({content: [{type: 'text', text: Array.from({length: 30}, (_, i) => `✓ comprobación ${i + 1}: correcta`).join('\n')}], details: {}, isError: false});
for (const width of [20, 40, 80, 120]) {
  for (const component of [user, assistant, tool]) {
    for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `Overflow at ${width}`);
  }
  const collapsed = tool.render(width).length;
  tool.setExpanded(true);
  assert.ok(tool.render(width).length > collapsed);
  tool.setExpanded(false);
}
const collapsedThinking = assistant.render(100).join('\n');
assert.ok(!collapsedThinking.includes('Plan de prueba'));
assistant.setHideThinkingBlock(false);
assert.ok(assistant.render(100).join('\n').includes('Plan de prueba'));
assistant.setHideThinkingBlock(true);
tool.updateResult({content: [{type: 'text', text: 'Error de prueba visible'}], details: {}, isError: true});
assert.ok(tool.render(80).join('\n').includes('Error de prueba visible'));
assert.ok(!tool.render(80).join('\n').includes('48;2;51;38;41'));
});
