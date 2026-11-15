// Development delivery adapter shared by reservation events and OTP. Do not log contact details.
async function deliverNotification(message) {
  if (typeof global.vpsNotificationDelivery === 'function') return global.vpsNotificationDelivery(message);
  if (message.type === 'PASSWORD_RESET_OTP') {
    if (typeof global.passwordResetOtpDelivery === 'function') return global.passwordResetOtpDelivery({ user: message.user, otp: message.otp });
    if (process.env.NODE_ENV === 'production') throw new Error('Password reset delivery provider is not configured.');
    console.info('[DEV PASSWORD RESET OTP]', { userId: String(message.user._id), otp: message.otp });
    return;
  }
  // Stub is intentionally limited to non-PII event metadata.
  const text = { BOOKING: 'Your parking reservation is confirmed.', ENTRY: 'Your vehicle entry was recorded.', EXIT: 'Your vehicle exit was recorded.', PAYMENT: 'Your parking payment was received.' };
  console.info('[NOTIFICATION]', { type: message.type, userId: message.userId, reservationId: message.reservationId, message: text[message.type] || 'Parking status updated.' });
}

async function notifyReservation(type, reservation) {
  try {
    await deliverNotification({ type, userId: String(reservation.user), reservationId: String(reservation._id) });
  } catch {
    // Event delivery must not roll back a completed booking, gate action or charge.
    console.error('Reservation notification delivery failed.');
  }
}
module.exports = { deliverNotification, notifyReservation };
