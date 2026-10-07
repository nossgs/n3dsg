import { Engine, Scene, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, ShadowGenerator } from '@babylonjs/core';
import './style.css';
import { showHomeScreen } from './home';
import { createPlayer } from './player';
import { createTerrain } from './terrain';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.57, 0.66, 0.72, 1);
scene.collisionsEnabled = true;
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.57, 0.66, 0.72);
scene.fogDensity = 0.00065;
const ambient = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
ambient.intensity = 0.65;
const sun = new DirectionalLight('sun', new Vector3(-1, -2, 1), scene);
sun.position = new Vector3(20, 30, -20); sun.intensity = 1.1;
const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
createTerrain(scene);
const concrete = new StandardMaterial('concrete', scene);
concrete.diffuseColor = new Color3(0.55, 0.52, 0.46); concrete.specularColor = Color3.Black();
function wall(name: string, x: number, z: number, width: number, depth: number) {
  const mesh = MeshBuilder.CreateBox(name, { width, height: 3, depth }, scene);
  mesh.position.set(x, 1.5, z); mesh.material = concrete; mesh.checkCollisions = true;
  mesh.receiveShadows = true; shadows.addShadowCaster(mesh);
}
wall('back', 0, 8, 8, 0.3); wall('left', -4, 4, 0.3, 8); wall('right', 4, 4, 0.3, 8);
wall('front-left', -2.75, 0, 2.5, 0.3); wall('front-right', 2.75, 0, 2.5, 0.3);
const player = createPlayer(scene, canvas);
const hint = document.getElementById('hint');
if (hint) hint.textContent = 'WASD: move · Shift: sprint · Space: jump · Mouse: look · Esc: release mouse';
showHomeScreen(() => player.start());
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
