const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const lotRoutes = require('./routes/lotRoutes');
const slotRoutes = require('./routes/slotRoutes');
const trackingRoutes = require('./routes/trackingRoutes');

const app = express();
const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10kb' }));
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/tracking', trackingRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

app.use((error, _req, res, _next) => {
  if (error && ['SLOT_LOCK_TIMEOUT', 'SLOT_LOCK_LOST'].includes(error.code)) {
    return res.status(503).json({ message: 'This parking slot is busy. Refresh availability and retry.' });
  }
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON.' });
  }
  if (error && error.message === 'Origin is not allowed by CORS.') {
    return res.status(403).json({ message: 'This origin is not allowed.' });
  }
  if (error && error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Submitted fields are invalid.' });
  }
  console.error(error);
  return res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
