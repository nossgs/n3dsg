import { Color3, Color4, DirectionalLight, HemisphericLight, Scene, ShadowGenerator, Vector3 } from '@babylonjs/core';
export function setupLighting(scene:Scene):ShadowGenerator {
 scene.clearColor=new Color4(0.60,0.68,0.69,1);scene.fogMode=Scene.FOGMODE_EXP2;
 scene.fogColor=new Color3(0.60,0.68,0.69);scene.fogDensity=0.006;
 const sky=new HemisphericLight('sky',Vector3.Up(),scene);sky.intensity=0.7;
 sky.diffuse=new Color3(0.86,0.93,1);sky.groundColor=new Color3(0.28,0.25,0.18);
 const sun=new DirectionalLight('sun',new Vector3(-0.6,-1,0.4),scene);
 sun.position=new Vector3(35,55,-25);sun.intensity=1.2;sun.diffuse=new Color3(1,0.91,0.77);
 sun.shadowMinZ=1;sun.shadowMaxZ=180;
 const shadows=new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=0.002;return shadows;
}
