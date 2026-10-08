import { Color3, MeshBuilder, Scene, ShadowGenerator, StandardMaterial } from '@babylonjs/core';
import { buildTerrain, groundHeight } from './terrain/terrain';
import { buildTrees } from './vegetation/treeFactory';
import { buildShelter } from './structures/evacuationShelter';
import { seededRandom } from './generation/random';
export function buildWorld(scene:Scene,shadows:ShadowGenerator):void {
 buildTerrain(scene);buildShelter(scene,shadows);buildTrees(scene,shadows);
 const random=seededRandom(80321);
 const mat=new StandardMaterial('stone',scene);mat.diffuseColor=new Color3(0.38,0.40,0.36);mat.specularColor=Color3.Black();
 const source=MeshBuilder.CreateIcoSphere('rock-source',{radius:1,subdivisions:1},scene);source.material=mat;source.isVisible=false;
 for(let i=0;i<90;i++){
 const x=(random()-0.5)*180,z=(random()-0.5)*180;if(Math.hypot(x,z-6)<15)continue;
 const rock=source.createInstance('rock-'+i);rock.position.set(x,groundHeight(x,z)-0.15,z);
 rock.scaling.set(0.35+random(),0.2+random()*0.5,0.35+random());rock.rotation.y=random()*6.28;
 }
}
