// Application entry point: starts server and serves frontend in production
const path = require('path');
const express = require('express');
const app = require('./app');

const PORT = parseInt(process.env.PORT || '5000', 10);

// In production, Express serves frontend/dist and returns index.html for non-/api routes
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handler for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handler: never leak stack traces
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TrustVault server running on port ${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
  });
}

module.exports = app;
