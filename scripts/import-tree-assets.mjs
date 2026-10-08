import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'public/assets/trees');
const asset = 'pine_tree_01';
async function request(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !(/(^|\.)polyhaven\.(com|org)$/.test(parsed.hostname))) throw new Error(`Unexpected host: ${parsed.hostname}`);
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'n3dsg-tree-importer/1.0' }, signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return response;
    } catch (error) { last = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000)); }
  }
  throw last;
}
const metadata = await (await request(`https://api.polyhaven.com/files/${asset}`)).json();
function collect(value, path = [], records = []) {
  if (!value || typeof value !== 'object') return records;
  if (typeof value.url === 'string') records.push({ ...value, path });
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') collect(child, [...path, key], records);
  return records;
}
const records = collect(metadata);
const models = records.filter(entry => /\.(gltf|glb)(?:\?|$)/i.test(entry.url));
function score(entry) {
  return (entry.path.includes('1k') ? 100 : entry.path.includes('2k') ? 50 : 0) + (/\.gltf(?:\?|$)/i.test(entry.url) ? 10 : 0);
}
models.sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url));
const selected = models[0];
if (!selected) throw new Error(`No glTF/GLB export found. Available API keys: ${Object.keys(metadata).join(', ')}`);
await mkdir(destination, { recursive: true });
const sourceURL = new URL(selected.url);
const modelName = sourceURL.pathname.split('/').pop();
const modelFolder = resolve(destination, asset, 'model');
await mkdir(modelFolder, { recursive: true });
const files = [];
function safePath(path) {
  const target = resolve(modelFolder, path);
  const rel = relative(destination, target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Unsafe model dependency: ${path}`);
  return target;
}
async function save(url, target, expectedMD5) {
  const bytes = Buffer.from(await (await request(url)).arrayBuffer());
  if (!bytes.length) throw new Error(`Empty file: ${url}`);
  const md5 = createHash('md5').update(bytes).digest('hex');
  if (expectedMD5 && expectedMD5 !== md5) throw new Error(`Checksum mismatch: ${url}`);
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  const path = relative(destination, target).replaceAll('\\', '/');
  files.push({ path, url, bytes: bytes.length, md5 }); console.log(`${path}: ${bytes.length} bytes`);
  return bytes;
}
const modelBytes = await save(selected.url, safePath(modelName), selected.md5);
const includes = collect(selected.include ?? {});
async function dependency(uri) {
  if (uri.startsWith('data:')) return;
  if (/^[a-z]+:/i.test(uri)) throw new Error(`External URI in glTF: ${uri}`);
  const filename = decodeURIComponent(uri.split('/').pop());
  const direct = includes.find(entry => entry.path.join('/') === uri);
  const candidates = (includes.length ? includes : records).filter(entry => decodeURIComponent(new URL(entry.url).pathname.split('/').pop()) === filename);
  const entry = direct ?? candidates.find(item => item.path.includes('1k')) ?? (candidates.length === 1 ? candidates[0] : undefined);
  const url = entry?.url ?? new URL(uri, sourceURL).href;
  await save(url, safePath(decodeURIComponent(uri)), entry?.md5);
}
let document;
if (/\.gltf$/i.test(modelName)) document = JSON.parse(modelBytes.toString('utf8'));
else {
  if (modelBytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB header');
  let offset = 12;
  while (offset + 8 <= modelBytes.length) {
    const length = modelBytes.readUInt32LE(offset), type = modelBytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) { document = JSON.parse(modelBytes.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/, '')); break; }
    offset += 8 + length;
  }
  if (!document) throw new Error('GLB has no JSON chunk');
}
const uris = new Set([...(document.buffers ?? []), ...(document.images ?? [])].map(item => item.uri).filter(Boolean));
for (const uri of uris) await dependency(uri);
const manifest = { license: 'CC0-1.0', trees: { pine: { asset, file: `${asset}/model/${modelName}`, source: `https://polyhaven.com/a/${asset}`, files } } };
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(destination, 'ASSET-SOURCES.txt'), `Poly Haven — CC0-1.0\nhttps://polyhaven.com/a/${asset}\n`);
console.log(`Imported ${files.length} model/dependency files; ${files.reduce((total, file) => total + file.bytes, 0)} total bytes.`);
