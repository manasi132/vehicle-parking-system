// Production delivery is intentionally injected by the host application.
// This model is not used to persist OTPs; the OTP hash and expiry live on User.
module.exports = {
  async send({ user, otp }) {
    if (process.env.NODE_ENV === 'production') {
      if (typeof global.passwordResetOtpDelivery !== 'function') {
        throw new Error('Configure global.passwordResetOtpDelivery with an email/SMS provider before production use.');
      }
      return global.passwordResetOtpDelivery({ user, otp });
    }
    console.info('[DEV PASSWORD RESET OTP]', { userId: String(user._id), otp });
  }
};
