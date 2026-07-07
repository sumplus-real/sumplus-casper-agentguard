#!/bin/bash
# End the current Claude development session

HARNESS_DIR="/Users/xufei/Documents/Github/automative_coding/claude-harness-backup-20260217"
SUMMARY="${1:-Session completed}"
node "$HARNESS_DIR/lib/session-manager.js" end "$SUMMARY"
node "$HARNESS_DIR/lib/progress-tracker.js" log session-end $(cat .claude-session 2>/dev/null || echo "0") "$SUMMARY"
