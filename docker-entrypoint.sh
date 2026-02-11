#!/bin/sh
set -e

echo "Running database initialization..."
npx tsx src/db/init.ts

echo "Starting BugIO server..."
exec node dist/index.js
