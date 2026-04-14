const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const { globalLimiter, writeLimiter } = require('./middleware/rateLimiter');

// Import routes
const apiRoutes = require('./routes');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Session middleware — kept for Google OAuth callback compatibility.
// Projva uses JWT for API authentication; sessions are not used for API routes.
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET or JWT_SECRET environment variable is required');
}
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport (required for Google OAuth strategy)
app.use(passport.initialize());
// passport.session() is intentionally omitted — JWT is the auth mechanism for all API routes.

// ── Razorpay webhook — MUST be before express.json() ─────────────────────
// Razorpay requires the raw (unparsed) request body to verify the HMAC-SHA256
// signature. Registering it here before express.json() ensures the body is
// not consumed/parsed before the webhook handler can verify it.
const { handleWebhook } = require('./controllers/billing.controller');
const API_VERSION_WEBHOOK = process.env.API_VERSION || 'v1';
app.post(
  `/api/${API_VERSION_WEBHOOK}/billing/webhook`,
  express.raw({ type: 'application/json' }),
  handleWebhook
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Two app-level limiters cover every endpoint automatically.
// Route-specific limiters (auth, upload, search) are applied in each router file.
app.use('/api/', globalLimiter);   // 500 req / 15 min  — flood protection
app.use('/api/', writeLimiter);    // 100 req / 15 min  — all POST/PUT/PATCH/DELETE

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Serve uploaded files (avatars, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
const API_VERSION = process.env.API_VERSION || 'v1';
app.use(`/api/${API_VERSION}`, apiRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;


