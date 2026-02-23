#!/bin/sh
set -e

echo "Starting Bugio server..."
exec node dist/index.js
