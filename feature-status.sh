#!/bin/bash
# Get feature statistics and next feature

HARNESS_DIR="/Users/xufei/Documents/Github/automative_coding/claude-harness-backup-20260217"
export FEATURES_FILE="features.json"

echo "Feature Statistics:"
node "$HARNESS_DIR/lib/feature-manager.js" stats
echo ""
echo "Next Feature:"
node "$HARNESS_DIR/lib/feature-manager.js" next
