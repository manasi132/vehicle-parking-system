import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import AvailabilityBoard from './AvailabilityBoard.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows public availability and reloads after a slot update', async () => {
  let onUpdate; const close = vi.fn();
  vi.stubGlobal('EventSource', class { addEventListener(type, callback) { if (type === 'slot:update') onUpdate = callback; } close() { close(); } });
  let available = 2;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ lots: [{ _id: 'lot', name: 'Central', availableSlots: available }] }) })));
  const view = render(<AvailabilityBoard />);
  expect(await screen.findByText('2 available')).toBeInTheDocument();
  available = 1;
  await act(async () => { onUpdate(); });
  await waitFor(() => expect(screen.getByText('1 available')).toBeInTheDocument());
  view.unmount(); expect(close).toHaveBeenCalled();
});
