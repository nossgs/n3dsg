import { Engine, Scene, UniversalCamera, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, ShadowGenerator } from '@babylonjs/core';
import './style.css';
import { showHomeScreen } from './home';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.57, 0.66, 0.72, 1);
scene.collisionsEnabled = true;
scene.gravity = new Vector3(0, -0.15, 0);
const camera = new UniversalCamera('player', new Vector3(0, 1.8, -8), scene);
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.speed = 0.3; camera.inertia = 0.1; camera.angularSensibility = 3500;
camera.minZ = 0.1; camera.checkCollisions = true; camera.applyGravity = true;
camera.ellipsoid = new Vector3(0.35, 0.9, 0.35);
camera.ellipsoidOffset = new Vector3(0, -0.9, 0);
let playing = false;
canvas.addEventListener('click', () => {
  if (playing) void canvas.requestPointerLock();
});
const ambient = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
ambient.intensity = 0.65;
const sun = new DirectionalLight('sun', new Vector3(-1, -2, 1), scene);
sun.position = new Vector3(20, 30, -20); sun.intensity = 1.1;
const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
const earth = new StandardMaterial('earth', scene);
earth.diffuseColor = new Color3(0.32, 0.36, 0.25); earth.specularColor = Color3.Black();
const ground = MeshBuilder.CreateGround('ground', { width: 100, height: 100 }, scene);
ground.material = earth; ground.checkCollisions = true; ground.receiveShadows = true;
const concrete = new StandardMaterial('concrete', scene);
concrete.diffuseColor = new Color3(0.55, 0.52, 0.46); concrete.specularColor = Color3.Black();
function wall(name: string, x: number, z: number, width: number, depth: number) {
  const mesh = MeshBuilder.CreateBox(name, {width, height: 3, depth}, scene);
  mesh.position.set(x, 1.5, z); mesh.material = concrete; mesh.checkCollisions = true;
  mesh.receiveShadows = true; shadows.addShadowCaster(mesh);
}
wall('back', 0, 8, 8, 0.3); wall('left', -4, 4, 0.3, 8); wall('right', 4, 4, 0.3, 8);
wall('front-left', -2.75, 0, 2.5, 0.3); wall('front-right', 2.75, 0, 2.5, 0.3);
showHomeScreen(() => {
  playing = true;
  camera.attachControl(canvas, true);
  canvas.focus();
  void canvas.requestPointerLock();
});
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
