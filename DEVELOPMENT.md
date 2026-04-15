# PulseHub Backend — Development Guide

This guide covers everything a developer needs to get from zero to a running local environment, including database setup, migrations, and seed data.

---

## Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| PostgreSQL | 14+ | `psql --version` |

---

## 1. Clone & Install

```bash
git clone https://github.com/dcinnovisions-lang/pulsehub-backend
cd pulsehub-backend
npm install
```

---

## 2. Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. Required fields:

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `pulsehub_db` |
| `DB_USERNAME` | DB user | `postgres` |
| `DB_PASSWORD` | DB password | `yourpassword` |
| `JWT_SECRET` | 64-char random hex | `openssl rand -hex 32` |
| `SESSION_SECRET` | 64-char random hex | `openssl rand -hex 32` |

Optional (features degrade gracefully if missing):

| Variable | Feature |
|----------|---------|
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email (forgot password, invites) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Billing & subscriptions |

---

## 3. Database Setup

### Option A — One command (recommended for new devs)

```bash
node scripts/setup-db.js
```

This single command:
1. Creates the PostgreSQL database (if it doesn't exist)
2. Runs all 26 migrations in order
3. Seeds 9 demo users, 2 workspaces, 3 projects, statuses, lists, and 5 sample tasks

### Option B — Step by step

```bash
# Step 1: Create the database manually
psql -U postgres -c "CREATE DATABASE pulsehub_db;"

# Step 2: Run all migrations
npx sequelize-cli db:migrate

# Step 3: Seed demo data
node scripts/seed-demo.js
```

---

## 4. Start the Server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server runs at: **http://localhost:5000**
Health check: `GET http://localhost:5000/api/v1/health`

---

## 5. Migration Commands

All migrations are **idempotent** — safe to run against an existing database. They check whether a table or column already exists before adding it.

| Command | Description |
|---------|-------------|
| `npx sequelize-cli db:migrate` | Run all pending migrations |
| `npx sequelize-cli db:migrate:status` | Show which migrations have run |
| `npx sequelize-cli db:migrate:undo` | Rollback the last migration |
| `npx sequelize-cli db:migrate:undo:all` | Rollback ALL migrations (drops all tables) |

### Migration files location

```
src/migrations/
├── 20251230134429-create-initial-tables.js         ← users, workspaces, projects, tasks, ...
├── 20250101000000-add-super-admin-role.js
├── 20250101000001-create-activity-logs.js
├── 20250101000002-create-resources-budgets.js
├── 20250106000001-add-subtask-dates-estimates.js
├── 20250106000002-create-saved-views.js
├── 20250106000003-add-is-template-to-workflows.js
├── 20251231094800-add-assignee-id-to-subtasks.js
├── 20251231120000-create-invites-table.js
├── 20260107000010-add-guest-commenter-role.js
├── 20260318000001-rbac-v2.js
├── 20260318000002-create-notifications.js
├── 20260318000010-extend-user-fields.js
├── 20260318000011-add-task-labels.js
├── 20260319000001-add-chat-message-attachment.js
├── 20260319000001-create-automations.js
├── 20260319000002-add-automation-logs.js
├── 20260319000002-add-document-sharing.js
├── 20260319000003-add-chat-message-fields.js
├── 20260319000010-add-billable-to-timelogs.js
├── 20260319000011-add-recurrence-to-tasks.js
├── 20260319000012-add-parent-id-to-chat-messages.js
├── 20260414000001-create-chat-tables.js             ← chat_rooms, chat_messages
├── 20260414000002-create-documents-table.js         ← documents
├── 20260414000003-create-whiteboard-tables.js       ← whiteboards, whiteboard_elements
└── 20260414000004-add-logo-to-workspaces.js
```

### Creating a new migration

```bash
npx sequelize-cli migration:generate --name add-column-to-table
```

This creates a timestamped file in `src/migrations/`. Edit the `up` and `down` functions.

**Always add idempotency guards:**
```javascript
async up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable('your_table');
  if (!table.new_column) {
    await queryInterface.addColumn('your_table', 'new_column', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
}
```

---

## 6. Seed Script

**File:** `scripts/seed-demo.js`

The seed script creates a full demo dataset. It is **idempotent** — safe to run multiple times (uses `findOrCreate` everywhere).

```bash
node scripts/seed-demo.js
```

### What it seeds

| Step | Data Created |
|------|-------------|
| 1 | 9 platform users (one per role) |
| 2 | 2 workspaces: "Acme Corp" and "Dev Team" |
| 3 | All 9 users added to "Acme Corp" with matching workspace roles |
| 4 | 3 projects in Acme Corp + 4 project templates |
| 5 | Project members added to "Website Redesign" |
| 6 | 4 statuses per project (Backlog, In Progress, In Review, Done) |
| 7 | 3 lists per project (Sprint 1, Sprint 2, Backlog) |
| 8 | 5 sample tasks with assignees and due dates |

### Demo credentials

| Role | Email | Password |
|------|-------|----------|
| `super_admin` | super@pulsehub.dev | Super@123 |
| `admin` | admin@pulsehub.dev | Admin@123 |
| `owner` | owner@pulsehub.dev | Owner@123 |
| `billing_admin` | billing@pulsehub.dev | Billing@123 |
| `pm` | pm@pulsehub.dev | Pm@123456 |
| `member` | member@pulsehub.dev | Member@123 |
| `commenter` | commenter@pulsehub.dev | Comment@123 |
| `guest` | guest@pulsehub.dev | Guest@123 |
| `viewer` | viewer@pulsehub.dev | Viewer@123 |

---

## 7. Setup Script Options

`scripts/setup-db.js` accepts flags:

```bash
node scripts/setup-db.js              # Full setup: create DB + migrate + seed
node scripts/setup-db.js --migrate    # Migrate only (skip seed)
node scripts/setup-db.js --seed       # Seed only (DB + migrations must already exist)
node scripts/setup-db.js --reset      # ⚠️  Drop all tables, re-migrate, re-seed (DEV ONLY)
```

---

## 8. Production Deployment

On production, **never run the seed script** or `--reset`. Only run migrations:

```bash
# On every deploy — runs only new pending migrations
npx sequelize-cli db:migrate
```

To verify migration status before deploying:

```bash
npx sequelize-cli db:migrate:status
```

---

## 9. Database Tables Overview

| Table | Model | Description |
|-------|-------|-------------|
| `users` | User | Platform accounts with roles |
| `workspaces` | Workspace | Top-level organizational units |
| `workspace_members` | WorkspaceMembers | User ↔ Workspace with role |
| `projects` | Project | Projects inside workspaces |
| `project_members` | ProjectMembers | User ↔ Project with role |
| `tasks` | Task | Core task with priority, status, assignees |
| `task_assignees` | TaskAssignees | Many-to-many: tasks ↔ users |
| `task_dependencies` | TaskDependency | Blocking/blocked-by relationships |
| `subtasks` | Subtask | Nested tasks under a task |
| `statuses` | Status | Kanban column statuses per project |
| `lists` | List | Sprint/backlog lists per project |
| `comments` | Comment | Task comments with threading |
| `attachments` | Attachment | File uploads linked to tasks |
| `time_logs` | TimeLog | Time tracking entries per task |
| `activity_logs` | ActivityLog | Audit trail for all entity changes |
| `notifications` | Notification | In-app notifications per user |
| `chat_rooms` | ChatRoom | Chat rooms (global/workspace/project) |
| `chat_messages` | ChatMessage | Messages with reactions, threads, attachments |
| `documents` | Document | Rich-text documents per workspace/project |
| `whiteboards` | Whiteboard | Collaborative whiteboards |
| `whiteboard_elements` | WhiteboardElement | Sticky notes, shapes, text on whiteboards |
| `automations` | Automation | Trigger-action automation rules |
| `budgets` | Budget | Project budget tracking |
| `budget_expenses` | BudgetExpense | Individual expense line items |
| `resources` | Resource | Team resource/capacity planning |
| `custom_fields` | CustomField | User-defined task fields |
| `task_custom_fields` | TaskCustomField | Values of custom fields per task |
| `workflows` | Workflow | Reusable workflow templates |
| `saved_views` | SavedView | Saved filter/sort configurations |
| `invites` | Invite | Workspace/project invitation tokens |
| `guest_access` | GuestAccess | Scoped guest access tokens |

---

## 10. Troubleshooting

### `FATAL: Missing required environment variables`
Fill in all required fields in `.env`. See Section 2 above.

### `relation already exists` on migration
All migrations have idempotency guards. If you see this on an old migration, run:
```bash
npx sequelize-cli db:migrate:status
```
And manually mark the stuck migration as done in the `SequelizeMeta` table:
```sql
INSERT INTO "SequelizeMeta" (name) VALUES ('20xx-stuck-migration.js');
```

### `password authentication failed`
Check `DB_USERNAME` and `DB_PASSWORD` in `.env`. Note: the variable is `DB_USERNAME` (not `DB_USER`).

### Port 5000 already in use
```bash
# Find and kill the process
npx kill-port 5000
# or
lsof -ti:5000 | xargs kill -9   # macOS/Linux
netstat -ano | findstr :5000    # Windows (then taskkill /F /PID <pid>)
```
