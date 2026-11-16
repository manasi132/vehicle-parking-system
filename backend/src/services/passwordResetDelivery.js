const { deliverNotification } = require('./notifications');
async function sendPasswordResetOtp({ user, otp }) { return deliverNotification({ type: 'PASSWORD_RESET_OTP', user, otp }); }

module.exports = { sendPasswordResetOtp };
