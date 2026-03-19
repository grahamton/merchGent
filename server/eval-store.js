/**
 * Eval Store
 * Lightweight two-tier storage for roundtable and audit eval runs.
 *
 * Tier 1 — Compact index (JSONL):
 *   ~/.merch-connector/evals/<domain>.jsonl
 *   One JSON object per line. Max 100 records per domain (oldest trimmed).
 *   Fields follow OpenTelemetry MCP semantic conventions where applicable.
 *
 * Tier 2 — Full run JSON (optional):
 *   ~/.merch-connector/evals/runs/<id>.json
 *   Contains full persona outputs. Max 10 per domain (oldest deleted).
 *
 * Convergence score (0–100): measures how much the three personas agreed on
 * their top concerns. Computed from keyword overlap across floor_walker,
 * auditor, and scout topConcern strings. Higher = stronger consensus.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const BASE_DIR = process.env.MERCH_CONNECTOR_DATA_DIR
  || path.join(os.homedir(), '.merch-connector');

export const EVAL_DIR = path.join(BASE_DIR, 'evals');
const RUNS_DIR = path.join(EVAL_DIR, 'runs');

const COMPACT_MAX = 100;    // max compact records per domain (JSONL lines)
const FULL_RUN_MAX = 10;    // max full-run JSON files per domain

// Stop words for convergence tokenization
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'no','not','nor','in','on','at','to','for','of','and','or','but',
  'with','from','by','this','that','it','its','they','their','there',
  'very','more','most','also','too','very','just','only','such',
  'page','site','product','products','users','user','lack','missing',
]);

function ensureDirs() {
  if (!fs.existsSync(EVAL_DIR)) fs.mkdirSync(EVAL_DIR, { recursive: true });
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function domainKey(domain) {
  return domain.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function compactFilePath(domain) {
  return path.join(EVAL_DIR, `${domainKey(domain)}.jsonl`);
}

function runFilePath(runId) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

/**
 * Generate a stable, sortable run ID:
 *   <domain>_<yyyymmddThhmmss>_<6-char hash>
 * ISO timestamp prefix makes lexicographic sort = chronological sort.
 */
function generateRunId(domain, runAt) {
  const ts = runAt.replace(/[-:.Z]/g, '').slice(0, 15); // 20260319T143022
  const hash = crypto
    .createHash('sha256')
    .update(domain + runAt + Math.random())
    .digest('hex')
    .slice(0, 6);
  return `${domainKey(domain)}_${ts}_${hash}`;
}

/**
 * Compute a dedup hash from all available persona top concern strings.
 * Identical runs (same concerns across all present personas) produce the same hash.
 */
function computeHash(personas) {
  const concerns = [
    personas.floor_walker?.topConcern,
    personas.auditor?.topConcern,
    personas.scout?.topConcern,
    personas.b2b_auditor?.topConcern,
    personas.default?.diagnosisTitle,
  ].filter(Boolean).join('|');
  return crypto.createHash('sha256').update(concerns).digest('hex').slice(0, 8);
}

/**
 * Tokenize a concern string into meaningful keywords.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 3 && !STOP_WORDS.has(t));
}

/**
 * Extract the top concern string from any persona result, regardless of schema.
 * - floor_walker / auditor / scout / b2b_auditor → topConcern
 * - default analyst                              → diagnosisTitle (closest equivalent)
 *
 * @param {object|null} persona
 * @returns {string|null}
 */
export function extractTopConcern(persona) {
  if (!persona) return null;
  return persona.topConcern || persona.diagnosisTitle || null;
}

/**
 * Compute convergence score (0–100) from any combination of persona results.
 * Measures the percentage of top-concern keywords shared by two or more
 * personas — higher means stronger inter-persona consensus.
 *
 * Returns null when fewer than 2 personas have a top concern (can't measure
 * convergence with a single data point).
 *
 * Supported persona keys: floor_walker, auditor, scout, b2b_auditor, default
 *
 * @param {{ floor_walker?, auditor?, scout?, b2b_auditor?, default? }} personas
 * @returns {number|null} 0–100, or null if insufficient data
 */
export function computeConvergenceScore(personas) {
  const concerns = [
    personas.floor_walker?.topConcern,
    personas.auditor?.topConcern,
    personas.scout?.topConcern,
    personas.b2b_auditor?.topConcern,
    personas.default?.diagnosisTitle,
  ].filter(Boolean);

  if (concerns.length < 2) return null;

  const tokenSets = concerns.map(c => new Set(tokenize(c)));
  const allTokens = new Set(tokenSets.flatMap(s => [...s]));
  if (allTokens.size === 0) return null;

  let shared = 0;
  for (const token of allTokens) {
    if (tokenSets.filter(s => s.has(token)).length >= 2) shared++;
  }

  return Math.round((shared / allTokens.size) * 100);
}

/**
 * Describe a convergence score in plain English.
 * Returns null description for null scores (single-persona runs).
 */
export function describeConvergence(score) {
  if (score === null) return 'n/a — single persona run, convergence requires 2+';
  if (score >= 70) return 'strong — personas flagged the same core issues';
  if (score >= 40) return 'moderate — partial agreement; some concerns differ by persona';
  if (score >= 15) return 'low — personas identified mostly different concerns';
  return 'very low — personas saw almost no shared problems';
}

