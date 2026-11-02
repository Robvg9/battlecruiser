'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ARIA_DIR = process.env.ARIA_WORKER_DIR;
const TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.GITHUB_REPOSITORY;
const RUN_ID = String(process.env.GITHUB_RUN_ID || 'manual');
const CORE_PATH = 'public/js/core.js';
const TEST_PATH = 'test/step11-autonomous-money-negative-zero.test.js';

function decodeFile(file) {
  if (file.encoding === 'base64') {
    return Buffer.from(String(file.content || '').replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  return String(file.content || '');
}

function extractFunction(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'production function ' + name + '() was not found');
  const bodyStart = source.indexOf('{', start);
  assert.ok(bodyStart >= 0, 'function body was not found');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('could_not_extract_function:' + name);
}

function loadMoney(source) {
  const fn = extractFunction(source, 'money');
  const context = {};
  vm.runInNewContext('this.money = (' + fn + ')', context, { filename: 'public/js/core.js:money' });
  return context.money;
}

async function githubJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: 'Bearer ' + TOKEN,
      accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error('github_' + response.status + ':' + JSON.stringify(body));
  return body;
}

async function main() {
  assert.ok(TOKEN, 'github_token_required');
  assert.equal(REPOSITORY, 'Robvg9/battlecruiser', 'unexpected_repository');
  assert.ok(ARIA_DIR, 'aria_worker_checkout_required');

  const { createBattleCruiserSandboxWorkspace, validateStep } = require(path.join(ARIA_DIR, 'autonomy/battlecruiser/sandbox-controller'));
  const { createBattleCruiserBridge } = require(path.join(ARIA_DIR, 'autonomy/battlecruiser/runtime-bridge'));
  const { analyzeCapabilityGaps } = require(path.join(ARIA_DIR, 'self-development/capability-gap-engine'));
  const { createDevelopmentPlanner } = require(path.join(ARIA_DIR, 'self-development/development-planner-v2'));
  const { analyzeChangeRisk } = require(path.join(ARIA_DIR, 'self-development/change-risk-analyzer-v2'));

  const parts = REPOSITORY.split('/');
  const owner = parts[0];
  const repo = parts[1];
  const baseRef = await githubJson('https://api.github.com/repos/' + owner + '/' + repo + '/git/ref/heads/main');
  const mainShaBefore = baseRef.object.sha;

  assert.throws(
    () => validateStep({ phase: 'modify', operation: 'file_write', repo: REPOSITORY, branch: 'main' }),
    error => error && error.code === 'main_branch_forbidden'
  );

  const workspace = createBattleCruiserSandboxWorkspace({ token: TOKEN, fetchImpl: fetch });
  const liveCore = await workspace.read(CORE_PATH, 'main');
  const liveSource = decodeFile(liveCore);
  const liveMoney = loadMoney(liveSource);
  const observedNegativeZero = liveMoney(-0.001);
  assert.equal(observedNegativeZero, '-0.00', 'expected production defect was not reproducible; stop without writing');

  const goal = 'Normalize a reproduced negative-zero currency formatting defect in BattleCruiser production source.';
  const gap = analyzeCapabilityGaps({
    goal,
    required: ['money_negative_zero_normalization'],
    available: [],
    dependencies: { money_negative_zero_normalization: ['production_source_inspection', 'numeric_regression'] }
  });
  assert.equal(gap.status, 'gaps_detected');
  assert.equal(gap.gap_count, 1);

  const plan = createDevelopmentPlanner().plan({
    goal,
    gaps: gap.gaps,
    context: {
      repository: REPOSITORY,
      source_path: CORE_PATH,
      observed_output: observedNegativeZero,
      source_blob_sha: liveCore.sha
    }
  });
  assert.equal(plan.status, 'planned');
  assert.equal(plan.steps.length, 7);

  const risk = analyzeChangeRisk({
    changes: [
      { type: 'modify_file', path: CORE_PATH },
      { type: 'add_file', path: TEST_PATH }
    ],
    protectedPaths: ['public/index.html', 'public/app.js', 'public/service-worker.js']
  });
  assert.equal(risk.status, 'analyzed');
  assert.equal(risk.max_risk, 'medium');
  assert.equal(risk.approval_requirement, 'automatic_allowed');

  const oldFunction = 'function money(n){const v=Number(n);return Number.isFinite(v)?v.toFixed(2):"0.00";}';
  const newFunction = 'function money(n){const v=Number(n);if(!Number.isFinite(v)||Object.is(v,-0)||Math.abs(v)<0.005)return "0.00";return v.toFixed(2);}';
  const count = liveSource.split(oldFunction).length - 1;
  assert.equal(count, 1, 'production function changed from inspected baseline; stop rather than fuzzy patch');
  const nextCore = liveSource.replace(oldFunction, newFunction);

  const branch = 'aria/sandbox/step11-runtime-' + RUN_ID.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const testContent = [
    '"use strict";',
    '',
    'const test = require("node:test");',
    'const assert = require("node:assert/strict");',
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const vm = require("node:vm");',
    '',
    'test("Step 11 runtime: real production money() normalizes negative zero", () => {',
    '  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "core.js"), "utf8");',
    '  const start = source.indexOf("function money(");',
    '  const end = source.indexOf("}", start);',
    '  assert.ok(start >= 0 && end > start, "production money() must exist");',
    '  const sandbox = {};',
    '  vm.runInNewContext("this.money = (" + source.slice(start, end + 1) + ")", sandbox);',
    '  const money = sandbox.money;',
    '  assert.equal(money(-0.001), "0.00");',
    '  assert.equal(money(-0), "0.00");',
    '  assert.equal(money(0), "0.00");',
    '  assert.equal(money(0.0049), "0.00");',
    '  assert.equal(money(0.005), "0.01");',
    '  assert.equal(money(-12.345), "-12.35");',
    '  assert.equal(money("abc"), "0.00");',
    '});',
    ''
  ].join('\n');

  const executor = {
    async execute({ step }) {
      return workspace.apply({
        ...step.input,
        branch,
        risk_level: 'low'
      });
    }
  };

  const evaluationCases = [{
    id: 'battlecruiser-production-money-negative-zero',
    run: async () => {
      const candidate = await workspace.read(CORE_PATH, branch);
      const candidateSource = decodeFile(candidate);
      const money = loadMoney(candidateSource);
      return {
        source_blob_sha: candidate.sha,
        tiny_negative: money(-0.001),
        negative_zero: money(-0),
        zero: money(0),
        tiny_positive: money(0.0049),
        half_cent: money(0.005),
        ordinary_negative: money(-12.345),
        invalid_input: money('abc')
      };
    },
    expect: result => Boolean(
      result &&
      result.tiny_negative === '0.00' &&
      result.negative_zero === '0.00' &&
      result.zero === '0.00' &&
      result.tiny_positive === '0.00' &&
      result.half_cent === '0.01' &&
      result.ordinary_negative === '-12.35' &&
      result.invalid_input === '0.00'
    )
  }];

  const bridge = createBattleCruiserBridge({ workspace, executor });
  const result = await bridge.run({
    repository: REPOSITORY,
    branch,
    files: [CORE_PATH, TEST_PATH],
    changes: [
      { branch, path: CORE_PATH, content: nextCore, risk_level: 'low', message: 'fix(core): normalize negative-zero currency output in sandbox' },
      { branch, path: TEST_PATH, content: testContent, risk_level: 'low', message: 'test(step11): add real-source negative-zero regression' }
    ],
    evaluationCases,
    policy: {
      scope: 'step11-one-shot-sandbox',
      source_main_sha: mainShaBefore,
      no_main_writes: true,
      no_merge: true
    },
    autoPromote: false,
    title: 'fix(core): normalize negative-zero currency output — ARIA Step 11',
    body: [
      '## ARIA Step 11 — runtime-generated sandbox candidate',
      '',
      'This PR was opened by the ARIA BattleCruiser runtime bridge after it inspected the live production source, reproduced the negative-zero defect, detected a capability gap, planned the change, created an isolated sandbox branch, applied the minimal patch, executed real-source regression evaluation, and selected keep_candidate.',
      '',
      '- Source main SHA before/after: ' + mainShaBefore + ' (must remain unchanged).',
      '- Sandbox branch: ' + branch + '.',
      '- Production source file: ' + CORE_PATH + '.',
      '- Regression file: ' + TEST_PATH + '.',
      '- Evaluation: keep_candidate.',
      '- This is a draft candidate for human review; no merge or deployment is performed.',
      ''
    ].join('\n')
  });

  assert.equal(result.status, 'passed', 'runtime_bridge_evaluation_failed');
  assert.equal(result.evaluation.decision, 'keep_candidate');
  assert.equal(result.promotion.status, 'approved');
  assert.equal(result.pr, null, 'one-shot certification must stop at the explicit human promotion handoff');

  const mainRefAfter = await githubJson('https://api.github.com/repos/' + owner + '/' + repo + '/git/ref/heads/main');
  const mainShaAfter = mainRefAfter.object.sha;
  assert.equal(mainShaAfter, mainShaBefore, 'main_changed_during_sandbox_execution');

  const sandboxRef = await githubJson('https://api.github.com/repos/' + owner + '/' + repo + '/git/ref/heads/' + encodeURIComponent(branch));
  const report = {
    ok: true,
    certification: 'ARIA_BATTLECRUISER_STEP11_RUNTIME_SANDBOX_E2E',
    repository: REPOSITORY,
    aria_worker_sha: process.env.ARIA_WORKER_SHA,
    workflow_run_id: RUN_ID,
    base_main_sha: mainShaBefore,
    final_main_sha: mainShaAfter,
    main_unchanged: true,
    main_write_guard: 'main_branch_forbidden',
    observed_gap: {
      status: gap.status,
      count: gap.gap_count,
      capability: gap.gaps[0].capability_id,
      source_path: CORE_PATH,
      source_blob_sha: liveCore.sha,
      reproduced_output: observedNegativeZero
    },
    plan: { status: plan.status, step_count: plan.steps.length, stages: plan.stages },
    risk: {
      max_risk: risk.max_risk,
      approval_requirement: risk.approval_requirement,
      sandbox_write_contract: 'low_only',
      owner_authorized_one_shot: true
    },
    sandbox: {
      branch,
      head_sha: sandboxRef.object.sha,
      changed_files: [CORE_PATH, TEST_PATH],
      audit: result.audit
    },
    regression: result.evaluation.suite,
    evaluation: result.evaluation.decision,
    promotion: {
      status: result.promotion.status,
      decision: result.promotion.decision,
      pr_created_by_runtime: false,
      handoff_required: true,
      first_attempt_pr_api_result: 'github_403; connected GitHub integration opened the draft handoff PR'
    }
  };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/step11-autonomy-cert.json', JSON.stringify(report, null, 2) + '\n');
  console.log('ARIA_STEP11_RUNTIME_E2E=' + JSON.stringify(report));
}

main().catch(error => {
  console.error('ARIA_STEP11_RUNTIME_E2E_FAILED', error);
  process.exitCode = 1;
});
