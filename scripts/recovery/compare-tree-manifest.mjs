import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const beforePath = valueFor('--before');
const root = path.resolve(valueFor('--root') ?? process.cwd());
if (!beforePath) throw new Error('--before is required');
const before = JSON.parse(fs.readFileSync(path.resolve(beforePath), 'utf8'));
const hashFile = async (filePath) => {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
};
const entries = [];
const visit = async (absolutePath, relativePath) => {
  const stat = await fs.promises.lstat(absolutePath);
  const type = stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other';
  const entry = { path: relativePath || '.', type };
  if (type === 'symlink') entry.target = await fs.promises.readlink(absolutePath);
  if (type === 'file') {
    entry.size = stat.size;
    entry.sha256 = await hashFile(absolutePath);
  }
  entries.push(entry);
  if (type !== 'directory') return;
  for (const child of (await fs.promises.readdir(absolutePath)).sort()) {
    await visit(path.join(absolutePath, child), relativePath ? path.posix.join(relativePath, child) : child);
  }
};
await visit(root, '');
entries.sort((a, b) => a.path.localeCompare(b.path));
const current = { schema: 'tree-manifest.v1', root, entries };
const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry]));
const currentByPath = new Map(current.entries.map((entry) => [entry.path, entry]));
const changes = [];
for (const [entryPath, entry] of beforeByPath) {
  const next = currentByPath.get(entryPath);
  if (!next) changes.push({ path: entryPath, kind: 'removed', before: entry });
  else if (JSON.stringify(entry) !== JSON.stringify(next)) changes.push({ path: entryPath, kind: 'changed', before: entry, current: next });
}
for (const [entryPath, entry] of currentByPath) {
  if (!beforeByPath.has(entryPath)) changes.push({ path: entryPath, kind: 'added', current: entry });
}
if (changes.length) {
  console.error(JSON.stringify({ ok: false, changes }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, entries: entries.length }, null, 2));
}
