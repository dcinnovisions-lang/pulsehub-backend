const crypto = require('crypto');
const { ApiKey } = require('../models');

const MAX_KEYS_PER_USER = 10;
const hashKey = (token) => crypto.createHash('sha256').update(token).digest('hex');

const serialize = (k) => ({
  id: k.id,
  name: k.name,
  token: `${k.prefix}…`,
  createdAt: k.createdAt,
  lastUsed: k.lastUsed
});

exports.listApiKeys = async (req, res, next) => {
  try {
    const keys = await ApiKey.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: keys.map(serialize) });
  } catch (err) { next(err); }
};

exports.createApiKey = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Name is required (max 100 characters)' });
    }
    const count = await ApiKey.count({ where: { userId: req.user.id } });
    if (count >= MAX_KEYS_PER_USER) {
      return res.status(400).json({ success: false, error: `Maximum of ${MAX_KEYS_PER_USER} API keys reached` });
    }
    const token = `pk_${crypto.randomBytes(24).toString('hex')}`;
    const key = await ApiKey.create({
      userId: req.user.id,
      name,
      keyHash: hashKey(token),
      prefix: token.slice(0, 10)
    });
    res.status(201).json({ success: true, data: { ...serialize(key), token } });
  } catch (err) { next(err); }
};

exports.revokeApiKey = async (req, res, next) => {
  try {
    const deleted = await ApiKey.destroy({ where: { id: req.params.id, userId: req.user.id } });
    if (!deleted) return res.status(404).json({ success: false, error: 'API key not found' });
    res.json({ success: true, message: 'API key revoked' });
  } catch (err) { next(err); }
};

exports.hashKey = hashKey;
