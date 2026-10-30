async function sendPasswordResetOtp({ user, otp }) {
  if (typeof global.passwordResetOtpDelivery === 'function') {
    return global.passwordResetOtpDelivery({ user, otp });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Password reset delivery provider is not configured.');
  }
  // Development/test adapter. The API response never contains the OTP.
  console.info('[DEV PASSWORD RESET OTP]', { userId: String(user._id), otp });
}

module.exports = { sendPasswordResetOtp };
