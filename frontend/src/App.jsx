import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, CarFront, CheckCircle2, LayoutDashboard,
  LogOut, MapPin, ParkingCircle, RefreshCw, Search, ShieldCheck, UserRound, XCircle
} from 'lucide-react';
import { api, clearSession, readSession, saveSession } from './api.js';

const NAV = [
  { id: 'book', label: 'Find parking', icon: Search, roles: ['driver', 'admin'] },
  { id: 'gate', label: 'Gate kiosk', icon: CarFront, roles: ['attendant', 'admin'] },
  { id: 'admin', label: 'Manage lots', icon: LayoutDashboard, roles: ['admin'] },
];

function Notice({ notice, clear }) {
  if (!notice) return null;
  const Icon = notice.type === 'success' ? CheckCircle2 : XCircle;
  return (
    <div role="alert" className={'notice ' + notice.type}>
      <Icon size={18} />
      <span>{notice.text}</span>
      <button type="button" aria-label="Dismiss notification" onClick={clear}><XCircle size={16} /></button>
    </div>
  );
}

function AuthScreen({ onAuthenticated, setNotice }) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const isRegister = mode === 'register';
  const change = (field) => (event) => setForm((old) => ({ ...old, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (isRegister) {
        await api.register({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          password: form.password,
        });
        setNotice({ type: 'success', text: 'Account created. Sign in with your credentials.' });
        setMode('login');
        setForm((old) => ({ ...old, password: '' }));
      } else {
        const session = await api.login({
          identifier: form.email.trim() || form.phone.trim(),
          password: form.password,
        });
        saveSession(session);
        onAuthenticated(session);
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-promo">
        <div className="brand"><span className="brand-mark"><ParkingCircle size={25} /></span><span>Parkwise<span className="brand-dot">.</span></span></div>
        <div className="promo-copy">
          <span className="eyebrow">VEHICLE PARKING SYSTEM</span>
          <h1>Your next spot is <em>closer</em> than you think.</h1>
          <p>Find available parking, reserve with confidence, and get on with your day.</p>
        </div>
        <div className="promo-metrics">
          <div><strong>Find</strong><span>Nearby parking</span></div>
          <div><strong>Reserve</strong><span>Before you arrive</span></div>
          <div><strong>Go</strong><span>Without the wait</span></div>
        </div>
        <div className="promo-bottom"><ShieldCheck size={16} /> Secure access · Role-aware workspace</div>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <div className="auth-heading">
            <span className="eyebrow">{isRegister ? 'GET STARTED' : 'WELCOME BACK'}</span>
            <h2>{isRegister ? 'Create your account' : 'Sign in to Parkwise'}</h2>
            <p>{isRegister ? 'A smarter parking experience starts here.' : 'Enter your details to continue to your workspace.'}</p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
          <form onSubmit={submit} className="form-stack">
            {isRegister && <label>Full name
              <input autoComplete="name" minLength={2} maxLength={80} required value={form.name} onChange={change('name')} placeholder="e.g. Meghana B" />
            </label>}
            <label>{isRegister ? 'Email address' : 'Email or phone number'}
              <input
                type={isRegister && form.phone && !form.email ? 'text' : 'text'}
                autoComplete={isRegister ? 'email' : 'username'}
                value={form.email}
                onChange={change('email')}
                placeholder={isRegister ? 'you@example.com' : 'you@example.com or +91…'}
                required={!isRegister || !form.phone}
              />
            </label>
            {isRegister && <label>Phone number <span className="optional">optional</span>
              <input autoComplete="tel" inputMode="tel" value={form.phone} onChange={change('phone')} placeholder="+91 98765 43210" required={!form.email} />
            </label>}
            {isRegister && <p className="field-hint">Use a valid email or phone number. Passwords must be 8–72 characters and include uppercase, lowercase, a number, and a symbol.</p>}
            <label>Password
              <input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} maxLength={72} required value={form.password} onChange={change('password')} placeholder={isRegister ? 'Create a strong password' : 'Enter your password'} />
            </label>
            <button className="primary full" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-security"><ShieldCheck size={16} /><span>Passwords are hashed by the server. This page never stores your password.</span></div>
        </div>
        <div className="auth-footer">VEHICLE PARKING SYSTEM <span>·</span> SPRINT 1</div>
      </section>
    </div>
  );
}

function Workspace({ session, onLogout, setNotice }) {
  const role = session.user.role || 'driver';
  const [page, setPage] = useState(role === 'attendant' ? 'gate' : 'book');
  const [lots, setLots] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedLot, setSelectedLot] = useState('');
  const [search, setSearch] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [searchLatitude, setSearchLatitude] = useState('');
  const [searchLongitude, setSearchLongitude] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [reserveSlot, setReserveSlot] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [lotForm, setLotForm] = useState({ name: '', address: '', city: '', hourlyRate: '50', latitude: '', longitude: '' });
  const [slotCount, setSlotCount] = useState('10');
  const [slotPrefix, setSlotPrefix] = useState('A');
  const [gateForm, setGateForm] = useState({ reservationId: '', vehicleNumber: '' });
  const [loadingLots, setLoadingLots] = useState(false);
  const visibleNav = NAV.filter((item) => item.roles.includes(role));
  const selected = lots.find((lot) => String(lot._id) === selectedLot);

  function selectedWindow() {
    const start = windowStart ? new Date(windowStart) : null;
    const end = windowEnd ? new Date(windowEnd) : null;
    const validWindow = start && end &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start;
    return validWindow
      ? { startTime: start.toISOString(), endTime: end.toISOString() }
      : {};
  }

  async function loadLots(options = {}) {
    const quiet = options.quiet === true;
    if (!quiet) setLoadingLots(true);

    const filters = { availableOnly: availableOnly ? 'true' : undefined };
    if (search.trim()) filters.location = search.trim();
    if (maxRate !== '') filters.maxRate = maxRate;

    const hasLatitude = searchLatitude.trim() !== '';
    const hasLongitude = searchLongitude.trim() !== '';
    if (hasLatitude && hasLongitude) {
      filters.lat = searchLatitude.trim();
      filters.lng = searchLongitude.trim();
    }

    Object.assign(filters, selectedWindow());

    try {
      const response = await api.lots(filters);
      const items = Array.isArray(response) ? response : (response.lots || response.items || []);
      const range = selectedWindow();
      const withCounts = await Promise.all(items.map(async (lot) => {
        if (Number.isFinite(lot.availableSlots) && Number.isFinite(lot.totalSlots)) {
          return lot;
        }
        // Compatibility fallback while the team's backend branches are being integrated.
        try {
          const result = await api.lotSlots(lot._id, range);
          const lotSlots = Array.isArray(result) ? result : (result.slots || result.items || []);
          return {
            ...lot,
            availableSlots: lotSlots.filter((slot) => slot.status === 'available' || slot.isAvailable === true).length,
            totalSlots: lotSlots.length
          };
        } catch {
          return { ...lot, availableSlots: null, totalSlots: null };
        }
      }));
      setLots(withCounts);
    } catch (error) {
      if (!quiet) setNotice({ type: 'error', text: error.message });
    } finally {
      if (!quiet) setLoadingLots(false);
    }
  }

  async function loadSlots(lotId, range = {}, options = {}) {
    if (!lotId) { setSlots([]); return; }
    try {
      const result = await api.lotSlots(lotId, range);
      const items = Array.isArray(result) ? result : (result.slots || result.items || []);
      setSlots(items);
    } catch (error) {
      if (!options.quiet) {
        setSlots([]);
        setNotice({ type: 'error', text: error.message });
      }
    }
  }

  // Keep availability current while the parking page is open. The API returns
  // counts for the selected time window, so polling also refreshes the selected slot grid.
  useEffect(() => {
    const refresh = (quiet = false) => {
      loadLots({ quiet });
      if (page === 'book' && selectedLot) {
        loadSlots(selectedLot, selectedWindow(), { quiet });
      }
    };
    refresh(false);
    const timer = window.setInterval(() => {
      if (page === 'book' && document.visibilityState !== 'hidden') refresh(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [
    page, selectedLot, search, maxRate, availableOnly,
    searchLatitude, searchLongitude, windowStart, windowEnd
  ]);

  const visibleLots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lots.filter((lot) => {
      const matchesText = !needle || [lot.name, lot.address, lot.city].some((value) => String(value || '').toLowerCase().includes(needle));
      const rate = Number(lot.hourlyRate ?? lot.hourly_rate ?? NaN);
      const matchesRate = !maxRate || (Number.isFinite(rate) && rate <= Number(maxRate));
      const matchesAvailability = !availableOnly || lot.availableSlots === null || lot.availableSlots > 0;
      return matchesText && matchesRate && matchesAvailability;
    });
  }, [lots, search, maxRate, availableOnly]);

  async function reserve() {
    if (!reserveSlot || !windowStart || !windowEnd) {
      setNotice({ type: 'error', text: 'Choose an available slot and both start and end times.' });
      return;
    }
    if (!vehicleRegistration.trim()) {
      setNotice({ type: 'error', text: 'Enter the vehicle registration that will use this reservation.' });
      return;
    }
    if (new Date(windowEnd) <= new Date(windowStart)) {
      setNotice({ type: 'error', text: 'End time must be after start time.' });
      return;
    }
    setBusy(true);
    try {
      const result = await api.reserve({ slotId: reserveSlot, startTime: new Date(windowStart).toISOString(), endTime: new Date(windowEnd).toISOString(), vehicleRegistration: vehicleRegistration.trim().toUpperCase() });
      setNotice({ type: 'success', text: 'Reservation confirmed. Reference: ' + (result.reservationId || (result.reservation && result.reservation._id) || 'created') });
      setVehicleRegistration('');
      await loadSlots(selectedLot, { startTime: new Date(windowStart).toISOString(), endTime: new Date(windowEnd).toISOString() });
      await loadLots();
    } catch (error) {
      setNotice({ type: 'error', text: error.status === 409 ? 'That slot was just booked. Please choose another.' : error.message });
    } finally {
      setBusy(false);
    }
  }

  async function createLot(event) {
    event.preventDefault();
    const hasLatitude = lotForm.latitude.trim() !== '';
    const hasLongitude = lotForm.longitude.trim() !== '';
    if (hasLatitude !== hasLongitude) {
      setNotice({ type: 'error', text: 'Provide both latitude and longitude, or leave both blank.' });
      return;
    }
    if (!Number.isFinite(Number(lotForm.hourlyRate)) || Number(lotForm.hourlyRate) < 0) {
      setNotice({ type: 'error', text: 'Enter a valid non-negative hourly rate.' });
      return;
    }

    const payload = {
      name: lotForm.name.trim(),
      address: lotForm.address.trim(),
      city: lotForm.city.trim(),
      hourlyRate: Number(lotForm.hourlyRate),
    };
    if (hasLatitude && hasLongitude) {
      payload.latitude = Number(lotForm.latitude);
      payload.longitude = Number(lotForm.longitude);
    }

    setBusy(true);
    try {
      await api.createLot(payload);
      setNotice({ type: 'success', text: 'Parking lot created.' });
      setLotForm({ name: '', address: '', city: '', hourlyRate: '50', latitude: '', longitude: '' });
      await loadLots();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function bulkSlots(event) {
    event.preventDefault();
    if (!selectedLot) return;
    setBusy(true);
    try {
      const result = await api.bulkSlots(selectedLot, { count: Number(slotCount), prefix: slotPrefix });
      setNotice({ type: 'success', text: (result.count || slotCount) + ' slots created.' });
      await loadSlots(selectedLot);
      await loadLots();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function gateAction(event, action) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = action === 'entry' ? await api.gateEntry(gateForm) : await api.gateExit(gateForm);
      setNotice({ type: 'success', text: result.message || ('Vehicle ' + action + ' recorded.') });
      setGateForm({ reservationId: '', vehicleNumber: '' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand sidebar-brand" href="#top" onClick={(event) => event.preventDefault()}><span className="brand-mark"><ParkingCircle size={23} /></span><span>Parkwise<span className="brand-dot">.</span></span></a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {visibleNav.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <span className="avatar"><UserRound size={17} /></span>
          <div><strong>{session.user.name || 'VPS user'}</strong><span>{role}</span></div>
          <button className="icon-button" aria-label="Sign out" onClick={onLogout}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div><span className="eyebrow">VEHICLE PARKING SYSTEM</span><h1>{page === 'book' ? 'Find your parking spot' : page === 'gate' ? 'Gate operations' : 'Parking lot management'}</h1></div>
          <div className="topbar-actions"><span className="status-pill"><span /> API workspace</span><button className="icon-button" aria-label="Refresh parking lots" onClick={loadLots}><RefreshCw size={17} /></button></div>
        </header>

        {page === 'book' && <section className="content">
          <div className="page-intro"><div><h2>Parking, made simple.</h2><p>Search lots, review the slots, then reserve a time window.</p></div><div className="intro-icon"><ParkingCircle size={28} /></div></div>
          <div className="search-panel">
            <label className="search-input"><Search size={18} /><input aria-label="Search parking lots" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by lot, address or city" /></label>
            <label className="rate-input">Max hourly rate <input aria-label="Maximum hourly rate" type="number" min="0" value={maxRate} onChange={(event) => setMaxRate(event.target.value)} placeholder="Any" /></label>
            <label className="rate-input">Your latitude <input aria-label="Search latitude" type="number" min="-90" max="90" step="any" value={searchLatitude} onChange={(event) => setSearchLatitude(event.target.value)} placeholder="Optional" /></label>
            <label className="rate-input">Your longitude <input aria-label="Search longitude" type="number" min="-180" max="180" step="any" value={searchLongitude} onChange={(event) => setSearchLongitude(event.target.value)} placeholder="Optional" /></label>
            <label className="check-input"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available only</label>
            {(searchLatitude.trim() !== '') !== (searchLongitude.trim() !== '') && <p className="field-hint">Enter both coordinates to sort by distance.</p>}
          </div>
          <div className="section-heading"><div><h3>Parking lots</h3><p>{visibleLots.length} locations in your results</p></div><button className="secondary" onClick={loadLots}><RefreshCw size={15} /> Refresh</button></div>
          {loadingLots && <p className="muted">Loading parking lots and availability…</p>}
          {!loadingLots && visibleLots.length === 0 && <div className="empty-state"><MapPin size={26} /><strong>No parking lots found</strong><span>Try another search or clear the filters. If the rate filter is set, the API must provide an hourly rate for a lot to match it.</span></div>}
          <div className="lot-grid">
            {visibleLots.map((lot) => <article key={lot._id} className={String(selectedLot) === String(lot._id) ? 'lot-card selected' : 'lot-card'}>
              <div className="lot-card-top"><span className="lot-icon"><ParkingCircle size={21} /></span><span className="available-tag"><span />{lot.availableSlots === null ? 'Count unavailable' : lot.availableSlots + ' free'}</span></div>
              <h3>{lot.name}</h3><p className="lot-address"><MapPin size={14} />{lot.address}{lot.city ? ', ' + lot.city : ''}</p>
              <div className="lot-card-bottom"><div><span className="muted">Hourly rate</span><strong>{(lot.hourlyRate ?? lot.hourly_rate) != null ? '₹' + (lot.hourlyRate ?? lot.hourly_rate) : 'Not configured'}</strong></div>
                <button className="secondary" onClick={() => setSelectedLot(String(lot._id))}>{String(selectedLot) === String(lot._id) ? 'Selected' : 'View slots'} <ArrowRight size={15} /></button>
              </div>
            </article>)}
          </div>
          {selected && <section className="booking-panel">
            <div className="section-heading"><div><span className="eyebrow">SELECTED LOCATION</span><h3>{selected.name} · Choose a slot</h3></div><button className="icon-button" aria-label="Close booking panel" onClick={() => { setSelectedLot(''); setReserveSlot(''); }}><XCircle size={17} /></button></div>
            <div className="slot-grid">{slots.map((slot) => <button key={slot._id} disabled={slot.status !== 'available'} aria-pressed={reserveSlot === slot._id} className={'slot-tile ' + slot.status + (reserveSlot === slot._id ? ' chosen' : '')} onClick={() => setReserveSlot(slot._id)}><span>{slot.slotNumber}</span><small>{slot.status}</small></button>)}</div>
            {slots.length === 0 && <p className="muted">No slots were returned for this lot.</p>}
            <div className="booking-form">
              <label>Start time<input aria-label="Reservation start time" type="datetime-local" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} required /></label>
              <label>End time<input aria-label="Reservation end time" type="datetime-local" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} required /></label>
              <label>Vehicle registration<input aria-label="Booking vehicle registration" value={vehicleRegistration} onChange={(event) => setVehicleRegistration(event.target.value.toUpperCase())} maxLength={20} required placeholder="e.g. KA01AB1234" /></label>
              <button className="primary" disabled={busy} onClick={reserve}>Reserve selected slot <ArrowRight size={16} /></button>
            </div>
          </section>}
        </section>}

        {page === 'gate' && <section className="content gate-content">
          <div className="page-intro"><div><h2>Gate kiosk</h2><p>Record vehicle arrival and departure against a reservation.</p></div><div className="intro-icon"><CarFront size={28} /></div></div>
          <form className="gate-card" onSubmit={(event) => gateAction(event, 'entry')}>
            <div className="section-heading"><div><h3>Vehicle details</h3><p>Use a reservation reference and vehicle registration.</p></div><span className="kiosk-badge"><Activity size={14} /> Attendant mode</span></div>
            <label>Reservation ID<input value={gateForm.reservationId} onChange={(event) => setGateForm({ ...gateForm, reservationId: event.target.value })} required placeholder="Enter reservation reference" /></label>
            <label>Vehicle registration number<input value={gateForm.vehicleNumber} onChange={(event) => setGateForm({ ...gateForm, vehicleNumber: event.target.value.toUpperCase() })} required placeholder="e.g. KA01AB1234" /></label>
            <div className="gate-actions"><button className="primary entry-button" type="submit" disabled={busy}><ArrowDownToLine size={18} /> Record entry</button><button className="secondary exit-button" type="button" disabled={busy} onClick={(event) => gateAction(event, 'exit')}><LogOut size={17} /> Record exit</button></div>
            <p className="field-hint">The API must validate the reservation and attendant/admin role. A rejected entry is shown as an error, not a success.</p>
          </form>
        </section>}

        {page === 'admin' && role === 'admin' && <section className="content">
          <div className="page-intro"><div><h2>Manage parking capacity.</h2><p>Create lots and seed their slots for drivers to reserve.</p></div><div className="intro-icon"><LayoutDashboard size={28} /></div></div>
          <form className="admin-card" onSubmit={createLot}>
            <h3>Create a parking lot</h3>
            <div className="form-row">
              <label>Lot name<input required minLength={2} value={lotForm.name} onChange={(event) => setLotForm({ ...lotForm, name: event.target.value })} placeholder="Central Parking" /></label>
              <label>City<input required minLength={2} value={lotForm.city} onChange={(event) => setLotForm({ ...lotForm, city: event.target.value })} placeholder="Bengaluru" /></label>
            </div>
            <label>Address<input required minLength={3} value={lotForm.address} onChange={(event) => setLotForm({ ...lotForm, address: event.target.value })} placeholder="Street and area" /></label>
            <label>Hourly rate (₹/hour)<input aria-label="Lot hourly rate" required type="number" min="0" step="0.01" value={lotForm.hourlyRate} onChange={(event) => setLotForm({ ...lotForm, hourlyRate: event.target.value })} placeholder="50" /></label>
            <div className="form-row">
              <label>Latitude <span className="optional">optional</span><input aria-label="Lot latitude" type="number" min="-90" max="90" step="any" value={lotForm.latitude} onChange={(event) => setLotForm({ ...lotForm, latitude: event.target.value })} placeholder="12.9716" /></label>
              <label>Longitude <span className="optional">optional</span><input aria-label="Lot longitude" type="number" min="-180" max="180" step="any" value={lotForm.longitude} onChange={(event) => setLotForm({ ...lotForm, longitude: event.target.value })} placeholder="77.5946" /></label>
            </div>
            <p className="field-hint">Add both coordinates to enable distance-based search sorting.</p>
            <button className="primary" disabled={busy}>Create lot <ArrowRight size={16} /></button>
          </form>
          <form className="admin-card" onSubmit={bulkSlots}><h3>Bulk-create slots</h3><label>Target lot<select value={selectedLot} onChange={(event) => setSelectedLot(event.target.value)} required><option value="">Choose a lot</option>{lots.map((lot) => <option key={lot._id} value={lot._id}>{lot.name}</option>)}</select></label><div className="form-row"><label>Prefix<input value={slotPrefix} onChange={(event) => setSlotPrefix(event.target.value)} maxLength={10} required /></label><label>Number of slots<input type="number" min="1" max="500" value={slotCount} onChange={(event) => setSlotCount(event.target.value)} required /></label></div><button className="primary" disabled={busy || !selectedLot}>Create slots <ArrowRight size={16} /></button></form>
        </section>}
        <footer className="page-footer"><span><ShieldCheck size={15} /> Role-based navigation enabled</span><span>VPS · Sprint 1</span></footer>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => readSession());
  const [notice, setNotice] = useState(null);
  function logout() {
    clearSession();
    setSession(null);
    setNotice({ type: 'success', text: 'You have signed out.' });
  }
  return <><Notice notice={notice} clear={() => setNotice(null)} />{session ? <Workspace session={session} onLogout={logout} setNotice={setNotice} /> : <AuthScreen onAuthenticated={setSession} setNotice={setNotice} />}</>;
}