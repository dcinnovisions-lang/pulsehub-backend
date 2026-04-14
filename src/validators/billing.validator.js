const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  next();
};

const validateCreateSubscription = [
  body('planId')
    .notEmpty().withMessage('planId is required')
    .isIn(['pro', 'business']).withMessage('planId must be pro or business'),
  handleValidationErrors
];

const validateVerifyPayment = [
  body('razorpay_payment_id')
    .notEmpty().withMessage('razorpay_payment_id is required'),
  body('razorpay_subscription_id')
    .notEmpty().withMessage('razorpay_subscription_id is required'),
  body('razorpay_signature')
    .notEmpty().withMessage('razorpay_signature is required'),
  handleValidationErrors
];

module.exports = {
  validateCreateSubscription,
  validateVerifyPayment
};
