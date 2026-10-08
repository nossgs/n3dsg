import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/assets/forest');

async function request(url) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'n3dsg-forest-assets/1.2'
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

async function json(url) {
  return (await request(url)).json();
}

await mkdir(output, { recursive: true });

const manifest = {
  license: 'CC0-1.0',
  resolution: '1k',
  materials: {}
};

async function saveMap(
  metadata,
  asset,
  key,
  name,
  map,
  preferPNG = false
) {
  const formats = metadata[map]?.['1k'];

  const entry = preferPNG
    ? (formats?.png ?? formats?.jpg)
    : (formats?.jpg ?? formats?.png);

  if (!entry?.url) {
    throw new Error(
      `${asset}: missing 1k ${map}. ` +
      `Available keys: ${Object.keys(metadata).join(', ')}`
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

  const response = await request(url.href);
  const bytes = Buffer.from(await response.arrayBuffer());

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

  console.log(`${asset}: ${relative} (${bytes.length} bytes)`);

  return {
    path: relative,
    provenance: {
      url: url.href,
      bytes: bytes.length,
      md5
    }
  };
}

const surfaceAssets = {
  soil: 'forest_ground_05',
  dirt: 'brown_mud',
  bark: 'pine_bark'
};

for (const [key, asset] of Object.entries(surfaceAssets)) {
  const metadata = await json(
    `https://api.polyhaven.com/files/${asset}`
  );

  const maps = {};
  const provenance = {};

  const mapTypes = [
    ['albedo', 'Diffuse'],
    ['normal', 'nor_gl'],
    ['roughness', 'Rough']
  ];

  for (const [name, map] of mapTypes) {
    const saved = await saveMap(
      metadata,
      asset,
      key,
      name,
      map,
      name === 'normal'
    );

    maps[name] = saved.path;
    provenance[name] = saved.provenance;
  }

  manifest.materials[key] = {
    asset,
    source: `https://polyhaven.com/a/${asset}`,
    maps,
    provenance
  };
}

const foliageAsset = 'pine_tree_01';

const foliageMetadata = await json(
  `https://api.polyhaven.com/files/${foliageAsset}`
);

function twigKey(type) {
  const keys = Object.keys(foliageMetadata)
    .filter(key => {
      const normalized = key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const matchesType = type === 'albedo'
        ? /diff|albedo|basecolor/.test(normalized)
        : /alpha|opacity/.test(normalized);

      return normalized.includes('twig') && matchesType;
    })
    .filter(key => foliageMetadata[key]?.['1k']);

  if (keys.length !== 1) {
    throw new Error(
      `Cannot uniquely find Twig ${type} at 1k. ` +
      `Candidates: ${keys.join(', ')}. ` +
      `All keys: ${Object.keys(foliageMetadata).join(', ')}`
    );
  }

  return keys[0];
}

const foliageMaps = {};
const foliageProvenance = {};

for (const name of ['albedo', 'alpha']) {
  const saved = await saveMap(
    foliageMetadata,
    foliageAsset,
    'foliage',
    name,
    twigKey(name),
    name === 'alpha'
  );

  foliageMaps[name] = saved.path;
  foliageProvenance[name] = saved.provenance;
}

manifest.materials.foliage = {
  asset: foliageAsset,
  source: `https://polyhaven.com/a/${foliageAsset}`,
  maps: foliageMaps,
  provenance: foliageProvenance
};

await writeFile(
  resolve(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

const sources = [
  ...new Set(
    Object.values(manifest.materials)
      .map(material => material.source)
  )
];

await writeFile(
  resolve(output, 'ASSET-SOURCES.txt'),
  'Poly Haven — CC0-1.0\n' + sources.join('\n') + '\n'
);