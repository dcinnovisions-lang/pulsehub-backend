// Turns a CSV export (Jira, ClickUp, Excel, or this app's own export) into normalised issue objects.
// Pure functions only — database lookups happen in the controller.

const { parseCSV } = require('./csv');

const FIELD_SYNONYMS = {
  key: ['issue key', 'key'],
  title: ['summary', 'title', 'name', 'issue summary', 'task name'],
  description: ['description', 'details'],
  issueType: ['issue type', 'issuetype', 'type'],
  status: ['status'],
  priority: ['priority'],
  assignee: ['assignee', 'assigned to', 'assignees'],
  reporter: ['reporter', 'creator', 'created by'],
  created: ['created', 'created at', 'created date'],
  due: ['due date', 'duedate', 'due', 'due on'],
  start: ['start date', 'startdate', 'start'],
  labels: ['labels', 'label', 'tags'],
  storyPoints: ['story points', 'story point estimate', 'story point', 'custom field (story points)', 'custom field (story point estimate)', 'points'],
  sprint: ['sprint', 'sprints'],
  epicLink: ['epic link', 'custom field (epic link)', 'epic'],
  epicName: ['epic name', 'custom field (epic name)'],
  parent: ['parent', 'parent key'],
  release: ['fix version/s', 'fix versions', 'fix version', 'fixversion', 'release', 'version'],
  estimate: ['original estimate', 'time estimate', 'estimated hours'],
  severity: ['severity'],
  environment: ['environment'],
  progress: ['progress', '% complete'],
  stepsToReproduce: ['steps to reproduce'],
  expectedResult: ['expected result'],
  actualResult: ['actual result'],
};

const MAX_ROWS = 1500;

const norm = (h) => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();

