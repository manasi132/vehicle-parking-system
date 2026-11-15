const crypto = require('node:crypto');
const Notification = require('../models/Notification');
const Reservation = require('../models/Reservation');
const LEASE_MS = 30000;

// Development delivery adapter shared by reservation events and OTP. Do not log contact details.
async function deliverNotification(message) {
  if (typeof global.vpsNotificationDelivery === 'function') return global.vpsNotificationDelivery(message);
  if (message.type === 'PASSWORD_RESET_OTP') {
    if (typeof global.passwordResetOtpDelivery === 'function') return global.passwordResetOtpDelivery({ user: message.user, otp: message.otp });
    if (process.env.NODE_ENV === 'production') {
      const endpoint = process.env.PASSWORD_RESET_DELIVERY_URL, token = process.env.PASSWORD_RESET_DELIVERY_TOKEN;
      if (!endpoint || !token) throw new Error('Password reset delivery provider is not configured.');
      let url;
      try { url = new URL(endpoint); } catch { throw new Error('Password reset delivery endpoint is invalid.'); }
      if (url.protocol !== 'https:') throw new Error('Password reset delivery endpoint must use HTTPS.');
      const channel = message.user.email ? 'email' : 'sms', destination = message.user.email || message.user.phone;
      if (!destination) throw new Error('Password reset user has no deliverable contact.');
      let response;
      try {
        response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ event: 'password_reset_otp', userId: String(message.user._id), channel, destination, otp: message.otp, expiresInMinutes: 10 }),
          signal: AbortSignal.timeout(8000), redirect: 'error' });
      } catch { throw new Error('Password reset delivery provider is unavailable.'); }
      if (!response.ok) throw new Error('Password reset delivery provider rejected the request.');
      return;
    }
    console.info('[DEV PASSWORD RESET OTP]', { userId: String(message.user._id), otp: message.otp });
    return;
  }
  // Stub is intentionally limited to non-PII event metadata.
  const text = { BOOKING: 'Your parking reservation is confirmed.', ENTRY: 'Your vehicle entry was recorded.', EXIT: 'Your vehicle exit was recorded.', PAYMENT: 'Your parking payment was received.' };
  console.info('[NOTIFICATION]', { type: message.type, userId: message.userId, reservationId: message.reservationId, message: text[message.type] || 'Parking status updated.' });
}

async function dispatchNotification(id) {
  const now = new Date(), owner = crypto.randomUUID();
  const event = await Notification.findOneAndUpdate({ _id: id, nextAttemptAt: { $lte: now },
    $or: [{ state: 'pending' }, { state: 'sending', leaseUntil: { $lte: now } }] },
  { $set: { state: 'sending', leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } }, { new: true }).lean();
  if (!event) return;
  try {
    let timeout;
    try {
      await Promise.race([
        deliverNotification({ type: event.type, userId: event.userId, reservationId: event.reservationId, idempotencyKey: event._id }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Notification delivery timed out.')), 8000); timeout.unref(); })
      ]);
    } finally { clearTimeout(timeout); }
    await Notification.updateOne({ _id: id, state: 'sending', leaseOwner: owner },
      { $set: { state: 'delivered', deliveredAt: new Date(), leaseUntil: null, leaseOwner: null } });
  } catch {
    const delay = Math.min(60000, 1000 * 2 ** Math.min(event.attempts - 1, 6));
    await Notification.updateOne({ _id: id, state: 'sending', leaseOwner: owner },
      { $set: { state: 'pending', nextAttemptAt: new Date(Date.now() + delay), leaseUntil: null, leaseOwner: null } });
  }
}

async function notifyReservation(type, reservation) {
  const reservationId = String(reservation._id), id = `${type}:${reservationId}`;
  try {
    await Notification.updateOne({ _id: id }, { $setOnInsert: { type, userId: String(reservation.user), reservationId, state: 'pending', nextAttemptAt: new Date() } }, { upsert: true });
    // Production delivery is handled in bounded worker batches. Tests dispatch
    // promptly so callers can exercise the retry and idempotency behavior.
    if (process.env.NODE_ENV === 'test') setImmediate(() => dispatchNotification(id).catch(() => console.error('Notification dispatch failed.')));
    return true;
  } catch { console.error('Notification enqueue failed.'); return false; }
}

async function reconcileBookingNotifications(limit = 50) {
  const reservations = await Reservation.find({ pendingNotifications: 'BOOKING' }).select('_id user').limit(limit).lean();
  if (!reservations.length) return;
  // Bulk upserts are idempotent. If any write fails, leave the markers in
  // place; a later pass safely retries every event in the batch.
  const now = new Date();
  await Notification.bulkWrite(reservations.map(reservation => ({ updateOne: {
    filter: { _id: `BOOKING:${reservation._id}` },
    update: { $setOnInsert: { type: 'BOOKING', userId: String(reservation.user), reservationId: String(reservation._id), state: 'pending', nextAttemptAt: now } },
    upsert: true
  } })), { ordered: false, writeConcern: { w: 'majority' } });
  await Reservation.updateMany({ _id: { $in: reservations.map(reservation => reservation._id) } }, { $pull: { pendingNotifications: 'BOOKING' } });
  if (process.env.NODE_ENV === 'test') {
    for (const reservation of reservations) setImmediate(() => dispatchNotification(`BOOKING:${reservation._id}`).catch(() => console.error('Notification dispatch failed.')));
  }
}
function scheduleBookingNotification() {
  if (process.env.NODE_ENV === 'test') setImmediate(() => reconcileBookingNotifications().catch(() => console.error('Notification reconciliation failed.')));
}
async function processPendingNotifications(limit = 50) {
  const now = new Date();
  const events = await Notification.find({ nextAttemptAt: { $lte: now },
    $or: [{ state: 'pending' }, { state: 'sending', leaseUntil: { $lte: now } }] }).sort({ nextAttemptAt: 1 }).limit(limit).select('_id').lean();
  await Promise.all(events.map(event => dispatchNotification(event._id)));
}
function startNotificationWorker(intervalMs = 3000) {
  let running = false;
  let inFlight = Promise.resolve();
  const run = () => {
    if (running) return;
    running = true;
    inFlight = (async () => { try { await reconcileBookingNotifications(); await processPendingNotifications(); } catch { console.error('Notification retry scan failed.'); } finally { running = false; } })();
  };
  const timer = setInterval(run, intervalMs); timer.unref(); void run();
  return async () => { clearInterval(timer); await inFlight; };
}
module.exports = { deliverNotification, notifyReservation, scheduleBookingNotification, reconcileBookingNotifications, dispatchNotification, processPendingNotifications, startNotificationWorker };
