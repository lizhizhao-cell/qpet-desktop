"use strict";
function commandPlacement(pet,area,requestedWidth=160){
  const margin=8,desiredWidth=Math.max(160,Math.min(440,Math.round(requestedWidth))),desiredHeight=60;
  const width=Math.min(desiredWidth,Math.max(1,area.width-2*margin));
  const headX=pet.x+pet.width*.5,headTop=pet.y+pet.height*.065;
  const above=headTop-area.y-2*margin;
  const below=area.y+area.height-(pet.y+pet.height)-2*margin;
  const placeAbove=above>=desiredHeight||above>=below;
  const height=Math.min(desiredHeight,Math.max(1,area.height-2*margin));
  const x=Math.round(Math.max(area.x+margin,Math.min(headX-width/2,area.x+area.width-width-margin)));
  const idealY=placeAbove?headTop-height-margin:pet.y+pet.height+margin;
  const y=Math.round(Math.max(area.y+margin,Math.min(idealY,area.y+area.height-height-margin)));
  return {bounds:{x,y,width:Math.round(width),height:Math.round(height)},
    tailX:Math.round(Math.max(24,Math.min(width-24,headX-x))),
    direction:placeAbove?"down":"up"};
}
module.exports={commandPlacement};
