import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/assets/forest');
async function request(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'n3dsg-forest-assets/1.0' },
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
const json = async url => (await request(url)).json();
await mkdir(output, { recursive: true });
const catalog = await json('https://api.polyhaven.com/assets?t=textures');
const candidates = Object.entries(catalog).map(([id, data]) => {
  const text = `${id} ${data.name ?? ''} ${JSON.stringify(data.categories ?? [])} ${JSON.stringify(data.tags ?? [])}`.toLowerCase();
  return { id, text, score: (text.includes('soil') ? 5 : 0) + (text.includes('floor') ? 2 : 0) };
}).filter(item => item.text.includes('forest')).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
const soil = process.env.N3DSG_SOIL_ASSET || candidates[0]?.id;
if (!soil) throw new Error('No forest-floor texture found in Poly Haven catalog.');
const manifest = { license: 'CC0-1.0', materials: {} };
for (const [key, asset] of Object.entries({ soil, bark: 'pine_bark' })) {
  const metadata = await json(`https://api.polyhaven.com/files/${encodeURIComponent(asset)}`);
  const maps = {}, provenance = {};
  for (const [name, map] of [['albedo', 'diff'], ['normal', 'nor_gl'], ['roughness', 'rough']]) {
    const formats = metadata[map]?.['1k'];
    const entry = formats?.png ?? formats?.jpg;
    if (!entry?.url) throw new Error(`${asset}: required 1k ${map} map missing`);
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || !(url.hostname === 'polyhaven.org' || url.hostname.endsWith('.polyhaven.org'))) throw new Error(`Unexpected texture host: ${url.hostname}`);
    const ext = url.pathname.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const path = `${key}/${name}.${ext}`;
    const bytes = Buffer.from(await (await request(url.href)).arrayBuffer());
    if (!bytes.length) throw new Error(`Empty texture: ${path}`);
    const md5 = createHash('md5').update(bytes).digest('hex');
    if (entry.md5 && md5 !== entry.md5) throw new Error(`Checksum mismatch: ${path}`);
    await mkdir(resolve(output, key), { recursive: true });
    await writeFile(resolve(output, path), bytes);
    maps[name] = path; provenance[name] = { url: url.href, md5, bytes: bytes.length };
    console.log(`Downloaded ${asset}: ${path} (${bytes.length} bytes)`);
  }
  manifest.materials[key] = { asset, source: `https://polyhaven.com/a/${asset}`, maps, provenance };
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(resolve(output, 'ASSET-SOURCES.txt'), 'Poly Haven — CC0-1.0\n' + Object.values(manifest.materials).map(m => m.source).join('\n'));
