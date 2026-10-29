import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => payload,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Vehicle Parking System frontend', () => {
  it('shows the login screen and switches to registration', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /sign in to parkwise/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
  });

  it('submits registration and displays the API confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { message: 'Account created successfully.' })));
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Meghana B' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'meghana@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Secure!Pass123' } });
    const buttons = screen.getAllByRole('button', { name: /create account/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/account created/i));
  });

  it('displays a server error when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Invalid credentials.' })));
    render(<App />);
    fireEvent.change(screen.getByLabelText(/email or phone number/i), { target: { value: 'meghana@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Wrong!Pass123' } });
    const buttons = screen.getAllByRole('button', { name: /sign in/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i));
  });

  it('shows available slots and surfaces a reservation conflict', async () => {
    window.localStorage.setItem('vps.token', 'test-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Meghana', role: 'driver' }));
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/api/lots')) {
        return jsonResponse(200, { lots: [{ _id: 'lot-1', name: 'Central Parking', address: '1 Main Road', city: 'Bengaluru' }] });
      }
      if (url.endsWith('/api/lots/lot-1/slots')) {
        return jsonResponse(200, { slots: [
          { _id: 'slot-1', slotNumber: 'A-001', status: 'available' },
          { _id: 'slot-2', slotNumber: 'A-002', status: 'occupied' },
        ] });
      }
      if (url.endsWith('/api/slots/reserve')) {
        return jsonResponse(409, { message: 'Slot already reserved.' });
      }
      return jsonResponse(404, { message: 'Not found.' });
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /central parking/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /view slots/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /a-001/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /a-001/i }));
    fireEvent.change(screen.getByLabelText(/reservation start time/i), { target: { value: '2026-11-01T10:00' } });
    fireEvent.change(screen.getByLabelText(/reservation end time/i), { target: { value: '2026-11-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /reserve selected slot/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/slot was just booked/i));
  });

  it('opens the gate kiosk for a signed-in attendant', async () => {
    window.localStorage.setItem('vps.token', 'test-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Meghana', role: 'attendant' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { lots: [] })));
    render(<App />);
    expect(screen.getByRole('heading', { name: /gate operations/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /gate kiosk/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/vehicle registration number/i)).toBeInTheDocument();
  });
});