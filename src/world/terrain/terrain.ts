import { Color3, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
export const WORLD_BOUNDARY = 189;
const SIZE=384, CELLS=96, STEP=4;
function elevation(x:number,z:number):number {
 const t=Math.max(0,Math.min(1,(Math.hypot(x,z-6)-15)/32));
 return (Math.sin(x/29)*3+Math.cos(z/37)*3+Math.sin((x+z)/13)*0.6)*t*t*(3-2*t);
}
export function groundHeight(x:number,z:number):number {
 const gx=Math.max(0,Math.min(CELLS-0.00001,(x+SIZE/2)/STEP));
 const gz=Math.max(0,Math.min(CELLS-0.00001,(z+SIZE/2)/STEP));
 const col=Math.floor(gx),row=Math.floor(gz),u=gx-col,v=gz-row;
 const px=col*STEP-SIZE/2,pz=row*STEP-SIZE/2;
 const a=elevation(px,pz),b=elevation(px+STEP,pz),c=elevation(px,pz+STEP),d=elevation(px+STEP,pz+STEP);
 return u+v<=1?a+u*(b-a)+v*(c-a):d+(1-v)*(b-d)+(1-u)*(c-d);
}
export function buildTerrain(scene:Scene):void {
 const positions:number[]=[],indices:number[]=[],colors:number[]=[];
 for(let row=0;row<=CELLS;row++)for(let col=0;col<=CELLS;col++){
 const x=col*STEP-SIZE/2,z=row*STEP-SIZE/2;positions.push(x,elevation(x,z),z);
 const track=Math.abs(x)<2.7&&z<0,clearing=Math.hypot(x,z-6)<14;
 const variation=(Math.sin(x*1.7+z*2.3)+1)*0.022;
 const c=track?[0.36,0.29,0.20]:clearing?[0.28,0.30,0.20]:[0.20,0.25,0.16];
 colors.push(c[0]+variation,c[1]+variation,c[2]+variation,1);
 if(row<CELLS&&col<CELLS){const a=row*(CELLS+1)+col,b=a+1,c=a+CELLS+1,d=c+1;indices.push(a,b,c,b,d,c);}
 }
 const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);
 const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;
 const ground=new Mesh('local-terrain',scene);data.applyToMesh(ground);
 const mat=new StandardMaterial('forest-floor',scene);mat.diffuseColor=Color3.White();mat.specularColor=Color3.Black();mat.backFaceCulling=false;
 ground.material=mat;ground.receiveShadows=true;
}
