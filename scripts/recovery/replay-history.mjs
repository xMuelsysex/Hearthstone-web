import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = '/home/muelsyse/code/Hearthstone-web';
const candidateRoot = process.argv[2] ?? '/home/muelsyse/code/Hearthstone-web.candidate';
const historyPath = process.argv[3] ?? '/home/muelsyse/.pi/agent/sessions/--home-muelsyse-code-Hearthstone-web--/2026-08-23T15-46-37-267Z_01a02f4d-6852-7d06-a9b5-2df481a9e31a.jsonl';
const manifestOnly = process.argv.includes('--manifest-only');

const maintainable = (absolutePath) => {
  if (!absolutePath.startsWith(`${repoRoot}/`)) return false;
  const relative = absolutePath.slice(repoRoot.length + 1);
  return !relative.startsWith('.pi/')
    && !relative.startsWith('.workflow/')
    && !relative.startsWith('tmp/')
    && relative !== 'tmp';
};

const relativePath = (absolutePath) => absolutePath.slice(repoRoot.length + 1);
const readJsonLines = (filePath) => fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const history = readJsonLines(historyPath);
const calls = new Map();
const results = new Map();
const orderedCalls = [];

for (const [lineNumber, record] of history.entries()) {
  if (record.type !== 'message') continue;
  const message = record.message ?? {};
  const content = Array.isArray(message.content) ? message.content : [];
  for (const part of content) {
    if (part.type === 'toolCall' && (part.name === 'write' || part.name === 'edit')) {
      const call = { lineNumber, id: part.id, name: part.name, arguments: part.arguments ?? {} };
      calls.set(part.id, call);
      orderedCalls.push(call);
    }
    if (part.type === 'toolResult') {
      results.set(part.toolCallId, part);
    }
  }
  if (message.role === 'toolResult' && typeof message.toolCallId === 'string') {
    results.set(message.toolCallId, message);
  }
}

const resultText = (result) => {
  if (!result) return '';
  if (Array.isArray(result.content)) return result.content.map((item) => item.text ?? '').join('\n');
  return String(result.content ?? '');
};
const succeeded = (call) => {
  const result = results.get(call.id);
  if (!result || result.isError) return false;
  const text = resultText(result);
  if (call.name === 'write') return !/no changes were written|Could not write|failed/i.test(text);
  return /Successfully replaced/.test(text) && !/no changes were written|Could not find edits|Found .* occurrences/i.test(text);
};

const files = new Map();
const evidence = new Map();
const failures = [];
const applyEdit = (current, edits, filePath) => {
  const replacements = [];
  for (const edit of edits) {
    const oldText = String(edit.oldText ?? '');
    const newText = String(edit.newText ?? '');
    if (oldText === newText) continue;
    const occurrence = Number.isInteger(edit.occurrence) ? edit.occurrence : 1;
    let from = 0;
    let start = -1;
    for (let i = 0; i < occurrence; i += 1) {
      start = current.indexOf(oldText, from);
      if (start < 0) break;
      from = start + oldText.length;
    }
    if (start < 0) {
      throw new Error(`replay edit not found: ${filePath}, occurrence ${occurrence}`);
    }
    replacements.push({ start, end: start + oldText.length, newText });
  }
  replacements.sort((a, b) => b.start - a.start);
  let next = current;
  for (const replacement of replacements) {
    next = `${next.slice(0, replacement.start)}${replacement.newText}${next.slice(replacement.end)}`;
  }
  return next;
};

for (const call of orderedCalls) {
  const absolutePath = call.arguments.path;
  if (typeof absolutePath !== 'string' || !maintainable(absolutePath)) continue;
  const relative = relativePath(absolutePath);
  if (!succeeded(call)) {
    if (call.name === 'edit') failures.push({ lineNumber: call.lineNumber, path: relative, id: call.id, reason: resultText(results.get(call.id)).slice(0, 300) });
    continue;
  }
  if (call.name === 'write') {
    files.set(relative, String(call.arguments.content ?? ''));
    evidence.set(relative, { firstWriteLine: call.lineNumber, writeCallId: call.id });
    continue;
  }
  if (!files.has(relative)) {
    throw new Error(`edit before source write: ${relative} at history line ${call.lineNumber}`);
  }
  files.set(relative, applyEdit(files.get(relative), call.arguments.edits ?? [], relative));
}

if (!manifestOnly) {
  for (const [relative, content] of files) {
    const target = path.join(candidateRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
}

const historyHash = crypto.createHash('sha256').update(fs.readFileSync(historyPath)).digest('hex');
const manifest = {
  schema: 'source-confirmation.v1',
  generatedAt: new Date().toISOString(),
  historyPath,
  historySha256: historyHash,
  sourceBatch: [...files.keys()].sort().map((relative) => ({
    pathOrModule: relative,
    sourceKind: 'VERIFIED_SOURCE',
    evidencePath: `${historyPath}:successful-write-edit-sequence`,
    evidenceHash: historyHash,
    confidence: 'high',
    allowedAction: 'restore-final-historical-snapshot',
    preHash: null,
    proposedWrite: true,
    proposedDiff: 'Replay successful historical write/edit calls into sibling candidate',
    decisionRefs: ['approved-M0-M4-plan', 'M0.1-source-recovery-batch'],
  })),
  newRecoveryTools: [
    'scripts/recovery/replay-history.mjs',
    'scripts/recovery/capture-tree-manifest.mjs',
    'scripts/recovery/compare-tree-manifest.mjs',
  ].map((relative) => ({
    pathOrModule: relative,
    sourceKind: 'NEW',
    evidencePath: null,
    evidenceHash: null,
    confidence: 'high',
    allowedAction: 'recovery-tooling-only',
    preHash: null,
    proposedWrite: true,
    proposedDiff: 'Candidate-only evidence and recovery tooling',
    decisionRefs: ['approved-M0-M4-plan', 'M0.1-source-recovery-batch'],
  })),
  skippedFailedEdits: failures,
};
const manifestPath = path.join(candidateRoot, '.artifacts/manifests/source-confirmation.v1.json');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ files: files.size, historyHash, failedEdits: failures.length, manifestPath }, null, 2));
