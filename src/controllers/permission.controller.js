const logger = require('../utils/logger');

const roleMatrix = {
  super_admin: { create: true, read: true, update: true, delete: true, comment: true, manageAdmins: true, manageWorkspaces: true, manageAll: true },
  owner: { create: true, read: true, update: true, delete: true, comment: true, manageAdmins: false, manageWorkspaces: true, manageAll: false },
  admin: { create: true, read: true, update: true, delete: true, comment: true, manageAdmins: false, manageWorkspaces: true, manageAll: false },
  pm: { create: true, read: true, update: true, delete: false, comment: true, manageAdmins: false, manageWorkspaces: false, manageAll: false },
  member: { create: false, read: true, update: true, delete: false, comment: true, manageAdmins: false, manageWorkspaces: false, manageAll: false },
  commenter: { create: false, read: true, update: false, delete: false, comment: true, manageAdmins: false, manageWorkspaces: false, manageAll: false },
  guest: { create: false, read: true, update: false, delete: false, comment: true, manageAdmins: false, manageWorkspaces: false, manageAll: false },
  viewer: { create: false, read: true, update: false, delete: false, comment: false, manageAdmins: false, manageWorkspaces: false, manageAll: false }
};

const resourceMatrix = {
  documents: {
    edit: ['super_admin', 'owner', 'admin', 'pm', 'member'],
    view: ['super_admin', 'owner', 'admin', 'pm', 'member', 'viewer', 'guest', 'commenter'],
    comment: ['super_admin', 'owner', 'admin', 'pm', 'member', 'commenter', 'guest']
  },
  whiteboards: {
    edit: ['super_admin', 'owner', 'admin', 'pm', 'member'],
    view: ['super_admin', 'owner', 'admin', 'pm', 'member', 'viewer', 'guest', 'commenter'],
    comment: ['super_admin', 'owner', 'admin', 'pm', 'member', 'commenter']
  },
  chat: {
    post: ['super_admin', 'owner', 'admin', 'pm', 'member', 'commenter'],
    view: ['super_admin', 'owner', 'admin', 'pm', 'member', 'viewer', 'guest', 'commenter'],
    broadcast: ['super_admin', 'owner', 'admin', 'pm']
  }
};

const getPermissionMatrix = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: { roles: roleMatrix, resources: resourceMatrix } });
  } catch (err) {
    logger.error('Get permission matrix error:', err);
    next(err);
  }
};

module.exports = {
  getPermissionMatrix
};
