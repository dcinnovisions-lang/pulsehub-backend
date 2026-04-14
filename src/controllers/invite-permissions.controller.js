const { Workspace, WorkspaceMembers, ProjectMembers } = require('../models');
const logger = require('../utils/logger');

// ─── Helper: check if caller can manage workspace members ──────────────────────
const canManageWorkspaceMembers = async (workspaceId, callerId, callerSystemRole) => {
  if (callerSystemRole === 'super_admin') return true;

  const ws = await Workspace.findByPk(workspaceId);
  if (!ws) return false;

  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId: callerId } });
  if (!member) return false;

  return ['owner', 'admin', 'pm'].includes(member.role);
};

// ─── Helper: check if caller can manage project members ───────────────────────
const canManageProjectMembers = async (projectId, workspaceId, callerId, callerSystemRole) => {
  if (callerSystemRole === 'super_admin') return true;

  // Check project-level role
  const pm = await ProjectMembers.findOne({ where: { projectId, userId: callerId } });
  if (pm && pm.role === 'project_lead') return true;

  // Fall back to workspace role
  const wm = await WorkspaceMembers.findOne({ where: { workspaceId, userId: callerId } });
  if (!wm) return false;
  return ['owner', 'admin', 'pm'].includes(wm.role);
};

module.exports = {
  canManageWorkspaceMembers,
  canManageProjectMembers,
};
