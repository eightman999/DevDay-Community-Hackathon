const C={outline:'#122d37',cream:'#f4e6ba',light:'#fff4d2',shade:'#bcae84',mint:'#7df0c1',pink:'#fa958d',eye:'#15333e',blue:'#86cadd',violet:'#b6a0e1',coral:'#f5796b',amber:'#f5c76c'};
export function drawSprite(canvas,kind='document') {
 const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.save();c.scale(canvas.width/40,canvas.height/40);c.imageSmoothingEnabled=false;
 const r=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
 const p=(points,col)=>{c.fillStyle=col;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
 const colors={photo:C.blue,music:C.violet,document:C.cream,locked:C.amber,gift:C.mint,virus:C.coral};const color=colors[kind]||C.cream;
 // Little boots and hands remain readable even in the incoming queue.
 r(11,33,6,3,C.outline);r(25,33,6,3,C.outline);r(10,34,6,2,C.shade);r(25,34,7,2,C.shade);
 r(4,22,4,5,C.outline);r(3,21,3,4,color);r(33,21,4,5,C.outline);r(35,19,3,5,color);
 if(kind==='virus'){
   for(let y=4;y<34;y++)for(let x=5;x<35;x++){const d=Math.hypot(x-20,y-19);if(d<14+(Math.sin(Math.atan2(y-19,x-20)*8)>0?2:0))r(x,y,1,1,C.outline);if(d<12+(Math.sin(Math.atan2(y-19,x-20)*8)>0?2:0))r(x,y,1,1,color);}
   r(10,12,3,3,'#ffa89b');r(24,7,4,2,'#ffa89b');r(29,18,2,6,'#cf5a5b');r(11,28,4,2,'#cf5a5b');r(19,3,2,4,C.coral);r(4,14,4,2,C.coral);r(33,9,3,2,C.coral);
 }else{
   p([[10,4],[26,4],[26,6],[28,6],[28,8],[30,8],[30,10],[32,10],[32,33],[8,33],[8,6],[10,6]],C.outline);
   p([[11,6],[25,6],[25,12],[30,12],[30,31],[10,31],[10,7],[11,7]],color);
   r(11,7,2,21,'#ffffff38');r(12,30,16,1,'#00000025');
   p([[25,6],[25,12],[30,12],[29,10],[27,10],[27,8]],'#ffffff66');r(26,13,4,1,'#00000025');
   if(kind==='photo'){
     r(12,13,16,9,'#419bad');r(14,14,3,3,'#fff6ce');p([[12,22],[18,16],[23,22]],'#b4ebbb');p([[18,22],[24,17],[28,22]],'#58b498');r(25,18,2,5,'#f2ba79');r(23,19,6,2,C.pink);r(25,19,2,2,C.amber);
   }else if(kind==='music'){
     r(21,12,2,8,C.outline);r(16,14,7,2,C.outline);r(16,14,2,9,C.outline);r(13,21,5,3,C.outline);r(18,18,5,3,C.outline);r(14,21,2,1,'#f4e4f6');
   }else if(kind==='locked'){
     r(16,12,9,9,C.outline);r(18,10,5,2,C.outline);r(18,13,5,6,color);r(14,17,13,7,'#785b38');r(15,18,11,5,'#f8df99');r(20,19,2,3,C.outline);
   }else if(kind==='gift'){
     r(13,15,15,9,'#3c9f87');r(12,14,17,3,'#e1f5c6');r(19,14,3,10,'#fa9d8c');r(16,11,4,3,'#fa9d8c');r(22,11,4,3,'#fa9d8c');r(18,12,6,2,'#fa9d8c');
   }else{
     r(13,11,3,3,'#bcae84');r(17,11,3,3,'#bcae84');r(13,15,3,3,'#bcae84');r(17,15,3,3,'#bcae84');r(23,17,4,1,'#cdbd8c');r(23,19,4,1,'#cdbd8c');
   }
 }
 const ey=kind==='virus'?21:26;
 r(13,ey,3,4,C.eye);r(25,ey,3,4,C.eye);r(13,ey,1,1,'#fff7da');r(25,ey,1,1,'#fff7da');
 r(11,ey+3,2,1,C.pink);r(28,ey+3,2,1,C.pink);r(19,ey+3,1,1,C.eye);r(22,ey+3,1,1,C.eye);r(20,ey+4,2,1,C.eye);
 if(kind==='virus'){r(12,19,4,1,C.eye);r(25,19,4,1,C.eye);r(17,11,2,2,'#ffa89b');}
 r(4,6,1,2,C.mint);r(3,7,3,1,C.mint);r(34,30,2,2,'#bce0b3');r(31,4,1,1,C.cream);
 c.restore();
}
