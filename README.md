# Multi-Agent PR Reviewer

4 specialist AI agents run **in parallel** on every PR — Security, Performance, Style, and Tests — synthesize findings, and post a single review comment to GitHub automatically.

Built with the [Vercel AI SDK](https://sdk.vercel.ai) — supports Anthropic and OpenAI models. Each agent's model is configurable via environment variables with automatic fallback if a provider goes down.

## How it works

```
PR opened / commit pushed
         ↓
GitHub Actions triggers
         ↓
node review.js <PR>
    ├── security-reviewer    (claude-opus-4.7)   ─┐
    ├── performance-reviewer (claude-haiku-4.5)   ├─ parallel
    ├── style-reviewer       (claude-haiku-4.5)   │
    └── test-reviewer        (claude-haiku-4.5)  ─┘
         ↓
Synthesized comment → posted to GitHub PR
```

If any provider fails, the agent automatically retries with a fallback model.

## Agents

| Agent | Default Model | Fallback | Checks |
|-------|--------------|---------|--------|
| Security | claude-opus-4.7 | claude-sonnet-4.6 | Injection, secrets, auth, OWASP Top 10 |
| Performance | claude-haiku-4.5 | claude-sonnet-4.6 | N+1 queries, memory, algorithm complexity |
| Style | claude-haiku-4.5 | claude-sonnet-4.6 | Naming, complexity, dead code, smells |
| Tests | claude-haiku-4.5 | claude-sonnet-4.6 | Coverage gaps, weak assertions, edge cases |

## Setup

**Prerequisites**
- Node.js 18+
- [GitHub CLI](https://cli.github.com/) authenticated (`gh auth login`)
- Anthropic and/or OpenAI API key

**Install**

```bash
git clone https://github.com/dev2842000/multi-agent-pr-reviewer
cd multi-agent-pr-reviewer
npm install
```

**Environment variables**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...          # optional, needed if using OpenAI models
```

## Usage

**Manual**

```bash
./review.sh 42
```

**Automated (GitHub Actions)**

Copy the workflow into your repo:

```bash
cp .github/workflows/pr-review.yml /path/to/your-repo/.github/workflows/
cp review.js /path/to/your-repo/
cp package.json /path/to/your-repo/
```

Add secrets to your GitHub repo settings:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `OPENAI_API_KEY` — optional, only needed if using OpenAI models

Every PR opened or updated will now trigger an automatic review.

## Switching models

Override any agent's model via environment variables:

```bash
# Use GPT for security, keep Haiku for the rest
SECURITY_MODEL=openai/gpt-4o node review.js 42

# Use Opus for everything
SECURITY_MODEL=anthropic/claude-opus-4.7 \
PERFORMANCE_MODEL=anthropic/claude-opus-4.7 \
node review.js 42
```

In GitHub Actions, set these as repository variables (`vars.SECURITY_MODEL` etc.) — no code changes needed.

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

## Cost estimate

| Setup | Cost per review |
|-------|----------------|
| All Haiku | ~$0.01 |
| Security on Opus, rest on Haiku | ~$0.05–0.15 |
| All Opus | ~$0.30–0.50 |
