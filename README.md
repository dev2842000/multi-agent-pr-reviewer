# PR Review Agent

A multi-agent code review system built with [Claude Code's Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sub-agents).

4 specialist agents run **in parallel** on every PR — Security, Performance, Style, and Tests — then an orchestrator synthesizes their findings and posts a single review comment to GitHub.

## How it works

```
You → review-orchestrator
         ├── security-reviewer    ─┐
         ├── performance-reviewer  ├─ run in parallel
         ├── style-reviewer        │
         └── test-reviewer        ─┘
              ↓
         Synthesized comment → posted to GitHub PR
```

## Setup

**Prerequisites**
- [Claude Code](https://claude.ai/code) installed
- [GitHub CLI](https://cli.github.com/) authenticated (`gh auth login`)

**Install**

Copy the `.claude/agents/` folder into your project (or your home `~/.claude/agents/` to use across all repos):

```bash
cp -r .claude/agents/ /path/to/your-project/.claude/agents/
# or globally:
cp -r .claude/agents/ ~/.claude/agents/
```

## Usage

Open Claude Code in your project and ask:

```
Review PR #42
```

or

```
Review https://github.com/owner/repo/pull/42
```

The orchestrator will:
1. Fetch the PR diff via `gh`
2. Spawn all 4 reviewers in parallel
3. Post a consolidated comment to the PR

## Agents

| Agent | Model | Checks |
|-------|-------|--------|
| `review-orchestrator` | Sonnet | Coordinates everything, posts to GitHub |
| `security-reviewer` | Sonnet | Injection, secrets, auth, OWASP Top 10 |
| `performance-reviewer` | Haiku | N+1 queries, memory, algorithm complexity |
| `style-reviewer` | Haiku | Naming, complexity, dead code, smells |
| `test-reviewer` | Haiku | Coverage gaps, weak assertions, edge cases |

Security uses Sonnet for deeper reasoning. Performance/Style/Tests use Haiku — fast and cheap for pattern matching.

## Example output

```
## 🤖 Multi-Agent Code Review

### 🔴 Needs Attention
- **[Security]** `src/auth.py:42` — SQL query built with string concatenation. Use parameterized queries.
- **[Tests]** `src/payments.py` — processPayment() added with no tests.

### 🟡 Suggestions
- **[Performance]** `api/users.js:78` — N+1 pattern in user loop. Batch with WHERE id IN (...).
- **[Style]** `src/order.ts:105` — validateOrder() is 87 lines. Split into smaller functions.

### ✅ All Clear
- Security: No hardcoded secrets · Input validation present
- Style: Naming clear and consistent
- Tests: Auth and validation changes have test coverage

---
**Verdict**: Needs Attention ⚠️

*Reviewed by 4 parallel agents: Security · Performance · Style · Tests*
```
