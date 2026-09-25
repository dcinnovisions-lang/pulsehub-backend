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

// Non-fatal check for env vars app.js/its middleware read directly, so any
// entry point that imports this module (not just server.js) gets a loud
// warning instead of silently producing broken auth or broken email links.
// NOTE: intentionally does NOT check DB_* vars or process.exit() here — this
// module is imported directly by the test suite with mocked models and no
// real DB connection, so a fatal DB check belongs in server.js (the actual
// process entrypoint), not here.
['JWT_SECRET', 'FRONTEND_URL'].filter(k => !process.env[k]).forEach(k => {
  console.warn(`[WARN] ${k} is not set — auth/email links may be broken`);
});

const app = express();

// Behind Nginx: trust one proxy hop so rate limiting sees real client IPs
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration — allow both common React dev ports
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
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
const API_VERSION = process.env.API_VERSION || 'v1';
app.post(
  `/api/${API_VERSION}/billing/webhook`,
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
app.use(`/api/${API_VERSION}`, apiRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;


