/**
 * Shared workspace/project access check used by both the HTTP layer (chat,
 * whiteboard, document controllers) and the Socket.IO layer (socket.js).
 *
 * Previously this logic was copy-pasted independently in four places and had
 * drifted: document.controller.js's copy checked `user.role !== 'owner'`
 * (the user's *global* platform role) instead of `workspace.ownerId ===
 * user.id` (whether they own *this* workspace) — meaning any user who owned
 * any workspace anywhere was granted access to Documents in every workspace
 * on the platform. This version is the corrected, single source of truth.
 */
const ensureWorkspaceAccess = async (user, { workspaceId, projectId }) => {
  if (user.role === 'super_admin') return true;

  const { Project, Workspace, WorkspaceMembers } = require('../models');

  if (projectId) {
    const project = await Project.findByPk(projectId);
    if (!project) return { status: 404, message: 'Project not found' };
    workspaceId = project.workspaceId;
  }

  if (!workspaceId) {
    return { status: 400, message: 'Workspace context required' };
  }

  const workspace = await Workspace.findByPk(workspaceId);
  if (!workspace) return { status: 404, message: 'Workspace not found' };

  if (workspace.ownerId === user.id) return true;

  const member = await WorkspaceMembers.findOne({ where: { workspaceId, userId: user.id } });
  if (!member) return { status: 403, message: 'You do not have access to this workspace' };

  return true;
};

module.exports = { ensureWorkspaceAccess };
