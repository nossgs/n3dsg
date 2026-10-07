import './style.css';

import {
  Engine,
  Scene,
  UniversalCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
} from '@babylonjs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const errorPanel = document.querySelector<HTMLPreElement>('#error')!;

document.querySelector<HTMLElement>('#title')!.textContent =
  document.title;

function reportError(error: unknown): void {
  errorPanel.hidden = false;

  errorPanel.textContent =
    error instanceof Error
      ? error.stack ?? error.message
      : String(error);

  console.error(error);
}

window.addEventListener('error', event => {
  reportError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', event => {
  reportError(event.reason);
});

try {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  scene.clearColor = new Color4(0.48, 0.62, 0.76, 1);
  scene.collisionsEnabled = true;

  const camera = new UniversalCamera(
    'camera',
    new Vector3(0, 1.8, -12),
    scene,
  );

  camera.setTarget(new Vector3(0, 1.8, 0));
  camera.attachControl(canvas, true);

  camera.keysUp = [87];
  camera.keysDown = [83];
  camera.keysLeft = [65];
  camera.keysRight = [68];

  camera.speed = 0.35;
  camera.inertia = 0.2;
  camera.minZ = 0.1;
  camera.checkCollisions = true;
  camera.ellipsoid = new Vector3(0.4, 0.85, 0.4);

  const ambient = new HemisphericLight(
    'ambient',
    new Vector3(0, 1, 0),
    scene,
  );

  ambient.intensity = 0.75;

  const sun = new DirectionalLight(
    'sun',
    new Vector3(-1, -2, 1),
    scene,
  );

  sun.intensity = 0.65;

  function material(
    name: string,
    color: Color3,
  ): StandardMaterial {
    const result = new StandardMaterial(name, scene);

    result.diffuseColor = color;
    result.specularColor = new Color3(0.05, 0.05, 0.05);

    return result;
  }

  const ground = MeshBuilder.CreateGround(
    'ground',
    {
      width: 60,
      height: 60,
    },
    scene,
  );

  ground.material = material(
    'groundMaterial',
    new Color3(0.28, 0.32, 0.26),
  );

  ground.checkCollisions = true;

  const concrete = material(
    'concrete',
    new Color3(0.53, 0.54, 0.52),
  );

  const blocks = [
    [0, -4, 0, 2],
    [1, 4, 3, 3],
    [2, 0, 9, 4],
  ];

  for (const [index, x, z, height] of blocks) {
    const block = MeshBuilder.CreateBox(
      `block${index}`,
      {
        width: 3,
        depth: 3,
        height,
      },
      scene,
    );

    block.position.set(x, height / 2, z);
    block.material = concrete;
    block.checkCollisions = true;
  }

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });
} catch (error) {
  reportError(error);
}