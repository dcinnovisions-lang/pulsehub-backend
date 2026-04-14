const { User, Workspace } = require('../models');

const PLAN_LIMITS = {
  free:     { workspaces: 1 },
  pro:      { workspaces: 5 },
  business: { workspaces: Infinity },
};

/**
 * Middleware — block workspace creation when user has hit their plan's limit.
 * Attaches planId + limit info to req for downstream use.
 */
const checkWorkspaceLimit = async (req, res, next) => {
  try {
    const user  = await User.findByPk(req.user.id, { attributes: ['id', 'planId'] });
    const plan  = user?.planId || 'free';
    const limit = PLAN_LIMITS[plan]?.workspaces ?? 1;

    if (limit === Infinity) return next(); // business plan — no cap

    const count = await Workspace.count({ where: { ownerId: req.user.id } });

    if (count >= limit) {
      return res.status(403).json({
        success: false,
        error: `Your ${plan} plan allows ${limit} workspace${limit === 1 ? '' : 's'}. Upgrade to create more.`,
        upgradeRequired: true,
        currentPlan: plan,
        limit,
        current: count,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkWorkspaceLimit, PLAN_LIMITS };