// { field: [columnIndex, ...] } — Jira repeats some headers (Labels, Sprint), so a field can span columns
const detectMapping = (headers) => {
  const mapping = {};
  const used = new Set();
  const normalized = headers.map(norm);
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const syn of synonyms) {
      const idxs = normalized.map((h, i) => (h === syn ? i : -1)).filter((i) => i >= 0 && !used.has(i));
      if (idxs.length > 0) {
        mapping[field] = idxs;
        idxs.forEach((i) => used.add(i));
        break;
      }
    }
  }
  const unmapped = headers.filter((_, i) => !used.has(i) && String(headers[i]).trim() !== '');
  return { mapping, unmapped };
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const parseDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Jira: 21/Sep/26 10:30 AM  or 21/Sep/2026
  const j = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);
  if (j) {
    let year = Number(j[3]);
    if (year < 100) year += 2000;
    let hour = j[4] ? Number(j[4]) : 0;
    if (j[6] && /pm/i.test(j[6]) && hour < 12) hour += 12;
    if (j[6] && /am/i.test(j[6]) && hour === 12) hour = 0;
    const d = new Date(Date.UTC(year, MONTHS[j[2].toLowerCase()], Number(j[1]), hour, j[5] ? Number(j[5]) : 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const mapType = (raw) => {
  const t = norm(raw);
  if (!t) return 'task';
  if (/(bug|defect|incident|problem)/.test(t)) return 'bug';
  if (t === 'epic') return 'epic';
  if (/(story|feature|improvement|enhancement|requirement)/.test(t)) return 'story';
  return 'task';
};

const mapPriority = (raw) => {
  const p = norm(raw);
  if (!p) return 'medium';
  if (/(highest|blocker|critical|urgent|p0|p1)/.test(p)) return 'urgent';
  if (/(high|major|p2)/.test(p)) return 'high';
  if (/(lowest|trivial|minor|low|p4|p5)/.test(p)) return 'low';
  return 'medium';
};

const mapSeverity = (raw) => {
  const s = norm(raw);
  return ['critical', 'major', 'minor', 'trivial'].includes(s) ? s : null;
};

const parseNumber = (raw) => {
  const n = parseFloat(String(raw || '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Jira exports "Original Estimate" in seconds; other tools use hours
const parseHours = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(w|d|h|m)/g)];
  if (parts.length > 0) {
    return +parts.reduce((sum, [, n, u]) => sum + Number(n) * ({ w: 40, d: 8, h: 1, m: 1 / 60 }[u]), 0).toFixed(2);
  }
  const n = parseNumber(s);
  if (n === null) return null;
  return +(n > 1000 ? n / 3600 : n).toFixed(2);
};

const splitList = (raw) =>
  String(raw || '').split(/[;,\n]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);

/**
 * Parses CSV text into normalised issues.
 * @param {string} text
 * @param {object} [mappingOverride] { field: [columnIndex, ...] }
 */
const buildImportPlan = (text, mappingOverride) => {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    const err = new Error('The file needs a header row and at least one data row');
    err.code = 'CSV_EMPTY';
    throw err;
  }
  if (rows.length - 1 > MAX_ROWS) {
    const err = new Error(`Too many rows (${rows.length - 1}). Import at most ${MAX_ROWS} issues at a time.`);
    err.code = 'CSV_TOO_LARGE';
    throw err;
  }

  const headers = rows[0].map((h) => String(h || '').trim());
  const detected = detectMapping(headers);
  const mapping = mappingOverride && Object.keys(mappingOverride).length ? mappingOverride : detected.mapping;
  const unmapped = mappingOverride ? headers.filter((_, i) => !Object.values(mapping).flat().includes(i)) : detected.unmapped;

  const cells = (row, field) => (mapping[field] || []).map((i) => String(row[i] === undefined ? '' : row[i]).trim()).filter(Boolean);
  const first = (row, field) => cells(row, field)[0] || '';

  const issues = [];
  const errors = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;
    const title = first(row, 'title') || first(row, 'epicName');
    if (!title) { errors.push({ row: rowNumber, reason: 'Missing summary / title' }); continue; }

    const type = mapType(first(row, 'issueType'));
    const estimate = parseHours(first(row, 'estimate'));
    const key = first(row, 'key');
    const sprintNames = cells(row, 'sprint');
    const description = first(row, 'description');

    issues.push({
      rowNumber,
      externalKey: key || null,
      title: title.slice(0, 500),
      description: description || null,
      issueType: type,
      statusName: first(row, 'status') || null,
      priority: mapPriority(first(row, 'priority')),
      assignee: first(row, 'assignee') || null,
      reporter: first(row, 'reporter') || null,
      createdAt: parseDate(first(row, 'created')),
      dueDate: parseDate(first(row, 'due')),
      startDate: parseDate(first(row, 'start')),
      labels: [...new Set(cells(row, 'labels').flatMap((c) => splitList(c)))],
      storyPoints: parseNumber(first(row, 'storyPoints')),
      sprintName: sprintNames.length ? sprintNames[sprintNames.length - 1] : null, // last sprint = current
      epicRef: type === 'epic' ? null : (first(row, 'epicLink') || first(row, 'parent') || null),
      releaseName: (first(row, 'release') || '').split(/[;,]/)[0].trim() || null,
      estimatedHours: estimate,
      severity: mapSeverity(first(row, 'severity')),
      environment: first(row, 'environment') || null,
      stepsToReproduce: first(row, 'stepsToReproduce') || null,
      expectedResult: first(row, 'expectedResult') || null,
      actualResult: first(row, 'actualResult') || null,
      progress: (() => { const p = parseNumber(first(row, 'progress')); return p === null ? null : Math.min(100, Math.max(0, p)); })(),
    });
  }

  return { headers, mapping, unmapped, issues, errors, rowCount: rows.length - 1 };
};

module.exports = { buildImportPlan, detectMapping, parseDate, mapType, mapPriority, parseHours, FIELD_SYNONYMS, MAX_ROWS };
