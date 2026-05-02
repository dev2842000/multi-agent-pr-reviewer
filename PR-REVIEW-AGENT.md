# Multi-Agent PR Code Review
Automated AI Code Reviews for Every Pull Request  
Repo: any  |  Trigger: PR opened / commit pushed  |  Stack: Claude Code + GitHub Actions


## Overview

Every pull request raised against a configured repository automatically gets a full AI code review posted as a GitHub comment — before any human looks at it. No manual steps. No waiting.

Four specialist AI agents run **in parallel**, each focused on a different dimension of code quality. Results are synthesized into a single structured comment with clear verdicts.

---

## What It Reviews

| Agent | Checks |
|-------|--------|
| **Security** | SQL injection, XSS, hardcoded secrets, auth bypasses, OWASP Top 10 |
| **Performance** | N+1 queries, memory leaks, O(n²) algorithms, blocking I/O |
| **Style** | Naming, complexity, dead code, magic numbers, code smells |
| **Tests** | Missing tests, weak assertions, untested edge cases, vacuous mocks |

---

## Example Output

```
## 🤖 Multi-Agent Code Review

### 🔴 Needs Attention
[Performance] api/users.js:78 — Database query inside forEach loop (N+1 pattern).
Fix: batch with WHERE id IN (...) before the loop.

[Tests] src/payments.py — processPayment() added with zero tests.
Fix: add tests for success, declined card, and network timeout.

### 🟡 Suggestions
[Security] src/auth.js:42 — console.error logs full stack trace to browser.
Log message only, or guard behind a dev flag.

[Style] src/order.ts:105 — validateOrder() is 87 lines handling 3 concerns.
Split into validateOrder, calculateTax, saveOrder.

### ✅ All Clear
- Security: No hardcoded secrets · Input validation present
- Style: Naming clear and consistent
- Tests: Auth changes have test coverage

---
Verdict: Needs Attention ⚠️
Reviewed by 4 parallel agents: Security · Performance · Style · Tests
```

---

## How It Works

```
PR opened or commit pushed
         ↓
GitHub Actions detects the event
         ↓
Fresh CI runner spins up
         ↓
Claude Code CLI installed
         ↓
Orchestrator agent fetches the PR diff
         ↓
4 specialist agents run in parallel
    ┌─────────────────────────────────┐
    │  Security   Performance         │
    │  Style      Tests               │
    └─────────────────────────────────┘
         ↓
Results synthesized into one report
         ↓
Comment posted on the PR
         ↓
CI runner destroyed
```

**Total time: ~60–90 seconds from PR open to comment posted.**

---

## Architecture

| Component | Role | Cost |
|-----------|------|------|
| `.github/workflows/pr-review.yml` | Listens for PR events, triggers the run | GitHub Actions minutes |
| `.claude/agents/review-orchestrator.md` | Fetches diff, spawns 4 agents in parallel, posts comment | — |
| `.claude/agents/security-reviewer.md` | Security specialist (Claude Sonnet) | Per token |
| `.claude/agents/performance-reviewer.md` | Performance specialist (Claude Haiku) | Per token |
| `.claude/agents/style-reviewer.md` | Style specialist (Claude Haiku) | Per token |
| `.claude/agents/test-reviewer.md` | Test specialist (Claude Haiku) | Per token |
| `GITHUB_TOKEN` | Posts PR comments — auto-injected by GitHub, no setup | Free |
| `ANTHROPIC_API_KEY` | Authenticates Claude Code — one secret added to repo | — |

Security agent uses Sonnet for deeper reasoning. The other three use Haiku — fast and cheap for pattern matching.

---

## Permission Model

GitHub automatically provides a temporary `GITHUB_TOKEN` to every workflow run. We declare:

```yaml
permissions:
  pull-requests: write   # allows posting comments
  contents: read         # allows reading the code
```

No OAuth apps, no webhooks, no external services. Everything is scoped to the repository and expires after the run.

---

## Setup (One-Time, ~5 minutes)

**1. Copy agents and workflow into the repo**
```bash
cp -r .claude/agents/ /path/to/your-repo/.claude/agents/
cp .github/workflows/pr-review.yml /path/to/your-repo/.github/workflows/
```

**2. Add one GitHub secret**

Go to: `github.com/<org>/<repo>/settings/secrets/actions/new`

| Secret Name | Value |
|-------------|-------|
| `ANTHROPIC_API_KEY` | API key from console.anthropic.com |

**3. Merge to main**

From this point, every PR automatically gets reviewed.

---

## Cost Estimate

| Resource | Cost |
|----------|------|
| GitHub Actions (ubuntu runner) | Free on public repos / ~$0.008 per minute on private |
| Claude Sonnet (security agent) | ~$0.003 per review |
| Claude Haiku × 3 (other agents) | ~$0.002 per review |
| **Total per PR review** | **~$0.05 – $0.15 depending on diff size** |

A team doing 20 PRs/week spends roughly **$4–12/month**.

---

## Benefits

**Catches issues before human review**  
Security vulnerabilities, N+1 queries, and missing tests are flagged automatically. Reviewers spend time on architecture and logic, not catching obvious mistakes.

**Consistent quality bar**  
Every PR gets the same review checklist applied — no issues slipping through because a reviewer was tired or in a hurry.

**Faster feedback loop**  
Developer gets feedback in ~90 seconds of opening the PR, while the context is still fresh — not hours later.

**Zero infrastructure**  
No servers, no databases, no maintenance. Everything runs inside GitHub Actions on ephemeral runners. Nothing to break or scale.

**Parallel execution**  
All 4 agents run at the same time — total review time is bounded by the slowest agent, not the sum of all agents.

---

## What It Does NOT Do

- It does not auto-merge or approve PRs — human approval is always required
- It does not have write access to code — read-only analysis only
- It does not run tests — it reviews test quality, not test execution
- It does not replace human code review — it augments it

---

## Open Questions for Team

1. Should we run this on all repos or start with one (lunar)?
2. Do we want to block PR merge if verdict is "Needs Work 🔴"? (Can be added via GitHub branch protection rules)
3. Should the review re-run on every commit push, or only on first PR open?
4. Any repo-specific rules to add per agent (e.g. our naming conventions, banned functions)?

---

Prepared by Crobo Engineering
