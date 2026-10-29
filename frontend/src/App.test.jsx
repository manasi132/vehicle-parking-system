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
      if (String(url).includes('/api/lots?') || String(url).endsWith('/api/lots')) {
        return jsonResponse(200, { lots: [{ _id: 'lot-1', name: 'Central Parking', address: '1 Main Road', city: 'Bengaluru' }] });
      }
      if (url.includes('/api/lots/lot-1/slots')) {
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
    fireEvent.change(screen.getByLabelText(/booking vehicle registration/i), { target: { value: 'KA01AB1234' } });
    fireEvent.click(screen.getByRole('button', { name: /reserve selected slot/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/slot was just booked/i));
  });


  it('polls lot and selected-slot availability every four seconds', async () => {
    window.localStorage.setItem('vps.token', 'test-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Manavi', role: 'driver' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { lots: [] })));
    const intervalSpy = vi.spyOn(window, 'setInterval');

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 4000);
  });

  it('sends location coordinates and a maximum rate to the search API', async () => {
    window.localStorage.setItem('vps.token', 'test-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Manavi', role: 'driver' }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { lots: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.change(screen.getByLabelText(/maximum hourly rate/i), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText(/search latitude/i), { target: { value: '12.9716' } });
    fireEvent.change(screen.getByLabelText(/search longitude/i), { target: { value: '77.5946' } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes('maxRate=75') &&
        String(url).includes('lat=12.9716') &&
        String(url).includes('lng=77.5946')
      )).toBe(true);
    });
  });

  it('submits hourly rate and coordinates when an admin creates a lot', async () => {
    window.localStorage.setItem('vps.token', 'admin-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Admin', role: 'admin' }));
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = String(url);
      if (path.includes('/api/lots') && options.method === 'POST') {
        return jsonResponse(201, { lot: { _id: 'lot-new' } });
      }
      if (path.includes('/api/lots')) return jsonResponse(200, { lots: [] });
      return jsonResponse(404, { message: 'Not found.' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /manage lots/i }));
    fireEvent.change(screen.getByLabelText(/lot name/i), { target: { value: 'Central Parking' } });
    fireEvent.change(screen.getByLabelText(/^city$/i), { target: { value: 'Bengaluru' } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Main Road' } });
    fireEvent.change(screen.getByLabelText(/lot hourly rate/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/lot latitude/i), { target: { value: '12.9716' } });
    fireEvent.change(screen.getByLabelText(/lot longitude/i), { target: { value: '77.5946' } });
    fireEvent.click(screen.getByRole('button', { name: /create lot/i }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([url, options]) =>
        String(url).startsWith('/api/lots') && options?.method === 'POST'
      );
      expect(createCall).toBeTruthy();
      const payload = JSON.parse(createCall[1].body);
      expect(payload.hourlyRate).toBe(60);
      expect(payload.latitude).toBe(12.9716);
      expect(payload.longitude).toBe(77.5946);
    });
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

  it('stores the returned session token and opens role-aware navigation after login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      token: 'signed-test-token',
      user: { _id: 'user-1', name: 'Driver One', role: 'driver' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText(/email or phone number/i), { target: { value: 'driver@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidPass!123' } });
    const signInButtons = screen.getAllByRole('button', { name: /sign in/i });
    fireEvent.click(signInButtons[signInButtons.length - 1]);
    await waitFor(() => expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument());
    expect(window.localStorage.getItem('vps.token')).toBe('signed-test-token');
    expect(screen.getByRole('button', { name: /find parking/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gate kiosk/i })).not.toBeInTheDocument();
  });

  it('sends authenticated entry and exit actions from the attendant kiosk', async () => {
    window.localStorage.setItem('vps.token', 'attendant-token');
    window.localStorage.setItem('vps.user', JSON.stringify({ name: 'Attendant', role: 'attendant' }));
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/api/lots')) return jsonResponse(200, { lots: [] });
      if (String(url).endsWith('/api/tracking/entry')) return jsonResponse(200, { message: 'Entry recorded.' });
      if (String(url).endsWith('/api/tracking/exit')) return jsonResponse(200, { message: 'Exit recorded.' });
      return jsonResponse(404, { message: 'Not found.' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText(/reservation id/i), { target: { value: 'reservation-123' } });
    fireEvent.change(screen.getByLabelText(/vehicle registration number/i), { target: { value: 'KA01AB1234' } });
    fireEvent.click(screen.getByRole('button', { name: /record entry/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/entry recorded/i));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tracking/entry', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer attendant-token' }),
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: /record exit/i })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/reservation id/i), { target: { value: 'reservation-123' } });
    fireEvent.change(screen.getByLabelText(/vehicle registration number/i), { target: { value: 'KA01AB1234' } });
    fireEvent.click(screen.getByRole('button', { name: /record exit/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/exit recorded/i));
    expect(fetchMock).toHaveBeenCalledWith('/api/tracking/exit', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer attendant-token' }),
    }));
  });

});