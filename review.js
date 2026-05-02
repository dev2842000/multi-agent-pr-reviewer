const { generateText } = require("ai");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { createOpenAI } = require("@ai-sdk/openai");
const { execSync } = require("child_process");
const fs = require("fs");

// ─── Model config (override via env vars) ────────────────────────────────────
const MODELS = {
  security: process.env.SECURITY_MODEL || "anthropic/claude-opus-4.7",
  performance: process.env.PERFORMANCE_MODEL || "anthropic/claude-haiku-4.5",
  style: process.env.STYLE_MODEL || "anthropic/claude-haiku-4.5",
  tests: process.env.TESTS_MODEL || "anthropic/claude-haiku-4.5",
};

// ─── Provider router ─────────────────────────────────────────────────────────
function getModel(modelString) {
  const [provider, ...rest] = modelString.split("/");
  const modelId = rest.join("/");

  if (provider === "anthropic") {
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId);
  }
  if (provider === "openai") {
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelId);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

// ─── Fallback wrapper ─────────────────────────────────────────────────────────
async function callWithFallback(primaryModel, fallbackModel, prompt) {
  try {
    const { text } = await generateText({ model: getModel(primaryModel), prompt });
    return text;
  } catch (err) {
    console.error(`[warn] ${primaryModel} failed (${err.message}), trying fallback...`);
    const { text } = await generateText({ model: getModel(fallbackModel), prompt });
    return text;
  }
}

// ─── Agent prompts ────────────────────────────────────────────────────────────
const AGENTS = {
  security: {
    model: MODELS.security,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior application security engineer. Review this code diff for security vulnerabilities.

## What to look for

**Critical (must flag)**
- Hardcoded secrets, API keys, passwords, tokens
- SQL injection / NoSQL injection
- Command injection (unsanitized shell input)
- XSS (unescaped user input rendered in HTML)
- Insecure deserialization
- Authentication/authorization bypasses
- Sensitive data logged or exposed in errors
- IDOR (insecure direct object references)
- Path traversal vulnerabilities

**High**
- Missing input validation at system boundaries
- Weak cryptography (MD5, SHA1 for passwords, Math.random for secrets)
- CSRF protection missing on state-changing endpoints
- Overly permissive CORS
- Dependency with known CVE added

**Medium**
- Error messages leaking stack traces or internals to users
- Rate limiting missing on sensitive endpoints
- Verbose logging of PII

## Output format

Return ONLY a JSON object — no explanation, no markdown, just JSON:
{
  "agent": "security",
  "critical": [{ "file": "src/auth.py", "line": 42, "issue": "SQL query built with string concatenation — SQL injection risk", "fix": "Use parameterized queries" }],
  "high": [],
  "medium": [],
  "passed": ["No hardcoded secrets found", "Input validation present on API endpoints"]
}

Rules:
- Only flag issues present in the diff
- Be specific: include file name, line number, and a concrete fix
- If no issues in a severity level, use an empty array

Diff:
${diff}`,
  },

  performance: {
    model: MODELS.performance,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior performance engineer. Review this code diff for performance problems.

## What to look for

**Critical**
- N+1 database query patterns (query inside a loop)
- Missing database indexes for new query patterns
- Unbounded queries (no LIMIT on potentially large result sets)
- Synchronous blocking I/O in async context
- Loading entire dataset into memory when pagination/streaming would work

**High**
- Inefficient algorithm where a better complexity exists (O(n²) when O(n log n) is possible)
- Redundant repeated computation that could be cached or hoisted
- Large payload serialization on every request that could be cached
- Missing connection pooling for database/HTTP clients

**Medium**
- Unnecessary re-renders or recomputations in UI code
- Missing memoization on expensive pure functions
- Chatty API calls that could be batched
- String concatenation in loops (use array join or builder pattern)

## Output format

Return ONLY a JSON object — no explanation, no markdown, just JSON:
{
  "agent": "performance",
  "critical": [{ "file": "api/users.js", "line": 78, "issue": "Database query inside forEach loop — N+1 pattern", "fix": "Batch with a single query using WHERE id IN (...) before the loop" }],
  "high": [],
  "medium": [],
  "passed": ["No unbounded queries found", "Async/await used correctly"]
}

Rules:
- Only flag issues present in the diff
- Be specific with file, line, and a concrete fix

Diff:
${diff}`,
  },

  style: {
    model: MODELS.style,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior engineer who cares deeply about code clarity and maintainability. Review this code diff for style and quality issues.

## What to look for

**Must Fix (critical)**
- Functions longer than ~40 lines doing multiple unrelated things (violates single responsibility)
- Deeply nested conditionals (3+ levels) that could be flattened with early returns
- Magic numbers/strings with no explanation
- Misleading names (function named getUser that also writes to DB)

**Should Fix (high)**
- Dead code added (unreachable branches, unused variables/imports)
- Duplicated logic that already exists elsewhere or repeats within the diff
- Boolean parameter traps (processUser(user, true, false) — what do the booleans mean?)
- Commented-out code committed
- TODO/FIXME added without a ticket reference

**Consider (medium)**
- Variable names that are too abbreviated or too verbose for their scope
- Missing early return that would reduce nesting
- Function/method that does something surprising given its name

## Output format

Return ONLY a JSON object — no explanation, no markdown, just JSON:
{
  "agent": "style",
  "critical": [],
  "high": [{ "file": "src/order.ts", "line": 105, "issue": "Function validateOrder is 87 lines handling validation, tax calculation, and DB write", "fix": "Split into validateOrder, calculateTax, and saveOrder" }],
  "medium": [{ "file": "src/order.ts", "line": 12, "issue": "Magic number 86400 — seconds in a day", "fix": "Extract to const SECONDS_PER_DAY = 86400" }],
  "passed": ["No dead code found", "Naming is clear and consistent"]
}

Rules:
- Only flag issues in the diff
- Skip nit-picks — only flag things that would trip up the next engineer

Diff:
${diff}`,
  },

  tests: {
    model: MODELS.tests,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior engineer focused on test quality. Review this code diff and assess whether the tests are adequate.

## What to look for

**Must Fix (critical)**
- New public function/method with zero tests added
- Critical path (auth, payments, data mutation) changed with no test update
- Test that never actually asserts anything (passes vacuously)
- Test mocking away the thing being tested (testing the mock, not the code)

**Should Fix (high)**
- Happy path only — missing error/edge case tests for new logic
- Hardcoded test data that will break in different environments (absolute paths, hardcoded IDs)
- Test name doesn't describe what it's testing (test_function vs test_returns_404_when_user_not_found)
- Test setup so complex it obscures what's being tested

**Consider (medium)**
- New branch/condition added without a test for that branch
- Flaky-prone patterns (time-dependent tests, order-dependent tests)
- Integration test where a unit test would be faster and sufficient

## Output format

Return ONLY a JSON object — no explanation, no markdown, just JSON:
{
  "agent": "tests",
  "critical": [{ "file": "src/payments.py", "line": null, "issue": "processPayment() added with no tests", "fix": "Add tests for success, declined card, and network timeout cases" }],
  "high": [],
  "medium": [{ "file": "tests/test_user.py", "line": 34, "issue": "Test only covers happy path — no test for duplicate email", "fix": "Add test_register_fails_on_duplicate_email" }],
  "passed": ["All new functions have corresponding tests", "Edge cases covered for validation logic"]
}

Rules:
- If no tests exist in the diff at all but code was added, that is a critical issue
- Only flag things in the diff

Diff:
${diff}`,
  },
};

