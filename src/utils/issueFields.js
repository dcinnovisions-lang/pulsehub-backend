const { Task, Sprint, Release } = require('../models');

const TEXT_FIELDS = ['environment', 'stepsToReproduce', 'expectedResult', 'actualResult'];

const blank = (v) => v === null || v === '' || v === undefined;

// Validates and normalises the Jira-style issue fields of a create/update request.
// Returns { fields } (only keys present in the body) or { error }.
const buildIssueFields = async (body, projectId) => {
  const fields = {};

  if (body.issueType !== undefined) {
    if (!Task.ISSUE_TYPES.includes(body.issueType)) {
      return { error: `issueType must be one of: ${Task.ISSUE_TYPES.join(', ')}` };
    }
    fields.issueType = body.issueType;
  }

  if (body.storyPoints !== undefined) {
    if (blank(body.storyPoints)) {
      fields.storyPoints = null;
    } else {
      const n = Number(body.storyPoints);
      if (!Number.isFinite(n) || n < 0 || n > 999) return { error: 'storyPoints must be a number between 0 and 999' };
      fields.storyPoints = n;
    }
  }

  if (body.severity !== undefined) {
    if (blank(body.severity)) {
      fields.severity = null;
    } else if (!Task.SEVERITIES.includes(body.severity)) {
      return { error: `severity must be one of: ${Task.SEVERITIES.join(', ')}` };
    } else {
      fields.severity = body.severity;
    }
  }

  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) fields[f] = blank(body[f]) ? null : String(body[f]).slice(0, 10000);
  }

  if (body.epicId !== undefined) {
    if (blank(body.epicId)) {
      fields.epicId = null;
    } else {
      const epic = await Task.findOne({ where: { id: body.epicId, projectId, issueType: 'epic' }, attributes: ['id'] });
      if (!epic) return { error: 'epicId must reference an epic in the same project' };
      fields.epicId = epic.id;
    }
  }

  if (body.sprintId !== undefined) {
    if (blank(body.sprintId)) {
      fields.sprintId = null;
    } else {
      const sprint = await Sprint.findOne({ where: { id: body.sprintId, projectId }, attributes: ['id', 'status'] });
      if (!sprint) return { error: 'sprintId must reference a sprint in the same project' };
      if (sprint.status === 'completed') return { error: 'Cannot add issues to a completed sprint' };
      fields.sprintId = sprint.id;
    }
  }

  if (body.releaseId !== undefined) {
    if (blank(body.releaseId)) {
      fields.releaseId = null;
    } else {
      const release = await Release.findOne({ where: { id: body.releaseId, projectId }, attributes: ['id'] });
      if (!release) return { error: 'releaseId must reference a release in the same project' };
      fields.releaseId = release.id;
    }
  }

  if (fields.issueType === 'epic') fields.epicId = null;

  return { fields };
};

module.exports = { buildIssueFields };
