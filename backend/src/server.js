require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const port = Number(process.env.PORT) || 4000;

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env.');
  }

  await connectDB();
  const server = app.listen(port, () => {
    console.log('VPS API listening on port ' + port);
  });

  const shutdown = () => {
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Unable to start VPS API:', error.message);
  process.exit(1);
});
