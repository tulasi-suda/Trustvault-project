// Express application setup with security middlewares, CORS, and routing
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const documentRoutes = require('./routes/documents');

const app = express();

// Trust reverse proxy (e.g. Render, NGINX)
app.set('trust proxy', 1);

// Allowed origins configuration
function getAllowedOrigins() {
  const allowed = [];
  if (process.env.CLIENT_URL) {
    const urls = process.env.CLIENT_URL.split(',').map(u => u.trim()).filter(Boolean);
    allowed.push(...urls);
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    allowed.push(process.env.RENDER_EXTERNAL_URL.trim());
  }
  return allowed;
}

// Strict CORS middleware: disallowed origins receive a clean 403 JSON, never unhandled error
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin requests where origin header is absent
    if (!origin) {
      return callback(null, true);
    }
    const allowed = getAllowedOrigins();
    // In development with no CLIENT_URL configured, allow localhost
    if (allowed.length === 0 && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    const corsError = new Error('Not allowed by CORS');
    corsError.status = 403;
    return callback(corsError);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount modular API routers
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/documents', documentRoutes);

// Custom CORS error handler ensuring clean 403 JSON
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS' || err.status === 403) {
    return res.status(403).json({ error: 'Origin not allowed by CORS' });
  }
  next(err);
});

module.exports = app;
