const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { User } = require('../models');
const logger   = require('../utils/logger');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLAN_IDS = {
  pro:      process.env.RAZORPAY_PRO_PLAN_ID,
  business: process.env.RAZORPAY_BUSINESS_PLAN_ID,
};

// ── POST /billing/create-subscription ─────────────────────────────────────

const createSubscription = async (req, res) => {
  try {
    const { planId } = req.body;
    if (!['pro', 'business'].includes(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid plan. Choose pro or business.' });
    }

    const rzpPlanId = PLAN_IDS[planId];
    if (!rzpPlanId) {
      return res.status(500).json({ success: false, error: `Razorpay plan ID for "${planId}" is not configured.` });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const subscription = await razorpay.subscriptions.create({
      plan_id:         rzpPlanId,
      customer_notify: 1,
      quantity:        1,
      total_count:     120, // 10 years — effectively indefinite monthly subscription
      notes: {
        userId: String(req.user.id),
        planId,
        email:  user.email,
      },
    });

    // Store subscription ID early so webhook can look up this user
    await user.update({ subscriptionId: subscription.id });

    logger.info(`Razorpay subscription created | user=${user.id} | plan=${planId} | sub=${subscription.id}`);
    return res.json({
      success:        true,
      subscriptionId: subscription.id,
      keyId:          process.env.RAZORPAY_KEY_ID,
      userEmail:      user.email,
      userName:       `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    });
  } catch (err) {
    logger.error('createSubscription error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create subscription.' });
  }
};

// ── POST /billing/verify-payment ──────────────────────────────────────────

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, planId } = req.body;

    // Verify the HMAC-SHA256 signature Razorpay sends on successful payment
    const body        = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      logger.warn(`Payment signature mismatch | user=${req.user.id}`);
      return res.status(400).json({ success: false, error: 'Invalid payment signature.' });
    }

    const resolvedPlan = ['pro', 'business'].includes(planId) ? planId : 'pro';
    await User.update({
      subscriptionId:     razorpay_subscription_id,
      subscriptionStatus: 'active',
      planId:             resolvedPlan,
    }, { where: { id: req.user.id } });

    logger.info(`Payment verified | user=${req.user.id} | plan=${resolvedPlan} | sub=${razorpay_subscription_id}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, error: 'Payment verification failed.' });
  }
};

// ── GET /billing/subscription ──────────────────────────────────────────────

const getSubscription = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['planId', 'subscriptionStatus', 'subscriptionId'],
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    let nextBillingDate = null;
    if (user.subscriptionId) {
      try {
        const sub = await razorpay.subscriptions.fetch(user.subscriptionId);
        if (sub.charge_at) {
          nextBillingDate = new Date(sub.charge_at * 1000).toISOString();
        }
      } catch { /* Razorpay call failed — return without it */ }
    }

    return res.json({
      success: true,
      data: {
        planId:             user.planId             || 'free',
        subscriptionStatus: user.subscriptionStatus || 'free',
        nextBillingDate,
      },
    });
  } catch (err) {
    logger.error('getSubscription error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription.' });
  }
};

// ── POST /billing/cancel-subscription ─────────────────────────────────────

const cancelSubscription = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user?.subscriptionId) {
      return res.status(400).json({ success: false, error: 'No active subscription found.' });
    }

    // cancel_at_cycle_end=false means cancel at end of current billing period
    await razorpay.subscriptions.cancel(user.subscriptionId, false);
    await user.update({ subscriptionStatus: 'canceled' });

    logger.info(`Subscription cancel requested | user=${user.id}`);
    return res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the current billing period.',
    });
  } catch (err) {
    logger.error('cancelSubscription error:', err);
    return res.status(500).json({ success: false, error: 'Failed to cancel subscription.' });
  }
};

// ── POST /billing/webhook ──────────────────────────────────────────────────

const handleWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody   = req.body; // Buffer — registered with express.raw() in app.js

  // Verify webhook signature
  try {
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expectedSig !== signature) {
      logger.warn('Razorpay webhook signature mismatch');
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }
  } catch (err) {
    logger.warn(`Webhook signature error: ${err.message}`);
    return res.status(400).json({ success: false, error: 'Signature verification failed' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  try {
    switch (event.event) {

      case 'subscription.activated':
      case 'subscription.charged': {
        const sub    = event.payload.subscription.entity;
        const userId = sub.notes?.userId;
        const planId = sub.notes?.planId;
        if (userId) {
          await User.update({
            subscriptionId:     sub.id,
            subscriptionStatus: 'active',
            planId:             planId || 'pro',
          }, { where: { id: userId } });
          logger.info(`Subscription ${event.event} | user=${userId} | plan=${planId}`);
        }
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.completed': {
        const sub    = event.payload.subscription.entity;
        const userId = sub.notes?.userId;
        if (userId) {
          await User.update({
            subscriptionStatus: 'free',
            planId:             'free',
            subscriptionId:     null,
          }, { where: { id: userId } });
          logger.info(`Subscription ended → downgraded to free | user=${userId}`);
        }
        break;
      }

      case 'subscription.pending':
      case 'payment.failed': {
        const sub    = event.payload.subscription?.entity;
        const userId = sub?.notes?.userId;
        if (userId) {
          await User.update({ subscriptionStatus: 'past_due' }, { where: { id: userId } });
          logger.warn(`Payment failed → past_due | user=${userId}`);
        }
        break;
      }

      default:
        // Unhandled event — silently ignore
        break;
    }
  } catch (err) {
    logger.error(`Webhook handler error [${event?.event}]:`, err);
    // Still return 200 so Razorpay doesn't keep retrying for app-level errors
  }

  return res.json({ received: true });
};

module.exports = { createSubscription, verifyPayment, getSubscription, cancelSubscription, handleWebhook };
