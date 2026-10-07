import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3, VertexData, ShadowGenerator } from '@babylonjs/core';
const SIZE = 384, CELLS = 96, STEP = SIZE / CELLS;
let seed = 27491;
function random(): number { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function elevation(x: number, z: number): number {
  const r = Math.hypot(x, z - 6);
  const t = Math.max(0, Math.min(1, (r - 15) / 32));
  return (Math.sin(x / 29) * 3 + Math.cos(z / 37) * 3 + Math.sin((x + z) / 13) * 0.6) * t * t * (3 - 2 * t);
}
// Interpolate the same triangles used by the visible ground, not a different smooth surface.
export function groundHeight(x: number, z: number): number {
  const gx = Math.max(0, Math.min(CELLS - 0.00001, (x + SIZE / 2) / STEP));
  const gz = Math.max(0, Math.min(CELLS - 0.00001, (z + SIZE / 2) / STEP));
  const col = Math.floor(gx), row = Math.floor(gz), u = gx - col, v = gz - row;
  const px = col * STEP - SIZE / 2, pz = row * STEP - SIZE / 2;
  const a = elevation(px, pz), b = elevation(px + STEP, pz);
  const c = elevation(px, pz + STEP), d = elevation(px + STEP, pz + STEP);
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - v) * (b - d) + (1 - u) * (c - d);
}
export const WORLD_BOUNDARY = SIZE / 2 - 3;
export function buildForest(scene: Scene, shadows: ShadowGenerator): void {
  seed = 27491;
  function material(name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene); m.diffuseColor = color; m.specularColor = Color3.Black(); return m;
  }
  const soil = material('forest-floor', Color3.White());
  const bark = material('bark', new Color3(0.23, 0.17, 0.12));
  const needles = material('needles', new Color3(0.12, 0.24, 0.13));
  const wood = material('weathered-siding', new Color3(0.39, 0.35, 0.27));
  const roof = material('roof-metal', new Color3(0.19, 0.23, 0.22));
  const trim = material('shelter-trim', new Color3(0.24, 0.23, 0.19));
  const rockMat = material('stone', new Color3(0.38, 0.40, 0.36));
  const pos: number[] = [], idx: number[] = [], colors: number[] = [];
  for (let row = 0; row <= CELLS; row++) for (let col = 0; col <= CELLS; col++) {
    const x = col * STEP - SIZE / 2, z = row * STEP - SIZE / 2;
    pos.push(x, elevation(x, z), z);
    const track = Math.abs(x) < 2.7 && z < 0;
    const clearing = Math.hypot(x, z - 6) < 14;
    const shade = random() * 0.045;
    const color = track ? [0.36, 0.29, 0.20] : clearing ? [0.28, 0.30, 0.20] : [0.20, 0.25, 0.16];
    colors.push(color[0] + shade, color[1] + shade, color[2] + shade, 1);
    if (row < CELLS && col < CELLS) {
      const a = row * (CELLS + 1) + col, b = a + 1, c = a + CELLS + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const normals: number[] = []; VertexData.ComputeNormals(pos, idx, normals);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.colors = colors; vd.normals = normals;
  const ground = new Mesh('local-terrain', scene); vd.applyToMesh(ground);
  ground.material = soil; soil.backFaceCulling = false; ground.receiveShadows = true;
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: StandardMaterial, collision = true): Mesh {
    const mesh = MeshBuilder.CreateBox(name, {width:w, height:h, depth:d}, scene);
    mesh.position.set(x, y, z); mesh.material = mat; mesh.checkCollisions = collision;
    mesh.receiveShadows = true; shadows.addShadowCaster(mesh); mesh.computeWorldMatrix(true); return mesh;
  }
  // Open entrance and open window apertures; a low roof encloses the interior.
  box('rear-wall',0,1.5,10,8,3,0.22,wood);
  box('left-wall',-4,1.5,6,0.22,3,8,wood);
  box('right-wall-lower',4,0.6,6,0.22,1.2,8,wood);
  box('right-wall-upper',4,2.6,6,0.22,0.8,8,wood);
  box('right-wall-front',4,1.7,3,0.22,1,2,wood);
  box('right-wall-back',4,1.7,9,0.22,1,2,wood);
  box('front-left',-2.6,1.5,2,2.8,3,0.22,wood);
  box('front-right',2.6,1.5,2,2.8,3,0.22,wood);
  box('door-lintel',0,2.7,2,2.4,0.6,0.22,wood);
  box('roof',0,3.18,6,8.8,0.3,9,roof);
  box('threshold',0,0.045,2,2.4,0.09,0.6,trim,false);
  box('table-top',-2,0.8,7,1.7,0.1,0.8,wood);
  for (const x of [-2.65,-1.35]) for(const z of [6.72,7.28]) box('table-leg',x,0.4,z,0.09,0.8,0.09,trim,false);
  box('bunk-frame',2.4,0.4,8,1.1,0.2,2.1,trim);
  const fabric = material('bedroll',new Color3(0.29,0.34,0.25));
  box('bedroll',2.4,0.57,8,0.95,0.14,1.9,fabric,false);
  box('storage-crate',-2.8,0.4,4,0.8,0.8,0.8,wood);
  // A small set of reusable stylized conifers; this pass uses geometric foliage, not leaf textures.
  const templates: Mesh[] = [];
  for(let variant=0;variant<4;variant++) {
    const pieces: Mesh[] = [];
    const height = 10 + variant * 1.8;
    const trunk = MeshBuilder.CreateCylinder('trunk-template', {height, diameterTop:0.16,diameterBottom:0.58,tessellation:7},scene);
    trunk.position.y=height/2; trunk.material=bark; pieces.push(trunk);
    for(let layer=0;layer<5;layer++) {
      const tier = MeshBuilder.CreateCylinder('foliage-template',{height:height*0.32,diameterTop:0,diameterBottom:(5-layer*0.65)*(1+variant*0.05),tessellation:9},scene);
      tier.position.set((random()-0.5)*0.3,height*0.36+layer*height*0.12,(random()-0.5)*0.3);
      tier.rotation.y=random()*Math.PI; tier.material=needles; pieces.push(tier);
    }
    const merged=Mesh.MergeMeshes(pieces,true,true,undefined,false,true)!;
    merged.name='conifer-source-'+variant; merged.isVisible=false; templates.push(merged);
  }
  for(let i=0;i<260;i++) {
    const x=(random()-0.5)*340,z=(random()-0.5)*340;
    if(Math.hypot(x,z-6)<19 || (Math.abs(x)<4 && z<2)) continue;
    const tree=templates[i%templates.length].createInstance('tree-'+i);
    tree.position.set(x,groundHeight(x,z),z);
    const scale=0.75+random()*0.65;tree.scaling.setAll(scale);tree.rotation.y=random()*Math.PI*2;
    if(Math.hypot(x,z)<65) {
      shadows.addShadowCaster(tree);
      const collider=MeshBuilder.CreateBox('trunk-collider',{width:0.5*scale,depth:0.5*scale,height:8*scale},scene);
      collider.position.set(x,groundHeight(x,z)+4*scale,z);collider.isVisible=false;collider.isPickable=false;collider.checkCollisions=true;collider.computeWorldMatrix(true);
    }
  }
  const rockSource=MeshBuilder.CreateIcoSphere('rock-source',{radius:1,subdivisions:1},scene);rockSource.material=rockMat;rockSource.isVisible=false;
  for(let i=0;i<90;i++) {
    const x=(random()-0.5)*180,z=(random()-0.5)*180;
    if(Math.hypot(x,z-6)<15)continue;
    const rock=rockSource.createInstance('rock-'+i);rock.position.set(x,groundHeight(x,z)-0.15,z);
    rock.scaling.set(0.35+random(),0.2+random()*0.5,0.35+random());rock.rotation.y=random()*6.28;
  }
}