// ─── Synthesize results into markdown ────────────────────────────────────────
function synthesize(results) {
  const attention = [];
  const suggestions = [];
  const allClear = [];

  for (const result of results) {
    let parsed;
    try {
      const json = result.text.match(/\{[\s\S]*\}/)?.[0];
      parsed = JSON.parse(json);
    } catch {
      console.error(`[warn] Could not parse ${result.agent} response`);
      continue;
    }

    const label = `[${parsed.agent.charAt(0).toUpperCase() + parsed.agent.slice(1)}]`;

    for (const issue of parsed.critical || []) {
      attention.push(`- **${label}** \`${issue.file}:${issue.line}\` — ${issue.issue}\n  Fix: ${issue.fix}`);
    }
    for (const issue of parsed.high || []) {
      suggestions.push(`- **${label}** \`${issue.file}:${issue.line}\` — ${issue.issue}\n  Fix: ${issue.fix}`);
    }
    for (const issue of parsed.medium || []) {
      suggestions.push(`- **${label}** \`${issue.file}:${issue.line}\` — ${issue.issue}`);
    }
    for (const pass of parsed.passed || []) {
      allClear.push(`- ${label} ${pass}`);
    }
  }

  const verdict =
    attention.length > 0
      ? "Needs Work 🔴"
      : suggestions.length > 0
      ? "Needs Attention ⚠️"
      : "Ready to Merge ✅";

  return `## 🤖 Multi-Agent Code Review

### 🔴 Needs Attention
${attention.length ? attention.join("\n") : "_None_"}

### 🟡 Suggestions
${suggestions.length ? suggestions.join("\n") : "_None_"}

### ✅ All Clear
${allClear.length ? allClear.join("\n") : "_None_"}

---
**Verdict**: ${verdict}

*Reviewed by 4 parallel agents: Security · Performance · Style · Tests*`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pr = process.argv[2];
  if (!pr) {
    console.error("Usage: node review.js <PR_NUMBER>");
    process.exit(1);
  }

  console.log(`Fetching PR #${pr} diff...`);
  const diff = execSync(`gh pr diff ${pr}`).toString();

  console.log(`Running 4 agents in parallel...`);
  console.log(`  Security   → ${MODELS.security}`);
  console.log(`  Performance → ${MODELS.performance}`);
  console.log(`  Style      → ${MODELS.style}`);
  console.log(`  Tests      → ${MODELS.tests}`);

  const results = await Promise.all(
    Object.entries(AGENTS).map(async ([agent, config]) => {
      const text = await callWithFallback(config.model, config.fallback, config.prompt(diff));
      return { agent, text };
    })
  );

  const review = synthesize(results);

  fs.writeFileSync("/tmp/pr_review.md", review);
  execSync(`gh pr comment ${pr} --body-file /tmp/pr_review.md`);
  console.log(`Done. Review posted to PR #${pr}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
