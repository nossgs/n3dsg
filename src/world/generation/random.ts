export function seededRandom(initial:number):()=>number {
 let seed=initial>>>0;
 return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