/**
 * Save an eval run.
 *
 * @param {string} domain
 * @param {{
 *   url: string,
 *   personas: { floor_walker?, auditor?, scout? },
 *   debate?: object,         // moderator result (may be null if still pending)
 *   toolName?: string,
 *   durationMs?: number,
 *   note?: string,
 *   saveFullRun?: boolean,
 *   pageContext?: object,    // { productCount, b2bMode, facetCount, platform }
 * }} opts
 * @returns {{ id, convergenceScore, hash, compactPath, fullRunPath }}
 */
export function saveEvalRun(domain, {
  url,
  personas = {},
  debate = null,
  toolName = 'merch_roundtable',
  durationMs = null,
  note = null,
  saveFullRun = true,
  pageContext = null,
} = {}) {
  ensureDirs();

  const runAt = new Date().toISOString();
  const id = generateRunId(domain, runAt);
  const hash = computeHash(personas);
  const convergenceScore = computeConvergenceScore(personas);

  // All named personas use topConcern; default analyst uses diagnosisTitle
  const topConcerns = [
    personas.floor_walker?.topConcern,
    personas.auditor?.topConcern,
    personas.scout?.topConcern,
    personas.b2b_auditor?.topConcern,
    personas.default?.diagnosisTitle,
  ].filter(Boolean);

  // Prefer moderator consensus from debate object (various shapes tolerated)
  const moderatorSummary = (
    debate?.consensus
    || debate?.moderator?.consensus
    || null
  );

  // ── Compact record (appended to JSONL) ────────────────────────────────────
  const compact = {
    id,
    domain,
    url,
    'mcp.tool.name': toolName,         // OTel MCP semantic convention
    runAt,
    durationMs: durationMs ?? null,
    personaCount: Object.values(personas).filter(Boolean).length,
    convergenceScore,
    convergenceLabel: describeConvergence(convergenceScore),
    topConcerns,
    moderatorSummary: moderatorSummary ? moderatorSummary.slice(0, 400) : null,
    note: note ?? null,
    judgeScore: null,                  // reserved for future LLM-as-judge pass
    hash,
  };

  const cPath = compactFilePath(domain);
  let records = [];
  if (fs.existsSync(cPath)) {
    records = fs.readFileSync(cPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  }

  // Skip exact duplicate (same content hash as last run — model re-calling save_eval)
  const isDuplicate = records.length > 0 && records[records.length - 1].hash === hash;
  if (!isDuplicate) {
    records.push(compact);
  }

  // Trim to retention limit
  if (records.length > COMPACT_MAX) records = records.slice(-COMPACT_MAX);
  fs.writeFileSync(cPath, records.map(r => JSON.stringify(r)).join('\n') + '\n');

  // ── Full run JSON ──────────────────────────────────────────────────────────
  let savedRunPath = null;
  if (saveFullRun && !isDuplicate) {
    const fullRun = {
      id,
      domain,
      url,
      'mcp.tool.name': toolName,
      runAt,
      durationMs: durationMs ?? null,
      convergenceScore,
      convergenceLabel: describeConvergence(convergenceScore),
      hash,
      note: note ?? null,
      pageContext: pageContext ?? null,
      floor_walker: personas.floor_walker ?? null,
      auditor: personas.auditor ?? null,
      scout: personas.scout ?? null,
      b2b_auditor: personas.b2b_auditor ?? null,
      default: personas.default ?? null,
      debate: debate ?? null,
      judgeScore: null,
    };

    const rPath = runFilePath(id);
    fs.writeFileSync(rPath, JSON.stringify(fullRun, null, 2));
    savedRunPath = rPath;

    // Enforce per-domain full-run retention
    const prefix = domainKey(domain) + '_';
    try {
      const existing = fs.readdirSync(RUNS_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
        .sort(); // lexicographic = chronological (ISO TS prefix)
      if (existing.length > FULL_RUN_MAX) {
        const toDelete = existing.slice(0, existing.length - FULL_RUN_MAX);
        for (const f of toDelete) {
          try { fs.unlinkSync(path.join(RUNS_DIR, f)); } catch { /* ignore */ }
        }
      }
    } catch { /* non-fatal */ }
  }

  return {
    id,
    convergenceScore,
    convergenceLabel: describeConvergence(convergenceScore),
    hash,
    isDuplicate,
    compactPath: cPath,
    fullRunPath: savedRunPath,
  };
}

/**
 * List saved eval runs for a domain (most recent first).
 *
 * @param {string} domain
 * @returns {object[]} compact records
 */
export function listEvalRuns(domain) {
  const cPath = compactFilePath(domain);
  if (!fs.existsSync(cPath)) return [];
  return fs.readFileSync(cPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .reverse(); // newest first
}

/**
 * Load a full eval run by ID. Returns null if not found.
 *
 * @param {string} runId
 * @returns {object|null}
 */
export function getEvalRun(runId) {
  const rPath = runFilePath(runId);
  if (!fs.existsSync(rPath)) return null;
  try { return JSON.parse(fs.readFileSync(rPath, 'utf8')); } catch { return null; }
}

/**
 * List all domains that have eval runs, with run counts and last run timestamps.
 *
 * @returns {{ domain, runCount, lastRunAt }[]}
 */
export function listEvalDomains() {
  ensureDirs();
  try {
    return fs.readdirSync(EVAL_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const filePath = path.join(EVAL_DIR, f);
        try {
          const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
          const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
          return {
            domain: last?.domain || f.replace(/\.jsonl$/, ''),
            runCount: lines.length,
            lastRunAt: last?.runAt || null,
            lastConvergenceScore: last?.convergenceScore ?? null,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.lastRunAt || '').localeCompare(a.lastRunAt || ''));
  } catch {
    return [];
  }
}
