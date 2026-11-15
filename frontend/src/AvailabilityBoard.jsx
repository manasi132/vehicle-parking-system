import { useEffect, useState } from 'react';
import { api, API_BASE_URL } from './api.js';

/** Public lot-entrance board, refreshed whenever a slot update arrives. */
export default function AvailabilityBoard() {
  const [lots, setLots] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await api.lots();
        if (active) { setLots(result.lots || []); setError(''); }
      } catch { if (active) setError('Unable to load availability.'); }
    }
    refresh();
    const events = new EventSource(API_BASE_URL + '/api/tracking/board/events');
    events.addEventListener('slot:update', refresh);
    return () => { active = false; events.close(); };
  }, []);
  return <main className="content"><h1>Parking availability</h1>
    {error && <p role="alert">{error}</p>}
    {lots.map(lot => <section key={lot._id}><h2>{lot.name}</h2><p>{lot.availableSlots} available</p></section>)}
    {!error && lots.length === 0 && <p>No parking lots are currently available.</p>}
  </main>;
}
