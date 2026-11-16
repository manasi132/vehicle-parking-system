const http = require('node:http');
const app = require('../src/app');
const { emitSlotUpdate } = require('../src/utils/realtime');

test('public board receives slot updates without reservation details', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tracking/board/events`, { signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body.getReader();
    await reader.read(); // connection comment
    emitSlotUpdate({ lotId: 'lot', slotId: 'slot', status: 'occupied', updatedAt: '2026-01-01T00:00:00Z', reservationId: 'private' });
    const chunk = new TextDecoder().decode((await reader.read()).value);
    expect(chunk).toContain('event: slot:update');
    expect(chunk).toContain('"status":"occupied"');
    expect(chunk).not.toContain('private');
  } finally { controller.abort(); await new Promise(resolve => server.close(resolve)); }
});
