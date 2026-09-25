const { User } = require('../models');
const logger = require('../utils/logger');
const { PREF_KEYS } = require('../utils/notificationPrefs');
const { isConfigured: mailConfigured } = require('../utils/mailer');

// GET /api/v1/notifications/preferences
const getPreferences = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'notificationPrefs'] });
    res.status(200).json({
      success: true,
      data: { prefs: (user && user.notificationPrefs) || {}, emailConfigured: mailConfigured() }
    });
  } catch (error) {
    logger.error('getPreferences error:', error);
    next(error);
  }
};

// PUT /api/v1/notifications/preferences  { prefs: { mention: { email, inApp }, ... } }
const updatePreferences = async (req, res, next) => {
  try {
    const incoming = req.body && req.body.prefs;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ success: false, error: 'prefs must be an object' });
    }
    const clean = {};
    for (const key of Object.keys(incoming)) {
      if (!PREF_KEYS.includes(key)) {
        return res.status(400).json({ success: false, error: `Unknown notification type "${key}"` });
      }
      const v = incoming[key] || {};
      clean[key] = {};
      if (v.email !== undefined) clean[key].email = !!v.email;
      if (v.inApp !== undefined) clean[key].inApp = !!v.inApp;
    }
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'notificationPrefs'] });
    const merged = { ...(user.notificationPrefs || {}) };
    for (const key of Object.keys(clean)) merged[key] = { ...(merged[key] || {}), ...clean[key] };
    await user.update({ notificationPrefs: merged }, { fields: ['notificationPrefs'] });
    res.status(200).json({ success: true, data: { prefs: merged } });
  } catch (error) {
    logger.error('updatePreferences error:', error);
    next(error);
  }
};

module.exports = { getPreferences, updatePreferences };
