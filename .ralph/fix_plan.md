# Ralph Fix Plan

## High Priority
- [x] Set up basic project structure and build system
- [x] Define core data structures and types
- [x] Implement basic input/output handling (API routes)
- [x] Create test framework and initial tests
- [x] Add email notification service
- [ ] Create settings service for admin configuration

## Medium Priority
- [x] Add error handling and validation (Zod validation)
- [x] Implement core business logic (Auth, Tickets, Voting, Comments)
- [x] Add configuration management (dotenv/config.ts)
- [ ] Create user documentation
- [ ] Implement frontend (ticket listing, detail, create form)
- [ ] Admin dashboard for status changes

## Low Priority
- [ ] Performance optimization
- [ ] Rate limiting on anonymous ticket creation (partially done)
- [ ] Captcha for anonymous submissions
- [ ] Integration with external services
- [ ] Advanced error recovery
- [ ] Backup export function

## Completed
- [x] Project initialization
- [x] Node.js/Express/TypeScript project setup
- [x] SQLite database schema (users, tickets, votes, comments, settings)
- [x] Authentication module (register, login, JWT)
- [x] Ticket CRUD with soft delete
- [x] Status workflow (admin-only status changes)
- [x] Voting system (one vote per user per ticket)
- [x] Comments system (logged-in users only)
- [x] Input validation with Zod
- [x] Test suite with 37 passing tests
- [x] Email notification service (nodemailer integration)
  - Admin notified on new tickets
  - Ticket owner notified on status changes
  - Ticket owner notified on new comments
  - Graceful fallback when SMTP not configured

## Notes
- Focus on MVP functionality first
- Ensure each feature is properly tested
- Update this file after each major milestone
- Backend API is complete for Phase 1 - Core Backend
- Email notifications implemented - Phase 1 complete
- Next focus: Settings service, then Frontend
