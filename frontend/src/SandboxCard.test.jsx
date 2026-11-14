import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Sprint2Panel from './Sprint2.jsx';
import { api } from './api.js';

vi.mock('./api.js', () => ({ api: { charge: vi.fn() } }));
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
