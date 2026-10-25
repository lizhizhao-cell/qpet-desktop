"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {commandPlacement}=require("../app/command-placement.cjs");
test("bubble sits above the head and follows the pet without changing relative position",()=>{
  const area={x:0,y:0,width:1920,height:1040},pet={x:800,y:640,width:320,height:400};
  const first=commandPlacement(pet,area),next=commandPlacement({...pet,x:pet.x-70},area);
  assert.equal(first.direction,"down");
  assert.equal(first.bounds.width,160);
  assert.equal(first.bounds.height,60);
  assert.ok(first.bounds.y+first.bounds.height<=pet.y+pet.height*.065);
  assert.equal(next.bounds.x,first.bounds.x-70);
  assert.equal(first.bounds.x+first.tailX,pet.x+pet.width/2);
});
test("bubble width grows with measured input and remains clamped",()=>{
  const area={x:0,y:0,width:1920,height:1040},pet={x:800,y:640,width:320,height:400};
  const short=commandPlacement(pet,area,190),long=commandPlacement(pet,area,360),maximum=commandPlacement(pet,area,900);
  assert.ok(long.bounds.width>short.bounds.width);
  assert.equal(maximum.bounds.width,440);
  assert.equal(long.bounds.x+long.tailX,pet.x+pet.width/2);
});
test("edges, top fallback and displays with negative coordinates stay in the work area",()=>{
  for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:-80,width:1280,height:720},{x:0,y:0,width:300,height:280}]){
    for(const corner of ["left","right","top"]){
      const pet={x:corner==="right"?area.x+area.width-200:area.x,y:corner==="top"?area.y:area.y+area.height-200,width:200,height:200};
      const result=commandPlacement(pet,area),b=result.bounds;
      assert.ok(b.x>=area.x&&b.y>=area.y);
      assert.ok(b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
      assert.ok(result.tailX>=24&&result.tailX<=b.width-24);
      if(corner==="top"&&area.height>=720)assert.equal(result.direction,"up");
    }
  }
});
