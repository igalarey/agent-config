export default function (pi) {
  pi.on('turn_end', event => {
    if (!event.toolResults.some(result => result.toolName === 'fixture_batch')) return;
    return {
      entries: [...event.entries, {
        type: 'custom_message', customType: 'notification-fixture-earlier',
        content: 'Earlier handler entry', display: false,
      }],
    };
  });
}
