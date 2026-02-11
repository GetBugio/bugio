# Technical Architecture

## Stack (recommended baseline)
- Backend: Node.js (Express) or Python (Flask/FastAPI)
- Database: SQLite only
- Frontend: Simple server-rendered or SPA (minimalistic)
- Email: SMTP-based mailer
- Password Hashing: bcrypt or argon2

---

## Core Modules

### 1. Authentication Module
- Registration
- Login
- JWT or session-based auth
- Role handling (User/Admin)

### 2. Ticket Module
- CRUD operations
- Tag handling
- Status workflow (admin-only transition)
- Soft delete

### 3. Voting Module
- Vote table
- Unique (user_id, ticket_id) constraint
- Vote counting

### 4. Notification Module
- Event-driven mail triggers
- Separate logic for admin vs user notifications

### 5. Settings Module
- Config table
- Dynamic theme loading
- Logo upload handling

---

## Security

- Rate limiting on anonymous ticket creation
- Captcha for anonymous submissions
- Password hashing
- CSRF protection
- Basic logging of admin actions
