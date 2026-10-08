import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/assets/forest');

const selected = {
  soil: 'forest_ground_05',
  dirt: 'brown_mud',
  bark: 'pine_bark'
};

async function request(url) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'n3dsg-forest-assets/1.1'
        },
        signal: AbortSignal.timeout(120000)
      });

      if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, 1500 * (attempt + 1))
        );
      }
    }
  }

  throw lastError;
}

await mkdir(output, { recursive: true });

const manifest = {
  license: 'CC0-1.0',
  resolution: '1k',
  materials: {}
};

for (const [key, asset] of Object.entries(selected)) {
  const response = await request(
    `https://api.polyhaven.com/files/${asset}`
  );

  const metadata = await response.json();
  const maps = {};
  const provenance = {};

  const mapTypes = [
    ['albedo', 'Diffuse'],
    ['normal', 'nor_gl'],
    ['roughness', 'Rough']
  ];

  for (const [name, map] of mapTypes) {
    const formats = metadata[map]?.['1k'];

    const entry = name === 'normal'
      ? (formats?.png ?? formats?.jpg)
      : (formats?.jpg ?? formats?.png);

    if (!entry?.url) {
      throw new Error(
        `${asset}: missing 1k ${map}. ` +
        `Available map keys: ${Object.keys(metadata).join(', ')}`
      );
    }

    const url = new URL(entry.url);

    const allowedHost =
      url.hostname === 'polyhaven.org' ||
      url.hostname.endsWith('.polyhaven.org');

    if (url.protocol !== 'https:' || !allowedHost) {
      throw new Error(`Unexpected texture host: ${url.hostname}`);
    }

    const extension = url.pathname.toLowerCase().endsWith('.png')
      ? 'png'
      : 'jpg';

    const relative = `${key}/${name}.${extension}`;

    const download = await request(url.href);
    const bytes = Buffer.from(await download.arrayBuffer());

    if (!bytes.length) {
      throw new Error(`Empty download: ${relative}`);
    }

    const md5 = createHash('md5')
      .update(bytes)
      .digest('hex');

    if (entry.md5 && md5 !== entry.md5) {
      throw new Error(`Checksum mismatch: ${relative}`);
    }

    await mkdir(resolve(output, key), { recursive: true });
    await writeFile(resolve(output, relative), bytes);

    maps[name] = relative;

    provenance[name] = {
      url: url.href,
      bytes: bytes.length,
      md5
    };

    console.log(`${asset}: ${relative} (${bytes.length} bytes)`);
  }

  manifest.materials[key] = {
    asset,
    source: `https://polyhaven.com/a/${asset}`,
    maps,
    provenance
  };
}

await writeFile(
  resolve(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

await writeFile(
  resolve(output, 'ASSET-SOURCES.txt'),
  'Poly Haven — CC0-1.0\n' +
  Object.values(manifest.materials)
    .map(material => material.source)
    .join('\n') +
  '\n'
);