# Product Requirements Document

## 1. Core Features

### Ticket Creation
- Title (required)
- Description (required)
- Tag: Bug or Feature
- Optional attachments
- Anonymous creation allowed

### Ticket Management
- Admin can edit/delete all tickets
- Users can edit own tickets (if logged in)
- Soft delete only
- Status editable by admin only

### Status Workflow
Possible states:
- Open
- In Review
- In Progress
- Rejected
- Completed

Status changes:
- Only admin allowed
- Email notification triggered

### Voting System
- Login required
- One vote per user per ticket
- Upvote only
- Sort by votes supported

### Comments
- Only logged-in users
- Admin moderation

---

## 2. User System

### Registration
- Email
- Password
- No additional personal data

### Roles
- User
- Admin

---

## 3. Notifications

### Admin receives email when:
- New ticket created
- New comment
- Relevant ticket update

### User receives email only for:
- Status change on own ticket
- Comment on own ticket

No newsletters or marketing emails.

---

## 4. Admin Settings Panel

Configurable:
- Logo
- Primary color theme
- System name
- SMTP configuration
- Default status list
