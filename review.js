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

Focus on: SQL injection, XSS, command injection, hardcoded secrets, auth bypasses, insecure deserialization, IDOR, path traversal, weak crypto, missing input validation, exposed stack traces, OWASP Top 10.

Return a JSON object:
{"agent":"security","critical":[{"file":"...","line":0,"issue":"...","fix":"..."}],"high":[],"medium":[],"passed":[]}

Diff:
${diff}`,
  },

  performance: {
    model: MODELS.performance,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior performance engineer. Review this code diff for performance issues.

Focus on: N+1 queries, unbounded queries, blocking I/O in async context, O(n²) algorithms, missing pagination, redundant computation, missing connection pooling.

Return a JSON object:
{"agent":"performance","critical":[{"file":"...","line":0,"issue":"...","fix":"..."}],"high":[],"medium":[],"passed":[]}

Diff:
${diff}`,
  },

  style: {
    model: MODELS.style,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior engineer who cares about code clarity. Review this diff for style and maintainability issues.

Focus on: functions doing too much, deep nesting, magic numbers, misleading names, dead code, duplicated logic, boolean parameter traps, commented-out code.

Return a JSON object:
{"agent":"style","critical":[{"file":"...","line":0,"issue":"...","fix":"..."}],"high":[],"medium":[],"passed":[]}

Diff:
${diff}`,
  },

  tests: {
    model: MODELS.tests,
    fallback: "anthropic/claude-sonnet-4.6",
    prompt: (diff) => `You are a senior engineer focused on test quality. Review this diff for test coverage gaps.

Focus on: new functions with no tests, critical paths changed with no test update, vacuous assertions, mocking the thing being tested, happy-path-only tests, missing edge cases.

Return a JSON object:
{"agent":"tests","critical":[{"file":"...","line":0,"issue":"...","fix":"..."}],"high":[],"medium":[],"passed":[]}

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
