import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const valueFor = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = path.resolve(valueFor('--root', process.cwd()));
const output = path.resolve(valueFor('--output', path.join(process.cwd(), '.artifacts/manifests/tree.json')));
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
  const children = (await fs.promises.readdir(absolutePath)).sort();
  for (const child of children) {
    const childRelative = relativePath ? path.posix.join(relativePath, child) : child;
    await visit(path.join(absolutePath, child), childRelative);
  }
};
await visit(root, '');
entries.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schema: 'tree-manifest.v1',
  root,
  capturedAt: new Date().toISOString(),
  entries,
};
await fs.promises.mkdir(path.dirname(output), { recursive: true });
await fs.promises.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ root, output, entries: entries.length }, null, 2));
