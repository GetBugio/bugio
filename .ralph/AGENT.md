# Agent Build Instructions

## Project Setup
```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your settings (JWT_SECRET, SMTP config, etc.)

# Initialize database with admin user
npm run db:init
```

## Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Build Commands
```bash
# Compile TypeScript to JavaScript
npm run build

# The compiled output will be in ./dist/
```

## Development Server
```bash
# Start development server with hot reload
npm run dev

# The server runs on http://localhost:3000 by default
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user (requires auth)

### Tickets
- `GET /api/tickets` - List tickets (with pagination, filtering, sorting)
- `GET /api/tickets/:id` - Get single ticket
- `POST /api/tickets` - Create ticket (anonymous allowed with email)
- `PATCH /api/tickets/:id` - Update ticket (owner or admin)
- `DELETE /api/tickets/:id` - Soft delete ticket
- `PATCH /api/tickets/:id/status` - Update status (admin only)

### Voting
- `POST /api/tickets/:id/vote` - Vote on ticket (requires auth)
- `DELETE /api/tickets/:id/vote` - Remove vote

### Comments
- `GET /api/tickets/:id/comments` - List comments
- `POST /api/tickets/:id/comments` - Add comment (requires auth)
- `DELETE /api/tickets/:id/comments/:commentId` - Delete comment (admin only)

### Settings
- `GET /api/settings` - Get all settings (public)
- `GET /api/settings/:key` - Get single setting (public)
- `PATCH /api/settings` - Update settings (admin only)
- `POST /api/settings/reset` - Reset all settings to defaults (admin only)
- `POST /api/settings/:key/reset` - Reset single setting to default (admin only)

### Health
- `GET /api/health` - Health check endpoint

## Frontend Pages

The application includes a server-rendered frontend using EJS templates:

- `/` - Ticket listing with filters and pagination
- `/ticket/:id` - Ticket detail with voting and comments
- `/create` - Create new ticket form
- `/login` - User login
- `/register` - User registration
- `/admin` - Admin dashboard (admin only)
- `/logout` - Logout (clears client-side token)

### Frontend Architecture

- **Template Engine**: EJS
- **Styling**: Custom CSS with CSS variables for theming
- **JavaScript**: Vanilla JS for API interactions (auth, voting, comments)
- **Token Storage**: JWT stored in localStorage
- **Views Location**: `src/views/`
- **Static Assets**: `public/css/` and `public/js/`

## Key Learnings
- Using better-sqlite3 for synchronous SQLite operations
- JWT authentication with configurable expiry
- Zod for request validation
- Vitest for testing with supertest for API tests
- TypeScript with strict mode enabled
- EJS templating for server-rendered views
- Dynamic theming via CSS variables from settings
- process.cwd() for cross-environment path resolution

## Feature Development Quality Standards

**CRITICAL**: All new features MUST meet the following mandatory requirements before being considered complete.

### Testing Requirements

- **Minimum Coverage**: 85% code coverage ratio required for all new code
- **Test Pass Rate**: 100% - all tests must pass, no exceptions
- **Test Types Required**:
  - Unit tests for all business logic and services
  - Integration tests for API endpoints or main functionality
  - End-to-end tests for critical user workflows
- **Coverage Validation**: Run coverage reports before marking features complete:
  ```bash
  npm run test:coverage
  ```
- **Test Quality**: Tests must validate behavior, not just achieve coverage metrics
- **Test Documentation**: Complex test scenarios must include comments explaining the test strategy

### Git Workflow Requirements

Before moving to the next feature, ALL changes must be:

1. **Committed with Clear Messages**:
   ```bash
   git add .
   git commit -m "feat(module): descriptive message following conventional commits"
   ```
   - Use conventional commit format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, etc.
   - Include scope when applicable: `feat(api):`, `fix(ui):`, `test(auth):`
   - Write descriptive messages that explain WHAT changed and WHY

2. **Pushed to Remote Repository**:
   ```bash
   git push origin <branch-name>
   ```
   - Never leave completed features uncommitted
   - Push regularly to maintain backup and enable collaboration
   - Ensure CI/CD pipelines pass before considering feature complete

3. **Branch Hygiene**:
   - Work on feature branches, never directly on `main`
   - Branch naming convention: `feature/<feature-name>`, `fix/<issue-name>`, `docs/<doc-update>`
   - Create pull requests for all significant changes

4. **Ralph Integration**:
   - Update .ralph/fix_plan.md with new tasks before starting work
   - Mark items complete in .ralph/fix_plan.md upon completion
   - Update .ralph/PROMPT.md if development patterns change
   - Test features work within Ralph's autonomous loop

### Documentation Requirements

**ALL implementation documentation MUST remain synchronized with the codebase**:

1. **Code Documentation**:
   - Language-appropriate documentation (JSDoc, docstrings, etc.)
   - Update inline comments when implementation changes
   - Remove outdated comments immediately

2. **Implementation Documentation**:
   - Update relevant sections in this AGENT.md file
   - Keep build and test commands current
   - Update configuration examples when defaults change
   - Document breaking changes prominently

3. **README Updates**:
   - Keep feature lists current
   - Update setup instructions when dependencies change
   - Maintain accurate command examples
   - Update version compatibility information

4. **AGENT.md Maintenance**:
   - Add new build patterns to relevant sections
   - Update "Key Learnings" with new insights
   - Keep command examples accurate and tested
   - Document new testing patterns or quality gates

### Feature Completion Checklist

Before marking ANY feature as complete, verify:

- [ ] All tests pass with appropriate framework command
- [ ] Code coverage meets 85% minimum threshold
- [ ] Coverage report reviewed for meaningful test quality
- [ ] Code formatted according to project standards
- [ ] Type checking passes (if applicable)
- [ ] All changes committed with conventional commit messages
- [ ] All commits pushed to remote repository
- [ ] .ralph/fix_plan.md task marked as complete
- [ ] Implementation documentation updated
- [ ] Inline code comments updated or added
- [ ] .ralph/AGENT.md updated (if new patterns introduced)
- [ ] Breaking changes documented
- [ ] Features tested within Ralph loop (if applicable)
- [ ] CI/CD pipeline passes

### Rationale

These standards ensure:
- **Quality**: High test coverage and pass rates prevent regressions
- **Traceability**: Git commits and .ralph/fix_plan.md provide clear history of changes
- **Maintainability**: Current documentation reduces onboarding time and prevents knowledge loss
- **Collaboration**: Pushed changes enable team visibility and code review
- **Reliability**: Consistent quality gates maintain production stability
- **Automation**: Ralph integration ensures continuous development practices

**Enforcement**: AI agents should automatically apply these standards to all feature development tasks without requiring explicit instruction for each task.
