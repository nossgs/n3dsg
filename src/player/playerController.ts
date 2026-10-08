import { MeshBuilder, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { groundHeight, WORLD_BOUNDARY } from '../world/terrain/terrain';
export function createPlayer(scene: Scene, canvas: HTMLCanvasElement) {
 const WALK_SPEED=5,SPRINT_SPEED=8,GRAVITY=20,JUMP_SPEED=7,LOOK_SENSITIVITY=0.002;
 const body=MeshBuilder.CreateBox('player-collider',{size:1},scene);
 body.isVisible=false;body.isPickable=false;body.position.set(0,groundHeight(0,-8)+0.92,-8);body.ellipsoid=new Vector3(0.35,0.9,0.35);
 const camera=new UniversalCamera('player',body.position.add(new Vector3(0,0.8,0)),scene);
 camera.inputs.clear();camera.minZ=0.05;camera.maxZ=650;scene.activeCamera=camera;
 const keys=new Set<string>();let enabled=false,verticalSpeed=0,jumpRequested=false;
 const active=()=>enabled&&document.pointerLockElement===canvas;
 const reset=()=>{keys.clear();jumpRequested=false;};
 document.addEventListener('pointerlockchange',reset);window.addEventListener('blur',reset);
 window.addEventListener('keydown',event=>{
 if(!active())return;
 if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(event.code)){
 event.preventDefault();keys.add(event.code);if(event.code==='Space'&&!event.repeat)jumpRequested=true;}
 });
 window.addEventListener('keyup',event=>keys.delete(event.code));
 document.addEventListener('mousemove',event=>{
 if(!active())return;camera.rotation.y+=event.movementX*LOOK_SENSITIVITY;
 camera.rotation.x=Math.max(-Math.PI/2+0.01,Math.min(Math.PI/2-0.01,camera.rotation.x+event.movementY*LOOK_SENSITIVITY));});
 scene.onBeforeRenderObservable.add(()=>{
 if(active()){
 const dt=Math.min(scene.getEngine().getDeltaTime()/1000,0.04);
 const floor=groundHeight(body.position.x,body.position.z)+0.9;
 const grounded=body.position.y<=floor+0.06&&verticalSpeed<=0;
 if(grounded){verticalSpeed=0;body.position.y=Math.max(body.position.y,floor);}
 if(jumpRequested&&grounded)verticalSpeed=JUMP_SPEED;jumpRequested=false;
 const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const direction=new Vector3(Math.sin(camera.rotation.y)*forward+Math.cos(camera.rotation.y)*right,0,Math.cos(camera.rotation.y)*forward-Math.sin(camera.rotation.y)*right);
 if(direction.lengthSquared()>0)direction.normalize();
 const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?SPRINT_SPEED:WALK_SPEED;verticalSpeed-=GRAVITY*dt;
 body.computeWorldMatrix(true);const previousY=body.position.y;
 body.moveWithCollisions(new Vector3(direction.x*speed*dt,verticalSpeed*dt,direction.z*speed*dt));
 if(verticalSpeed>0&&body.position.y-previousY<verticalSpeed*dt*0.5)verticalSpeed=0;
 body.position.x=Math.max(-WORLD_BOUNDARY,Math.min(WORLD_BOUNDARY,body.position.x));
 body.position.z=Math.max(-WORLD_BOUNDARY,Math.min(WORLD_BOUNDARY,body.position.z));
 const newFloor=groundHeight(body.position.x,body.position.z)+0.9;
 if(body.position.y<newFloor){body.position.y=newFloor;verticalSpeed=0;}
 }
 camera.position.copyFrom(body.position);camera.position.y+=0.8;
 });
 canvas.addEventListener('click',()=>{if(enabled)void canvas.requestPointerLock();});
 return {start(){enabled=true;canvas.tabIndex=0;canvas.focus();void canvas.requestPointerLock();}};
}
