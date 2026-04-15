/**
 * Projva — Demo Seed Script
 * Seeds demo accounts for testing all roles.
 * Usage: node backend/scripts/seed-demo.js
 * Idempotent: safe to run multiple times.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');

// Load models (this triggers DB connection + association setup)
const {
  sequelize,
  User,
  Workspace,
  WorkspaceMembers,
  Project,
  ProjectMembers,
  List,
  Status,
  Task,
  TaskAssignees,
} = require('../src/models');

// ─── ANSI colour helpers ────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

// ─── User definitions ───────────────────────────────────────────────────────
const USERS = [
  { role: 'super_admin',  email: 'super@pulsehub.dev',    password: 'Super@123',    firstName: 'Sarah',  lastName: 'Admin'   },
  { role: 'admin',        email: 'admin@pulsehub.dev',    password: 'Admin@123',    firstName: 'Alex',   lastName: 'Manager' },
  { role: 'owner',        email: 'owner@pulsehub.dev',    password: 'Owner@123',    firstName: 'Oliver', lastName: 'Owner'   },
  { role: 'billing_admin',email: 'billing@pulsehub.dev',  password: 'Billing@123',  firstName: 'Bella',  lastName: 'Finance' },
  { role: 'pm',           email: 'pm@pulsehub.dev',       password: 'Pm@123456',    firstName: 'Peter',  lastName: 'PM'      },
  { role: 'member',       email: 'member@pulsehub.dev',   password: 'Member@123',   firstName: 'Mike',   lastName: 'Member'  },
  { role: 'commenter',    email: 'commenter@pulsehub.dev',password: 'Comment@123',  firstName: 'Chloe',  lastName: 'Comment' },
  { role: 'guest',        email: 'guest@pulsehub.dev',    password: 'Guest@123',    firstName: 'Gary',   lastName: 'Guest'   },
  { role: 'viewer',       email: 'viewer@pulsehub.dev',   password: 'Viewer@123',   firstName: 'Vera',   lastName: 'Viewer'  },
];

// Workspace-level roles for Acme Corp
const WS_ROLES = {
  super_admin:  'admin',
  admin:        'admin',
  owner:        'owner',
  billing_admin:'billing_admin',
  pm:           'pm',
  member:       'member',
  commenter:    'commenter',
  guest:        'guest',
  viewer:       'viewer',
};

// Project-level roles for "Website Redesign"
const PROJECT_ROLES = {
  pm:        'project_lead',
  member:    'contributor',
  commenter: 'commenter',
  viewer:    'viewer',
};

// ─── Main seed function ─────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${C.cyan}${C.bold}▶  Projva — seeding demo data...${C.reset}\n`);

  // Wait for DB connection to be ready (models/index.js fires async auth check)
  await sequelize.authenticate();

  // ── 1. Create / upsert platform users ──────────────────────────────────────
  console.log(`${C.blue}[1/9]${C.reset} Creating platform users…`);
  const userMap = {}; // role → User instance

  for (const def of USERS) {
    const [user, created] = await User.findOrCreate({
      where: { email: def.email },
      defaults: {
        email:     def.email,
        password:  def.password,   // plain text — beforeCreate hook hashes it
        firstName: def.firstName,
        lastName:  def.lastName,
        role:      def.role,
        isActive:  true,
      },
    });

    // If user already existed, reset password so it matches the seed definition
    if (!created) {
      const salt = await bcrypt.genSalt(10);
      await user.update({ password: await bcrypt.hash(def.password, salt), isActive: true }, { hooks: false });
    }

    userMap[def.role] = user;
    console.log(`   ${C.green}✓${C.reset} ${def.role.padEnd(14)} ${def.email}`);
  }

  // ── 2. Create workspaces ────────────────────────────────────────────────────
  console.log(`\n${C.blue}[2/9]${C.reset} Creating workspaces…`);

  const [acmeCorp] = await Workspace.findOrCreate({
    where: { name: 'Acme Corp' },
    defaults: {
      name:        'Acme Corp',
      ownerId:     userMap['owner'].id,
      description: 'Main demo workspace for Acme Corp',
    },
  });

  const [devTeam] = await Workspace.findOrCreate({
    where: { name: 'Dev Team' },
    defaults: {
      name:        'Dev Team',
      ownerId:     userMap['admin'].id,
      description: 'Internal development team workspace',
    },
  });

  console.log(`   ${C.green}✓${C.reset} Acme Corp  (owner: ${userMap['owner'].email})`);
  console.log(`   ${C.green}✓${C.reset} Dev Team   (owner: ${userMap['admin'].email})`);

  // ── 3. Add workspace members to Acme Corp ─────────────────────────────────
  console.log(`\n${C.blue}[3/9]${C.reset} Adding workspace members to "Acme Corp"…`);

  for (const [roleKey, wsRole] of Object.entries(WS_ROLES)) {
    const user = userMap[roleKey];
    if (!user) continue;

    await WorkspaceMembers.findOrCreate({
      where: { workspaceId: acmeCorp.id, userId: user.id },
      defaults: {
        workspaceId: acmeCorp.id,
        userId:      user.id,
        role:        wsRole,
      },
    });

    console.log(`   ${C.green}✓${C.reset} ${user.email.padEnd(30)} → workspace role: ${wsRole}`);
  }

  // ── 4. Create 3 projects in Acme Corp ─────────────────────────────────────
  console.log(`\n${C.blue}[4/9]${C.reset} Creating projects in "Acme Corp"…`);

  const projectDefs = [
    { name: 'Website Redesign', color: '#3b82f6', description: 'Revamp the company website' },
    { name: 'Mobile App',       color: '#10b981', description: 'Build iOS and Android apps' },
    { name: 'Data Pipeline',    color: '#f59e0b', description: 'ETL pipeline for analytics' },
  ];

  const projectMap = {}; // name → Project instance

  for (const def of projectDefs) {
    const [project] = await Project.findOrCreate({
      where: { name: def.name, workspaceId: acmeCorp.id },
      defaults: {
        name:        def.name,
        color:       def.color,
        description: def.description,
        workspaceId: acmeCorp.id,
        ownerId:     userMap['owner'].id,
      },
    });

    projectMap[def.name] = project;
    console.log(`   ${C.green}✓${C.reset} ${def.name}`);
  }

  // ── 4b. Create default template projects ──────────────────────────────────
  console.log(`\n${C.blue}[4b]${C.reset} Creating default template projects…`);

  const templates = [
    { name: 'Agile Sprint', color: '#2563eb', description: 'Standard 2-week sprint with backlog, in-progress, review, and done columns.' },
    { name: 'Bug Tracker', color: '#dc2626', description: 'Track, prioritize, and resolve bugs systematically with severity levels.' },
    { name: 'Marketing Campaign', color: '#7c3aed', description: 'Plan and execute marketing campaigns end-to-end from ideation to launch.' },
    { name: 'Product Launch', color: '#059669', description: 'Coordinate all activities for a successful product launch across teams.' },
  ];

  for (const tmpl of templates) {
    await Project.findOrCreate({
      where: { name: tmpl.name, isTemplate: true, workspaceId: acmeCorp.id },
      defaults: { ...tmpl, isTemplate: true, workspaceId: acmeCorp.id, ownerId: userMap['owner'].id, status: 'active' }
    });
    console.log(`   ${C.green}✓${C.reset} Template: ${tmpl.name}`);
  }

  // ── 5. Add project members to "Website Redesign" ──────────────────────────
  console.log(`\n${C.blue}[5/9]${C.reset} Adding project members to "Website Redesign"…`);

  const websiteProject = projectMap['Website Redesign'];

  for (const [roleKey, projRole] of Object.entries(PROJECT_ROLES)) {
    const user = userMap[roleKey];
    if (!user) continue;

    await ProjectMembers.findOrCreate({
      where: { projectId: websiteProject.id, userId: user.id },
      defaults: {
        projectId: websiteProject.id,
        userId:    user.id,
        role:      projRole,
        invitedBy: userMap['owner'].id,
      },
    });

    console.log(`   ${C.green}✓${C.reset} ${user.email.padEnd(30)} → project role: ${projRole}`);
  }

  // ── 6. Create default statuses for each project ───────────────────────────
  console.log(`\n${C.blue}[6/9]${C.reset} Creating default statuses…`);

  const statusDefs = [
    { name: 'Backlog',     color: '#94a3b8', position: 0, isDefault: true  },
    { name: 'In Progress', color: '#3b82f6', position: 1, isDefault: false },
    { name: 'In Review',   color: '#f59e0b', position: 2, isDefault: false },
    { name: 'Done',        color: '#10b981', position: 3, isDefault: false },
  ];

  const statusMap = {}; // projectName:statusName → Status instance

  for (const [projectName, project] of Object.entries(projectMap)) {
    for (const def of statusDefs) {
      const [status] = await Status.findOrCreate({
        where: { name: def.name, projectId: project.id },
        defaults: {
          name:      def.name,
          color:     def.color,
          position:  def.position,
          isDefault: def.isDefault,
          projectId: project.id,
        },
      });

      statusMap[`${projectName}:${def.name}`] = status;
    }

    console.log(`   ${C.green}✓${C.reset} ${projectName} — 4 statuses`);
  }

  // ── 7. Create default lists for each project ──────────────────────────────
  console.log(`\n${C.blue}[7/9]${C.reset} Creating default lists…`);

  const listNames = ['Sprint 1', 'Sprint 2', 'Backlog'];
  const listMap = {}; // projectName:listName → List instance

  for (const [projectName, project] of Object.entries(projectMap)) {
    for (let i = 0; i < listNames.length; i++) {
      const name = listNames[i];

      const [list] = await List.findOrCreate({
        where: { name, projectId: project.id },
        defaults: {
          name,
          projectId: project.id,
          position:  i,
        },
      });

      listMap[`${projectName}:${name}`] = list;
    }

    console.log(`   ${C.green}✓${C.reset} ${projectName} — 3 lists`);
  }

  // ── 8. Create 5 sample tasks in "Website Redesign" / "Sprint 1" ──────────
  console.log(`\n${C.blue}[8/9]${C.reset} Creating sample tasks…`);

  const sprint1List    = listMap['Website Redesign:Sprint 1'];
  const statusBacklog  = statusMap['Website Redesign:Backlog'];
  const statusInProg   = statusMap['Website Redesign:In Progress'];
  const statusInReview = statusMap['Website Redesign:In Review'];
  const statusDone     = statusMap['Website Redesign:Done'];
  const pmUser         = userMap['pm'];
  const memberUser     = userMap['member'];

  const taskDefs = [
    {
      title:       'Design new homepage wireframes',
      description: 'Create low-fidelity and high-fidelity wireframes for the new homepage layout.',
      priority:    'urgent',
      statusId:    statusInProg.id,
      assignee:    pmUser.id,
      position:    0,
    },
    {
      title:       'Set up CI/CD pipeline',
      description: 'Configure GitHub Actions for automated testing and deployment to staging.',
      priority:    'high',
      statusId:    statusBacklog.id,
      assignee:    memberUser.id,
      position:    1,
    },
    {
      title:       'Write component library documentation',
      description: 'Document all reusable UI components with usage examples and props table.',
      priority:    'medium',
      statusId:    statusInReview.id,
      assignee:    pmUser.id,
      position:    2,
    },
    {
      title:       'Migrate legacy API endpoints',
      description: 'Update all v1 endpoints to v2 with proper error handling and rate limiting.',
      priority:    'high',
      statusId:    statusInProg.id,
      assignee:    memberUser.id,
      position:    3,
    },
    {
      title:       'Conduct accessibility audit',
      description: 'Run WCAG 2.1 AA audit on all public-facing pages and fix critical issues.',
      priority:    'low',
      statusId:    statusDone.id,
      assignee:    pmUser.id,
      position:    4,
    },
  ];

  for (const def of taskDefs) {
    const [task, created] = await Task.findOrCreate({
      where: { title: def.title, projectId: websiteProject.id },
      defaults: {
        title:       def.title,
        description: def.description,
        priority:    def.priority,
        statusId:    def.statusId,
        listId:      sprint1List.id,
        projectId:   websiteProject.id,
        position:    def.position,
        createdBy:   pmUser.id,
        dueDate:     new Date(Date.now() + (7 + def.position * 3) * 24 * 60 * 60 * 1000),
      },
    });

    if (created) {
      await TaskAssignees.findOrCreate({
        where: { taskId: task.id, userId: def.assignee },
        defaults: { taskId: task.id, userId: def.assignee },
      });
    }

    console.log(`   ${C.green}✓${C.reset} "${def.title.substring(0, 45)}" → ${def.priority}`);
  }

  // ── 9. Print credentials table ─────────────────────────────────────────────
  console.log(`\n${C.blue}[9/9]${C.reset} All done!\n`);
  printTable();

  return true;
}

// ─── Credentials table printer ──────────────────────────────────────────────
function printTable() {
  const rows = USERS.map(u => ({
    role:     u.role,
    email:    u.email,
    password: u.password,
    name:     `${u.firstName} ${u.lastName}`,
  }));

  // Column widths
  const W = {
    role:     Math.max(14, ...rows.map(r => r.role.length)),
    email:    Math.max(26, ...rows.map(r => r.email.length)),
    password: Math.max(14, ...rows.map(r => r.password.length)),
    name:     Math.max(16, ...rows.map(r => r.name.length)),
  };

  const pad = (str, len) => str.padEnd(len);

  const top    = `╔${'═'.repeat(W.role + 2)}╦${'═'.repeat(W.email + 2)}╦${'═'.repeat(W.password + 2)}╦${'═'.repeat(W.name + 2)}╗`;
  const mid    = `╠${'═'.repeat(W.role + 2)}╬${'═'.repeat(W.email + 2)}╬${'═'.repeat(W.password + 2)}╬${'═'.repeat(W.name + 2)}╣`;
  const bottom = `╚${'═'.repeat(W.role + 2)}╩${'═'.repeat(W.email + 2)}╩${'═'.repeat(W.password + 2)}╩${'═'.repeat(W.name + 2)}╝`;

  const totalWidth = W.role + W.email + W.password + W.name + 11;
  const title      = 'Projva Demo Accounts';
  const titlePad   = Math.floor((totalWidth - title.length) / 2);

  const titleRow   = `║${' '.repeat(titlePad)}${C.bold}${C.cyan}${title}${C.reset}${' '.repeat(totalWidth - titlePad - title.length)}║`;
  const headerRow  = `║ ${C.bold}${pad('Role', W.role)}${C.reset} ║ ${C.bold}${pad('Email', W.email)}${C.reset} ║ ${C.bold}${pad('Password', W.password)}${C.reset} ║ ${C.bold}${pad('Name', W.name)}${C.reset} ║`;

  console.log(top);
  console.log(titleRow);
  console.log(mid);
  console.log(headerRow);
  console.log(mid);

  rows.forEach((row, i) => {
    const roleColor = i === 0 ? C.magenta : i === 1 ? C.cyan : i === 2 ? C.yellow : C.white;
    const line = `║ ${roleColor}${pad(row.role, W.role)}${C.reset} ║ ${C.green}${pad(row.email, W.email)}${C.reset} ║ ${C.yellow}${pad(row.password, W.password)}${C.reset} ║ ${pad(row.name, W.name)} ║`;
    console.log(line);
    if (i < rows.length - 1) console.log(mid);
  });

  console.log(bottom);
  console.log(`\n${C.gray}Tip: Run again at any time — the script is idempotent.${C.reset}\n`);
}

// ─── Entry point ────────────────────────────────────────────────────────────
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n${C.bold}\x1b[31m✖  Seed failed:${C.reset}`, err.message);
    console.error(err.stack);
    process.exit(1);
  });
