#!/bin/bash
set -e

PR=$1

if [ -z "$PR" ]; then
  echo "Usage: ./review.sh <PR_NUMBER>"
  exit 1
fi

echo "Fetching PR #$PR diff..."
gh pr diff "$PR" > /tmp/pr_diff.txt

echo "Running multi-agent review..."
claude -p "The PR diff is saved at /tmp/pr_diff.txt. Use the review-orchestrator agent to run the full multi-agent review and output the review markdown." \
  --allowedTools "Agent,Bash,Read" \
  --max-turns 30 \
  --no-color > /tmp/pr_review.md

echo "Posting review to PR #$PR..."
gh pr comment "$PR" --body-file /tmp/pr_review.md

echo "Done. Review posted to PR #$PR"
