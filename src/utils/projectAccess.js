const { Op } = require('sequelize');
const { Project, Workspace, WorkspaceMembers } = require('../models');

// Projects a user can see through workspace membership or ownership.
// Returns null for super admins (everything), otherwise an array of project ids.
const accessibleProjectIds = async (user) => {
  if (user.role === 'super_admin') return null;
  const [memberships, owned] = await Promise.all([
    WorkspaceMembers.findAll({ where: { userId: user.id }, attributes: ['workspaceId'], raw: true }),
    Workspace.findAll({ where: { ownerId: user.id }, attributes: ['id'], raw: true })
  ]);
  const workspaceIds = [...new Set([...memberships.map((m) => m.workspaceId), ...owned.map((w) => w.id)])];
  if (workspaceIds.length === 0) return [];
  const projects = await Project.findAll({ where: { workspaceId: { [Op.in]: workspaceIds } }, attributes: ['id'], raw: true });
  return projects.map((p) => p.id);
};

module.exports = { accessibleProjectIds };
