#!/bin/bash
set -e

PR=$1

if [ -z "$PR" ]; then
  echo "Usage: ./review.sh <PR_NUMBER>"
  exit 1
fi

node review.js "$PR"
