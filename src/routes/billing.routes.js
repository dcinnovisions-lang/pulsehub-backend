const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateCreateSubscription, validateVerifyPayment } = require('../validators/billing.validator');
const {
  createSubscription,
  verifyPayment,
  getSubscription,
  cancelSubscription,
} = require('../controllers/billing.controller');

// NOTE: /webhook is NOT here — it is registered directly in app.js BEFORE
// express.json() so Razorpay can verify the raw request body signature.

router.post('/create-subscription',  authenticate, validateCreateSubscription, createSubscription);
router.post('/verify-payment',       authenticate, validateVerifyPayment, verifyPayment);
router.get('/subscription',          authenticate, getSubscription);
router.post('/cancel-subscription',  authenticate, cancelSubscription);

module.exports = router;
