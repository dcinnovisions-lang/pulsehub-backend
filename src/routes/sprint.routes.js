const express = require('express');
const router = express.Router();
const c = require('../controllers/sprint.controller');
const { authenticate: auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

const read = checkPermission({ resource: 'task', action: 'read' });
const sprint = (action) => checkPermission({ resource: 'sprint', action });

// Project-scoped
router.get('/projects/:projectId/sprints', auth, read, c.listSprints);
router.post('/projects/:projectId/sprints', auth, sprint('create'), c.createSprint);
router.get('/projects/:projectId/backlog', auth, read, c.getBacklog);
router.post('/projects/:projectId/sprint-assign', auth, sprint('update'), c.assignToSprint);
router.get('/projects/:projectId/epics', auth, read, c.listEpics);
router.get('/projects/:projectId/releases', auth, read, c.listReleases);
router.post('/projects/:projectId/releases', auth, sprint('create'), c.createRelease);

// Sprint-scoped
router.get('/sprints/:id/issues', auth, c.loadSprint, read, c.getSprintIssues);
router.put('/sprints/:id', auth, c.loadSprint, sprint('update'), c.updateSprint);
router.delete('/sprints/:id', auth, c.loadSprint, sprint('delete'), c.deleteSprint);
router.post('/sprints/:id/start', auth, c.loadSprint, sprint('update'), c.startSprint);
router.post('/sprints/:id/complete', auth, c.loadSprint, sprint('update'), c.completeSprint);

// Release-scoped
router.get('/releases/:id/issues', auth, c.loadRelease, read, c.getReleaseIssues);
router.put('/releases/:id', auth, c.loadRelease, sprint('update'), c.updateRelease);
router.post('/releases/:id/release', auth, c.loadRelease, sprint('update'), c.markReleased);
router.delete('/releases/:id', auth, c.loadRelease, sprint('delete'), c.deleteRelease);

module.exports = router;
