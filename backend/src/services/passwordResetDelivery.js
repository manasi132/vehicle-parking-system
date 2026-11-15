const DELIVERY_TIMEOUT_MS = 8000;

/**
 * Send the OTP through an injected provider or a configured HTTPS delivery
 * webhook. The webhook is an adapter contract for an approved email/SMS relay:
 * POST { event, userId, channel, destination, otp, expiresInMinutes } with
 * Bearer authentication. Never log the request body or provider response.
 */
async function sendPasswordResetOtp({ user, otp }) {
  if (typeof global.passwordResetOtpDelivery === 'function') {
    return global.passwordResetOtpDelivery({ user, otp });
  }

  if (process.env.NODE_ENV !== 'production') {
    // Development/test adapter. The API response never contains the OTP.
    console.info('[DEV PASSWORD RESET OTP]', { userId: String(user._id), otp });
    return;
  }

  const endpoint = process.env.PASSWORD_RESET_DELIVERY_URL;
  const token = process.env.PASSWORD_RESET_DELIVERY_TOKEN;
  if (!endpoint || !token) {
    throw new Error('Password reset delivery provider is not configured.');
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Password reset delivery endpoint is invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Password reset delivery endpoint must use HTTPS.');
  }

  const channel = user.email ? 'email' : 'sms';
  const destination = user.email || user.phone;
  if (!destination) throw new Error('Password reset user has no deliverable contact.');

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({
        event: 'password_reset_otp',
        userId: String(user._id),
        channel,
        destination,
        otp,
        expiresInMinutes: 10
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      redirect: 'error'
    });
  } catch {
    throw new Error('Password reset delivery provider is unavailable.');
  }

  if (!response.ok) {
    throw new Error('Password reset delivery provider rejected the request.');
  }
}

module.exports = { sendPasswordResetOtp };
