require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
function getArg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function main() {
  const email = getArg('--email');
  const role = getArg('--role');
  if (!email || !['driver', 'attendant', 'admin'].includes(role)) throw new Error('Usage: npm run set-role -- --email user@example.com --role admin|attendant|driver');
  await connectDB();
  try {
    const user = await User.findOneAndUpdate({ email: email.trim().toLowerCase() }, { $set: { role } }, { new: true, runValidators: true }).select('_id name email role');
    if (!user) throw new Error('No user found for that email. Register the account first.');
    console.log('Updated role for ' + user.email + ' to ' + user.role + '.');
    console.log('The user must log in again to receive a token with the updated role.');
  } finally { await mongoose.connection.close(); }
}
main().catch(async (error) => { console.error(error.message); if (mongoose.connection.readyState !== 0) await mongoose.connection.close(); process.exitCode = 1; });
