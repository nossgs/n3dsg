import { Color3, MeshBuilder, Scene, ShadowGenerator, StandardMaterial } from '@babylonjs/core';
export function buildShelter(scene:Scene,shadows:ShadowGenerator):void {
 function material(name:string,color:Color3){const m=new StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=Color3.Black();return m;}
 const wood=material('siding',new Color3(0.39,0.35,0.27)),roof=material('roof',new Color3(0.19,0.23,0.22)),trim=material('trim',new Color3(0.24,0.23,0.19));
 function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:StandardMaterial,collision=true){
 const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.material=mat;mesh.checkCollisions=collision;mesh.receiveShadows=true;shadows.addShadowCaster(mesh);mesh.computeWorldMatrix(true);}
 box('rear-wall',0,1.5,10,8,3,0.22,wood);box('left-wall',-4,1.5,6,0.22,3,8,wood);
 box('right-lower',4,0.6,6,0.22,1.2,8,wood);box('right-upper',4,2.6,6,0.22,0.8,8,wood);
 box('right-front',4,1.7,3,0.22,1,2,wood);box('right-back',4,1.7,9,0.22,1,2,wood);
 box('front-left',-2.6,1.5,2,2.8,3,0.22,wood);box('front-right',2.6,1.5,2,2.8,3,0.22,wood);
 box('lintel',0,2.7,2,2.4,0.6,0.22,wood);box('roof',0,3.18,6,8.8,0.3,9,roof);
 box('threshold',0,0.045,2,2.4,0.09,0.6,trim,false);box('table-top',-2,0.8,7,1.7,0.1,0.8,wood);
 for(const x of [-2.65,-1.35])for(const z of [6.72,7.28])box('table-leg',x,0.4,z,0.09,0.8,0.09,trim,false);
 box('bunk',2.4,0.4,8,1.1,0.2,2.1,trim);
 box('bedroll',2.4,0.57,8,0.95,0.14,1.9,material('fabric',new Color3(0.29,0.34,0.25)),false);
 box('crate',-2.8,0.4,4,0.8,0.8,0.8,wood);
}
