# Database Schema (SQLite)

## users
- id (PK)
- email (unique)
- password_hash
- role (user/admin)
- created_at

## tickets
- id (PK)
- title
- description
- tag (bug/feature)
- status
- author_id (nullable)
- author_email (nullable if anonymous)
- created_at
- updated_at
- deleted_at (nullable)

## votes
- id (PK)
- user_id (FK -> users.id)
- ticket_id (FK -> tickets.id)
- created_at
- UNIQUE(user_id, ticket_id)

## comments
- id (PK)
- ticket_id (FK)
- user_id (FK)
- content
- created_at

## settings
- key (PK)
- value

