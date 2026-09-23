export default function lunaFast(pi) {
  pi.on('before_provider_request', (event, ctx) => {
    if (ctx.model?.provider !== 'openai-codex'
      || ctx.model.id !== 'gpt-6-luna'
      || ctx.model.api !== 'openai-codex-responses') return;
    return { ...event.payload, service_tier: 'priority' };
  });
}
