import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Sprint2Panel from './Sprint2.jsx';
import { api } from './api.js';

vi.mock('./api.js', () => ({ api: { charge: vi.fn(), receipt: vi.fn().mockResolvedValue({}), paymentQuote: vi.fn(), reports: vi.fn(), occupancy: vi.fn().mockResolvedValue({ lots: [] }), attendants: vi.fn().mockResolvedValue({ attendants: [] }), auditLogs: vi.fn().mockResolvedValue({ logs: [] }) } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('collects a Stripe Elements token and sends only the token to the payment API', async () => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_example');
  const card = { on: vi.fn(), mount: vi.fn(), destroy: vi.fn(), clear: vi.fn() };
  const createToken = vi.fn().mockResolvedValue({ token: { id: 'tok_fromStripe' } });
  vi.stubGlobal('Stripe', vi.fn(() => ({ elements: () => ({ create: () => card }), createToken })));
  api.charge.mockResolvedValue({ receiptId: 'pi_test', balanceDue: 0 });
  render(<Sprint2Panel role="driver" lots={[]} />);
  const panel = within(screen.getByRole('heading', { name: /payment and receipt/i }).closest('section'));
  fireEvent.change(panel.getByLabelText(/reservation reference/i), { target: { value: 'reservation-1' } });
  await waitFor(() => expect(panel.getByRole('button', { name: /pay securely/i })).toBeEnabled());
  fireEvent.click(panel.getByRole('button', { name: /pay securely/i }));
  await waitFor(() => expect(api.charge).toHaveBeenCalledWith({ reservationId: 'reservation-1', paymentToken: 'tok_fromStripe' }));
  expect(createToken).toHaveBeenCalledWith(card);
  expect(await panel.findByText(/pi_test/i)).toBeInTheDocument();
  expect(card.clear).toHaveBeenCalled();
});

it('does not load card collection with a live publishable key', async () => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_live_example');
  const Stripe = vi.fn(); vi.stubGlobal('Stripe', Stripe);
  render(<Sprint2Panel role="driver" lots={[]} />);
  expect(await screen.findByText(/configure a Stripe test-mode publishable key/i)).toBeInTheDocument();
  expect(Stripe).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /pay securely/i })).toBeDisabled();
});

it('shows a reservation quote and printable receipt', async () => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', '');
  api.paymentQuote.mockResolvedValue({ amountMinor: 10000, currency: 'inr', paid: false });
  api.charge.mockResolvedValue({ receiptId: 'pi_test', balanceDue: 0 });
  api.receipt.mockResolvedValue({ receipt: { amountMinor: 10000, currency: 'inr' } });
  render(<Sprint2Panel role="driver" lots={[]} />);
  const panel = within(screen.getByRole('heading', { name: /payment and receipt/i }).closest('section'));
  fireEvent.change(panel.getByLabelText(/reservation reference/i), { target: { value: 'reservation-1' } });
  fireEvent.click(panel.getByRole('button', { name: /check amount due/i }));
  expect(await panel.findByText(/100.00 INR.*due/i)).toBeInTheDocument();
  fireEvent.click(panel.getByRole('button', { name: /pay securely/i }));
  expect(await panel.findByRole('button', { name: /print receipt/i })).toBeInTheDocument();
});

it('only shows reports to admins and loads the report data', async () => {
  api.reports.mockResolvedValue({ lots: [{ lotId: 'l1', name: 'Central', occupancy: { stays: 2, parkedMinutes: 90 }, revenue: { inr: { netMinor: 12345 } } }] });
  const view = render(<Sprint2Panel role="driver" lots={[]} />);
  expect(screen.queryByRole('heading', { name: /occupancy and revenue reports/i })).not.toBeInTheDocument();
  view.rerender(<Sprint2Panel role="admin" lots={[]} />);
  const panel = within(screen.getByRole('heading', { name: /occupancy and revenue reports/i }).closest('section'));
  fireEvent.change(panel.getByLabelText('From'), { target: { value: '2026-01-01T10:00' } });
  fireEvent.change(panel.getByLabelText('To'), { target: { value: '2026-01-02T10:00' } });
  fireEvent.click(panel.getByRole('button', { name: /load report/i }));
  expect(await panel.findByText(/123.45 INR/)).toBeInTheDocument();
});
