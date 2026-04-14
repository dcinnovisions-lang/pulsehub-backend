# PulseHub Backend

Node.js + Express REST API with PostgreSQL, Socket.IO real-time events, and JWT authentication.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL + Sequelize ORM
- **Auth**: JWT + 2FA (TOTP) + Google OAuth
- **Real-time**: Socket.IO
- **Email**: Nodemailer (SMTP)
- **Payments**: Razorpay
- **File Uploads**: Multer

## Getting Started

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your values in .env
```

### 4. Run the server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:5000`

Health check: `GET /api/v1/health`

## API Overview

| Module | Base Route |
|--------|-----------|
| Auth | `/api/v1/auth` |
| Users | `/api/v1/users` |
| Workspaces | `/api/v1/workspaces` |
| Projects | `/api/v1/projects` |
| Tasks | `/api/v1/tasks` |
| Comments | `/api/v1/tasks/:id/comments` |
| Chat | `/api/v1/chat` |
| Budgets | `/api/v1/budgets` |
| Notifications | `/api/v1/notifications` |
| Activity Logs | `/api/v1/activity-logs` |
| Time Tracking | `/api/v1/time-tracking` |
| Documents | `/api/v1/documents` |
| Automations | `/api/v1/automations` |

## Project Structure

```
src/
├── controllers/     # Route handlers
├── models/          # Sequelize models
├── routes/          # Express routers
├── middleware/      # Auth, permissions, validation
├── validators/      # express-validator rules
├── utils/           # Logger, email, helpers
├── socket/          # Socket.IO event handlers
├── config/          # DB config
└── server.js        # Entry point
```

## Environment Variables

See `.env.example` for all required and optional variables.

## Default Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | super@pulsehub.dev | Test1234! |
| Admin | admin@pulsehub.dev | Test1234! |
| PM | pm@pulsehub.dev | Test1234! |
| Member | member@pulsehub.dev | Test1234! |
