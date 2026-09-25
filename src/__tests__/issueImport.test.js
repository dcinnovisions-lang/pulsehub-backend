/**
 * CSV reader/writer + Jira-style import mapping (pure functions)
 */
const { parseCSV, toCSV } = require('../utils/csv');
const { buildImportPlan, detectMapping, parseDate, mapType, mapPriority, parseHours } = require('../utils/issueImport');

describe('csv', () => {
  it('parses quoted fields with commas, quotes and line breaks', () => {
    const rows = parseCSV('a,b\r\n"hello, world","she said ""hi""\nsecond line"\r\n');
    expect(rows).toEqual([['a', 'b'], ['hello, world', 'she said "hi"\nsecond line']]);
  });

  it('strips a BOM and detects ; and tab delimiters', () => {
    expect(parseCSV('﻿x;y\n1;2')).toEqual([['x', 'y'], ['1', '2']]);
    expect(parseCSV('x\ty\n1\t2')).toEqual([['x', 'y'], ['1', '2']]);
  });

  it('skips blank lines and rejects an unclosed quote', () => {
    expect(parseCSV('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(() => parseCSV('a,b\n"open,2')).toThrow(/unclosed quote/);
  });

  it('round-trips through toCSV and neutralises spreadsheet formulas', () => {
    const out = toCSV([['Summary', 'Note'], ['a, b', '=HYPERLINK("x")'], ['-5', 'plain']]);
    const back = parseCSV(out);
    expect(back[1][0]).toBe('a, b');
    expect(back[1][1]).toBe(`'=HYPERLINK("x")`);
    expect(back[2][0]).toBe('-5'); // plain negative numbers are left alone
  });
});

describe('import mapping', () => {
  const JIRA = [
    'Summary,Issue key,Issue Type,Status,Priority,Assignee,Reporter,Created,Due Date,Labels,Labels,Sprint,Sprint,Custom field (Story Points),Custom field (Epic Link),Fix Version/s,Original Estimate,Description',
    '"Login page, broken",SCH-1,Bug,In Progress,High,Jane Doe,qa@x.io,21/Sep/26 10:30 AM,30/Sep/26,ui,urgent,Sprint 1,Sprint 2,3,SCH-9,v1.0,28800,"Line one\nLine two"',
    'Student portal,SCH-9,Epic,To Do,Medium,,,,,,,,,,,,,',
    ',SCH-3,Task,Done,Low,,,,,,,,,,,,,',
  ].join('\n');

  it('maps Jira headers, including repeated Labels/Sprint columns', () => {
    const plan = buildImportPlan(JIRA);
    expect(plan.mapping.labels).toHaveLength(2);
    expect(plan.mapping.sprint).toHaveLength(2);
    expect(plan.mapping.storyPoints).toHaveLength(1);
    expect(plan.mapping.epicLink).toHaveLength(1);
  });

  it('normalises each issue', () => {
    const { issues, errors } = buildImportPlan(JIRA);
    expect(issues).toHaveLength(2);
    expect(errors).toEqual([{ row: 4, reason: 'Missing summary / title' }]);
    const bug = issues[0];
    expect(bug).toMatchObject({
      title: 'Login page, broken', externalKey: 'SCH-1', issueType: 'bug', priority: 'high',
      statusName: 'In Progress', assignee: 'Jane Doe', storyPoints: 3, epicRef: 'SCH-9',
      releaseName: 'v1.0', estimatedHours: 8,
    });
    expect(bug.labels).toEqual(['ui', 'urgent']);
    expect(bug.sprintName).toBe('Sprint 2'); // the last sprint is the current one
    expect(bug.description).toBe('Line one\nLine two');
    expect(bug.createdAt.toISOString()).toBe('2026-09-21T10:30:00.000Z');
    expect(issues[1].issueType).toBe('epic');
  });

  it('understands this app\'s own export columns', () => {
    const csv = 'Issue key,Summary,Issue Type,Status,Priority,Assignee,Sprint,Epic Link,Story Points\nSCH-1,Fix it,bug,Done,urgent,Dev One,Sprint 1,SCH-3,5';
    const { issues } = buildImportPlan(csv);
    expect(issues[0]).toMatchObject({ title: 'Fix it', issueType: 'bug', priority: 'urgent', sprintName: 'Sprint 1', epicRef: 'SCH-3', storyPoints: 5 });
  });

  it('honours an explicit column mapping override', () => {
    const csv = 'Col A,Col B\nHello,bug';
    const { issues } = buildImportPlan(csv, { title: [0], issueType: [1] });
    expect(issues[0]).toMatchObject({ title: 'Hello', issueType: 'bug' });
  });

  it('rejects files that are empty or too large', () => {
    expect(() => buildImportPlan('Summary')).toThrow(/header row/);
    const big = ['Summary', ...Array.from({ length: 1600 }, (_, i) => `t${i}`)].join('\n');
    expect(() => buildImportPlan(big)).toThrow(/Too many rows/);
  });

  it('maps types, priorities, dates and estimates', () => {
    expect(mapType('Sub-task')).toBe('task');
    expect(mapType('User Story')).toBe('story');
    expect(mapType('Defect')).toBe('bug');
    expect(mapPriority('Highest')).toBe('urgent');
    expect(mapPriority('Blocker')).toBe('urgent');
    expect(mapPriority('Minor')).toBe('low');
    expect(mapPriority('')).toBe('medium');
    expect(parseDate('2026-10-31').getUTCFullYear()).toBe(2026);
    expect(parseDate('not a date')).toBeNull();
    expect(parseHours('2d 4h')).toBe(20);
    expect(parseHours('7200')).toBe(2);
    expect(parseHours('5')).toBe(5);
  });

  it('detectMapping reports unmapped columns', () => {
    const { unmapped } = detectMapping(['Summary', 'Weird Column', 'Status']);
    expect(unmapped).toEqual(['Weird Column']);
  });
});
