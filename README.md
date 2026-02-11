# Bugio

A lightweight, modern web-based bug and feature tracking system with minimal data storage and simple administration.

## Features

- **Ticket Management**: Create, edit, and track bugs and feature requests
- **Anonymous Submissions**: Allow anonymous ticket creation with optional email for notifications
- **Voting System**: Logged-in users can upvote tickets to prioritize issues
- **Comments**: Discuss tickets with team members (requires login)
- **Admin Dashboard**: Manage ticket status, moderate comments, configure system settings
- **Email Notifications**: Get notified about new tickets, status changes, and comments
- **GDPR-Friendly**: Minimal personal data collection
- **SQLite Database**: No external database required

## Requirements

- Node.js >= 20.0.0
- npm

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd bugio

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your settings

# Initialize database (creates admin user)
npm run db:init

# Start development server
npm run dev
```

The server will start at `http://localhost:3000`.

## Configuration

Edit the `.env` file to configure your installation:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration (CHANGE IN PRODUCTION!)
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Database
DATABASE_PATH=./data/bugio.db

# SMTP Configuration (optional - for email notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com

# Admin Configuration
ADMIN_EMAIL=admin@example.com
```

### Email Notifications

Email notifications are optional. If SMTP is not configured, the system will operate normally but email notifications will only be logged to the console.

When configured, notifications are sent for:
- New ticket creation (to admin)
- Ticket status changes (to ticket owner)
- New comments (to ticket owner)

## Usage

### For Users

1. **Browse Tickets**: Visit the homepage to see all tickets with filters for status, tag, and search
2. **Create Tickets**: Click "New Ticket" to submit a bug report or feature request
   - Anonymous submissions are allowed (optional email for notifications)
   - Logged-in users have their tickets associated with their account
3. **Vote**: Log in to upvote tickets you want prioritized
4. **Comment**: Log in to add comments to tickets

### For Administrators

1. **Login**: Use admin credentials to access the admin dashboard
2. **Manage Tickets**: Change ticket status (Open, In Review, In Progress, Rejected, Completed)
3. **Moderate Comments**: Delete inappropriate comments
4. **Configure Settings**: Customize system name, colors, logo, and default statuses

Default admin credentials (created during `npm run db:init`):
- Email: `admin@bugio.local`
- Password: `admin123`

**Important**: Change the admin password immediately after first login in production!

## API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login and get JWT token |
| `/api/auth/me` | GET | Get current user (requires auth) |

### Tickets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tickets` | GET | List tickets (with pagination, filtering, sorting) |
| `/api/tickets/:id` | GET | Get single ticket |
| `/api/tickets` | POST | Create ticket (anonymous allowed with email) |
| `/api/tickets/:id` | PATCH | Update ticket (owner or admin) |
| `/api/tickets/:id` | DELETE | Soft delete ticket |
| `/api/tickets/:id/status` | PATCH | Update status (admin only) |

### Voting

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tickets/:id/vote` | POST | Vote on ticket (requires auth) |
| `/api/tickets/:id/vote` | DELETE | Remove vote |

### Comments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tickets/:id/comments` | GET | List comments |
| `/api/tickets/:id/comments` | POST | Add comment (requires auth) |
| `/api/tickets/:id/comments/:commentId` | DELETE | Delete comment (admin only) |

### Settings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get all settings (public) |
| `/api/settings/:key` | GET | Get single setting (public) |
| `/api/settings` | PATCH | Update settings (admin only) |
| `/api/settings/reset` | POST | Reset all settings to defaults (admin only) |
| `/api/settings/:key/reset` | POST | Reset single setting to default (admin only) |

### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check endpoint |

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Project Structure

```
bugio/
├── src/
│   ├── config/         # Configuration management
│   ├── db/             # Database schema and initialization
│   ├── middleware/     # Express middleware (auth, validation)
│   ├── routes/         # API route handlers
│   ├── services/       # Business logic (email, settings)
│   ├── types/          # TypeScript type definitions
│   ├── views/          # EJS templates
│   └── index.ts        # Application entry point
├── public/
│   ├── css/            # Stylesheets
│   └── js/             # Client-side JavaScript
├── tests/              # Test files
├── data/               # SQLite database (created at runtime)
└── .ralph/             # Development automation configuration
```

## Status Workflow

Tickets progress through these statuses (admin-only transitions):

1. **Open** - New ticket, awaiting review
2. **In Review** - Being evaluated
3. **In Progress** - Actively being worked on
4. **Rejected** - Will not be implemented
5. **Completed** - Issue resolved or feature implemented

## Security Considerations

- Change `JWT_SECRET` in production
- Change default admin password immediately
- Use HTTPS in production
- Configure rate limiting for production (partially implemented)
- Consider adding CAPTCHA for anonymous submissions

## License

MIT
