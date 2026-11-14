import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import SandboxCard from './SandboxCard.jsx';
import { Activity, CreditCard, Users, ScrollText, IndianRupee, RefreshCw, XCircle, CheckCircle2 } from 'lucide-react';

function Panel({ title, description, children, action }) {
  return <section className="s2-panel"><div className="s2-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>{children}</section>;
}
function Message({ value }) {
  return value ? <p className={value.ok ? 's2-message good' : 's2-message bad'} role="status">{value.text}</p> : null;
}
function useAction() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null);
  async function run(fn, success) {
    setBusy(true); setMessage(null);
    try { const result = await fn(); setMessage({ ok: true, text: success || result.message || 'Saved successfully.' }); return result; }
    catch (error) { setMessage({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  }
  return { busy, message, setMessage, run };
}

export function PasswordReset({ onBack }) {
  const [identifier, setIdentifier] = useState(''), [otp, setOtp] = useState(''), [password, setPassword] = useState('');
  const [sent, setSent] = useState(false); const action = useAction();
  return <Panel title="Reset password" description="Request a one-time code, then choose a new password.">
    <form className="s2-form" onSubmit={async e => { e.preventDefault(); if (!sent) { await action.run(() => api.requestPasswordReset(identifier), 'If the account exists, a reset code has been sent.'); setSent(true); } else { const result = await action.run(() => api.resetPassword({ identifier, otp, newPassword: password }), 'Password reset. You can now sign in.'); if (result) onBack?.(); } }}>
      <label>Email or phone<input value={identifier} onChange={e => setIdentifier(e.target.value)} required autoComplete="username" /></label>
      {sent && <><label>6-digit code<input value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label><label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={72} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,72}" required /></label></>}
      <Message value={action.message}/><button className="primary" disabled={action.busy}>{action.busy ? 'Please wait…' : sent ? 'Reset password' : 'Send reset code'}</button>
    </form>
  </Panel>;
}

export default function Sprint2Panel({ role, lots = [], refreshLots }) {
  const [reservId, setReservId] = useState(''), [vehicle, setVehicle] = useState('');
  const [paymentToken, setPaymentToken] = useState('tok_visa'), [receipt, setReceipt] = useState(null);
  const publishableKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
  const cardRef = useRef(null);
  const [cardReady, setCardReady] = useState(false);
  const [occupancy, setOccupancy] = useState([]), [attendants, setAttendants] = useState([]), [logs, setLogs] = useState([]);
  const [lotId, setLotId] = useState(lots[0]?._id || ''), [rate, setRate] = useState('30');
  const [peak, setPeak] = useState(false), [startHour, setStartHour] = useState('17'), [endHour, setEndHour] = useState('21'), [multiplier, setMultiplier] = useState('1.5');
  const [attendant, setAttendant] = useState({ name: '', email: '' }), [createdPassword, setCreatedPassword] = useState('');
  const [cancelId, setCancelId] = useState(''), [estimate, setEstimate] = useState(null);
  const action = useAction();
  const admin = role === 'admin';

  useEffect(() => { if (admin) { api.occupancy().then(r => setOccupancy(r.lots || [])).catch(() => {}); api.attendants().then(r => setAttendants(r.attendants || [])).catch(() => {}); api.auditLogs().then(r => setLogs(r.logs || [])).catch(() => {}); } }, [admin]);
  useEffect(() => { if (!lotId && lots[0]?._id) setLotId(lots[0]._id); }, [lots, lotId]);

  return <div className="s2-grid">
    <Panel title="My reservation actions" description="Cancel a future confirmed reservation using its reference.">
      <form className="s2-form" onSubmit={e => { e.preventDefault(); action.run(() => api.cancelReservation(cancelId), 'Reservation cancelled.'); }}>
        <label>Reservation reference<input value={cancelId} onChange={e => setCancelId(e.target.value)} required /></label>
        <Message value={action.message}/><button className="secondary" disabled={action.busy}>Cancel reservation</button>
      </form>
    </Panel>
    <Panel title="Payment and receipt" description="Complete a test-mode payment for a completed reservation.">
      <form className="s2-form" onSubmit={async e => { e.preventDefault(); const r = await action.run(async () => api.charge({ reservationId: reservId, paymentToken: publishableKey ? await cardRef.current.createToken() : paymentToken }), 'Payment processed.'); if (r) { setReceipt(r); cardRef.current?.clear(); } }}>
        <label>Reservation reference<input value={reservId} onChange={e => setReservId(e.target.value)} required /></label>
        {publishableKey ? <SandboxCard ref={cardRef} publishableKey={publishableKey} onReady={setCardReady} /> : <label>Sandbox payment token<input value={paymentToken} onChange={e => setPaymentToken(e.target.value)} required /></label>}
        <Message value={action.message}/><button className="primary" disabled={action.busy || (Boolean(publishableKey) && !cardReady)}><CreditCard size={16}/> Pay securely</button>
      </form>
      {receipt && <div className="s2-receipt"><CheckCircle2 size={18}/><div><strong>Payment receipt</strong><span>Receipt: {receipt.receiptId || 'Confirmed'} · Balance due: {receipt.balanceDue ?? 0}</span></div></div>}
    </Panel>
    <Panel title="Public availability board" description="Live availability snapshot from the parking search API." action={<button className="secondary" onClick={refreshLots}><RefreshCw size={14}/> Refresh</button>}>
      <div className="s2-table"><div className="s2-row head"><span>Parking lot</span><span>Available</span><span>Total</span><span>Hourly rate</span></div>
      {lots.map(l => <div className="s2-row" key={l._id}><span>{l.name} · {l.city}</span><strong>{l.availableSlots ?? '—'}</strong><span>{l.totalSlots ?? '—'}</span><span>{l.hourlyRate != null ? '₹'+l.hourlyRate : '—'}</span></div>)}
      {!lots.length && <p className="muted">No lots are currently listed.</p>}</div>
    </Panel>
    <Panel title="Accessibility preferences" description="Adjust visual presentation for this session.">
      <div className="s2-actions"><button className="secondary" onClick={() => document.documentElement.classList.toggle('large-text')}>Toggle larger text</button><button className="secondary" onClick={() => document.documentElement.classList.toggle('high-contrast')}>Toggle high contrast</button></div>
      <p className="muted">Use your browser or operating-system zoom for additional scaling.</p>
    </Panel>
    {admin && <>
      <Panel title="Occupancy dashboard" description="Current slot counts by parking lot." action={<button className="secondary" onClick={() => api.occupancy().then(r => setOccupancy(r.lots || [])).catch(e => action.setMessage({ok:false,text:e.message}))}><RefreshCw size={14}/> Refresh</button>}>
        <div className="s2-table"><div className="s2-row head"><span>Lot</span><span>Available</span><span>Occupied</span><span>Maintenance</span></div>{occupancy.map(o => <div className="s2-row" key={o.lotId}><span>{o.name}</span><strong>{o.available}</strong><span>{o.occupied}</span><span>{o.maintenance}</span></div>)}</div>
      </Panel>
      <Panel title="Pricing configuration" description="Set base hourly rates and optional peak-hour multipliers.">
        <form className="s2-form" onSubmit={e => {e.preventDefault(); action.run(() => api.setPricing(lotId,{hourlyRate:Number(rate),peakPricing:{enabled:peak,startHour:Number(startHour),endHour:Number(endHour),multiplier:Number(multiplier)}}),'Pricing saved.');}}>
          <label>Parking lot<select value={lotId} onChange={e=>setLotId(e.target.value)} required><option value="">Choose lot</option>{lots.map(l=><option key={l._id} value={l._id}>{l.name}</option>)}</select></label>
          <label>Hourly rate (₹)<input type="number" min="0.01" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} required/></label>
          <label className="s2-check"><input type="checkbox" checked={peak} onChange={e=>setPeak(e.target.checked)}/> Enable peak pricing</label>
          {peak && <div className="s2-inline"><label>Start hour UTC<input type="number" min="0" max="23" value={startHour} onChange={e=>setStartHour(e.target.value)}/></label><label>End hour UTC<input type="number" min="0" max="23" value={endHour} onChange={e=>setEndHour(e.target.value)}/></label><label>Multiplier<input type="number" min="1" max="10" step=".1" value={multiplier} onChange={e=>setMultiplier(e.target.value)}/></label></div>}
          <Message value={action.message}/><button className="primary" disabled={action.busy || !lotId}><IndianRupee size={15}/> Save pricing</button>
        </form>
        {lotId && <form className="s2-form s2-estimate" onSubmit={async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const r=await action.run(()=>api.feeEstimate(lotId,new Date(fd.get('from')).toISOString(),new Date(fd.get('to')).toISOString()),'Fee estimate loaded.');if(r)setEstimate(r);}}>
          <strong>Fee estimate</strong><label>Start<input name="from" type="datetime-local" required/></label><label>End<input name="to" type="datetime-local" required/></label><button className="secondary">Estimate fee</button>{estimate && <p>Estimated fee: ₹{estimate.estimatedFee ?? estimate.fee ?? JSON.stringify(estimate)}</p>}
        </form>}
      </Panel>
      <Panel title="Attendant accounts" description="Create and review active attendant accounts.">
        <form className="s2-form" onSubmit={async e=>{e.preventDefault();const r=await action.run(()=>api.createAttendant(attendant),'Attendant account created.');if(r){setCreatedPassword(r.temporaryPassword || '');setAttendant({name:'',email:''});api.attendants().then(x=>setAttendants(x.attendants||[]));}}}>
          <label>Name<input value={attendant.name} onChange={e=>setAttendant({...attendant,name:e.target.value})} required/></label><label>Email<input type="email" value={attendant.email} onChange={e=>setAttendant({...attendant,email:e.target.value})} required/></label>
          <Message value={action.message}/><button className="primary" disabled={action.busy}><Users size={16}/> Create attendant</button>
        </form>
        {createdPassword && <p className="s2-message good">Temporary password (show once): <strong>{createdPassword}</strong></p>}
        <ul className="s2-list">{attendants.map(a=><li key={a._id}>{a.name} · {a.email || a.phone}</li>)}</ul>
      </Panel>
      <Panel title="Admin audit trail" description="Recent administrative events. Sensitive request bodies and credentials are not displayed.">
        <div className="s2-table">{logs.map((log,i)=><div className="s2-row" key={log._id || i}><span>{log.action || log.event || 'Admin action'}</span><span>{log.actor?.name || 'Admin'}</span><span>{log.occurredAt ? new Date(log.occurredAt).toLocaleString() : '—'}</span></div>)}{!logs.length && <p className="muted">No audit events returned.</p>}</div>
      </Panel>
    </>}
  </div>;
}
