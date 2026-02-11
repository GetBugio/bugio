# Business Rules

1. Anonymous ticket creation allowed.
2. Voting requires login.
3. One vote per user per ticket.
4. Status changes only by admin.
5. Email notifications:
   - Admin: all new tickets + comments
   - User: only own ticket updates
6. Only email and hashed password stored.
7. SQLite is the only allowed database.
8. No tracking or analytics without explicit activation.
