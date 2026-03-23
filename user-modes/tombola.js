/**
 * @name Tombola
 * @author Tony Nacho
 * @hue 36
 * @sat 220
 * @param_label Mass
 * @description Tilt spins a tombola cage. Knock or MIDI note adds a ball; a hard shake clears it.
 * @sound Bell Pluck / Glass Keys
 */

var MB=8,BR=0.30,BG=0.0000011,EG=0.0000018,SA=0.000000022,SF=0.00022,SM=0.0085;
var KT=150,ST=220,PA=0.42,PP=24.0,WS=6,ED=7;
var MS=[0xAB5,0x5AD,0x6AD,0x295,0xFFF,0x6B5,0xAD5,0x5AB,0x9AD,0x555];
var bs=[],sx=0.0,sy=0.0,sv=0.0,ph=-1.57079,lm=0,sf=0,nb=0;

function cl(v,l,h){return v<l?l:v>h?h:v;}
function dt(m){var v=m.dt;return v<1?1:v>96?96:v;}
function bm(m){var v=m.beatMs;return v<40?40:v>4000?4000:v;}
function wa(a){while(a<=-3.14159)a+=6.28318;while(a>3.14159)a-=6.28318;return a;}
function rr(m){var s=m.COLS<m.ROWS?m.COLS:m.ROWS;return s*0.42;}
function cx(m){return (m.COLS-1)*0.5;}
function cy(m){return (m.ROWS-1)*0.5;}

function seg(px,py,x0,y0,x1,y1){
  var vx=x1-x0,vy=y1-y0,ll=vx*vx+vy*vy,t=0.0;
  if(ll>0.000001){t=((px-x0)*vx+(py-y0)*vy)/ll;t=cl(t,0.0,1.0);}
  var sx=x0+vx*t,sy=y0+vy*t,dx=px-sx,dy=py-sy;
  return Math.sqrt(dx*dx+dy*dy);
}

function mask(m){var s=m.scale|0;return MS[s]!==undefined?MS[s]:MS[3];}
function toneCount(mm){var n=0;for(var i=0;i<12;i++) if(mm&(1<<i)) n++; return n>0?n:1;}

function midiDeg(m,note){
  var mm=mask(m),tc=toneCount(mm),root=m.rootNote|0;
  var rel=(note|0)-48-((root%12+12)%12),bo=Math.floor(rel/12),best=0,dist=9999;
  for(var o=bo-1;o<=bo+1;o++){
    var di=0;
    for(var s=0;s<12;s++){
      if(!(mm&(1<<s))) continue;
      var p=o*12+s,d=Math.abs(p-rel);
      if(d<dist){dist=d;best=o*tc+di;}
      di++;
    }
  }
  return best<0?0:best;
}

function wall(m,x0,y0,rad,rot,br){
  var step=6.28318/WS,core=Math.floor(br*0.62),glow=Math.floor(br*0.22);
  for(var i=0;i<WS;i++){
    var a0=rot+i*step,a1=a0+step;
    var x0s=x0+Math.cos(a0)*rad,y0s=y0+Math.sin(a0)*rad,x1s=x0+Math.cos(a1)*rad,y1s=y0+Math.sin(a1)*rad;
    for(var t=0;t<=ED;t++){
      var u=t/ED,x=x0s+(x1s-x0s)*u,y=y0s+(y1s-y0s)*u,c=Math.floor(x+0.5),r=Math.floor(y+0.5);
      m.px(c,r,0,0,core);
      if(glow>0){ m.px(c+1,r,0,0,glow); m.px(c-1,r,0,0,glow); m.px(c,r+1,0,0,glow); m.px(c,r-1,0,0,glow); }
    }
  }
  m.px(Math.floor(x0+0.5),Math.floor(y0+0.5),0,0,Math.floor(br*0.18));
}

function hit(m,b,v,beat){
  if(b.c>0||nb<=0) return;
  if(v<44) v=44;
  if(v>118) v=118;
  m.note(b.d,v,Math.floor(beat*0.28));
  b.c=90;
  nb--;
}

function kick(m,x0,y0,ir,turn,beat){
  var edge=ir-0.22,spd=0.0105+(m.density/255.0)*0.0065,min=spd*0.28,inset=0.14;
  for(var i=0;i<bs.length;i++){
    var b=bs[i],dx=b.x-x0,dy=b.y-y0,rad=Math.sqrt(dx*dx+dy*dy);
    if(rad<edge||rad<0.0001) continue;
    var nx=dx/rad,ny=dy/rad,tx=-ny,ty=nx,rv=b.vx*nx+b.vy*ny,tv=b.vx*tx+b.vy*ty;
    if(rv<-min) continue;
    var tt=tv*0.18+turn*0.16;
    b.x-=nx*inset; b.y-=ny*inset;
    b.vx=tx*tt-nx*spd; b.vy=ty*tt-ny*spd;
    hit(m,b,72+Math.floor(spd*2600.0),beat);
  }
}

function add(m,d){
  if(bs.length>=MB) return;
  var x0=cx(m),y0=cy(m),a=(m.rnd(256)/255.0)*6.28318,r=(m.rnd(100)/100.0)*rr(m)*0.28;
  var x=x0+Math.cos(a)*r,y=y0+Math.sin(a)*r,t=a+1.57079,s=0.003+(m.rnd(24)/4000.0);
  bs.push({x:x,y:y,px:x,py:y,vx:Math.cos(t)*s,vy:Math.sin(t)*s,d:d,c:120});
}

function seed(m){bs=[];add(m,0);add(m,2+m.rnd(3));add(m,4+m.rnd(3));add(m,7+m.rnd(4));}

function collide(a,b){
  var dx=b.x-a.x,dy=b.y-a.y,min=BR*2.0,ds=dx*dx+dy*dy;
  if(ds>=min*min) return;
  if(ds<0.000001){dx=0.01;dy=0.0;ds=dx*dx;}
  var d=Math.sqrt(ds),nx=dx/d,ny=dy/d,ov=min-d,sp=ov*0.5;
  a.x-=nx*sp; a.y-=ny*sp; b.x+=nx*sp; b.y+=ny*sp;
  var rvx=b.vx-a.vx,rvy=b.vy-a.vy,clo=rvx*nx+rvy*ny;
  if(clo>=0) return;
  var imp=-clo*0.46;
  a.vx-=nx*imp; a.vy-=ny*imp; b.vx+=nx*imp; b.vy+=ny*imp;
}

function activate(m){
  sx=m.accelY; sy=m.accelX; sv=0.0; ph=-1.57079; lm=m.motion;
  sf=3; nb=0;
  seed(m); m.clear(); m.show();
}

function update(m){
  var fd=dt(m),beat=bm(m),x0=cx(m),y0=cy(m),dr=rr(m),ir=dr-BR;
  var bo=0.62+(m.density/255.0)*0.34,mr=0.0012+(m.density/255.0)*0.0008;
  nb=sf>0?0:3;
  if(m.motion>ST&&lm<=ST) bs=[];
  else if(m.motion>KT&&lm<=KT) add(m,m.rnd(14));
  if(m.midiType===1&&m.midiNote!==255) add(m,midiDeg(m,m.midiNote));
  lm=m.motion;

  var pulseMs=beat/PP,pulse=m.tick(7,pulseMs>6.0?pulseMs:6.0),rem=fd,steps=0,turn=sv*dr;
  m.fade(18);

  while(rem>0&&steps<4){
    var d=rem>16?16:rem,drag=1.0-(0.0017-(m.density/255.0)*0.0005)*d;
    if(drag<0.965) drag=0.965;
    sx+=(m.accelY-sx)*(d/130.0);
    sy+=(m.accelX-sy)*(d/130.0);
    sv+=sx*SA*d;
    sv*=1.0-SF*d;
    sv=cl(sv,-SM,SM);
    ph=wa(ph+sv*d);

    var gy=BG+cl((sy+128.0)/255.0,0.0,1.0)*EG;
    turn=sv*dr;

    for(var i=0;i<bs.length;i++){
      var b=bs[i];
      if(steps===0){b.px=b.x;b.py=b.y;}
      b.c=b.c>0?b.c-d:0;
      var rx=b.x-x0,ry=b.y-y0,rad=Math.sqrt(rx*rx+ry*ry),mix=cl((rad/ir-0.35)/0.65,0.0,1.0);
      var tvx=-ry*sv,tvy=rx*sv,carry=(0.00045+mix*0.0022)*d;
      b.vx+=(tvx-b.vx)*carry; b.vy+=(tvy-b.vy)*carry;
      b.vy+=gy*d; b.vx*=drag; b.vy*=drag; b.x+=b.vx*d; b.y+=b.vy*d;
    }

    for(var a=0;a<bs.length;a++) for(var j=a+1;j<bs.length;j++) collide(bs[a],bs[j]);

    for(var n=0;n<bs.length;n++){
      var q=bs[n],dx=q.x-x0,dy=q.y-y0,ds=dx*dx+dy*dy;
      if(ds<ir*ir) continue;
      var dist=Math.sqrt(ds),nx=dx/dist,ny=dy/dist,ang=Math.atan2(dy,dx),vn=q.vx*nx+q.vy*ny;
      q.x=x0+nx*ir; q.y=y0+ny*ir;
      if(vn<=0) continue;
      var rebound=-vn*bo; if(rebound<mr) rebound=mr;
      q.vx-=(1.0+bo)*vn*nx; q.vy-=(1.0+bo)*vn*ny;
      var tx=-ny,ty=nx,vt=q.vx*tx+q.vy*ty,wv=turn;
      q.vx+=tx*(wv-vt)*0.82; q.vy+=ty*(wv-vt)*0.82;
      var rim=q.vx*tx+q.vy*ty;
      q.vx=tx*rim-nx*rebound; q.vy=ty*rim-ny*rebound;
      var rel=wa(ang-ph);
      if(q.c<=0&&rel<PA&&rel>-PA) hit(m,q,56+Math.floor(vn*2600.0),beat);
    }

    rem-=d; steps++;
  }

  if(pulse&&sf===0) kick(m,x0,y0,ir,turn,beat);
  wall(m,x0,y0,dr,ph,m.brightness);

  for(var z=0;z<bs.length;z++){
    var b=bs[z],c=Math.floor(b.x+0.5),r=Math.floor(b.y+0.5),pc=Math.floor(b.px+0.5),pr=Math.floor(b.py+0.5),h=(b.d*18)&255;
    if(pc!==c||pr!==r) m.px(pc,pr,h,180,72);
    m.px(c,r,h,220,m.brightness);
  }
  if(!bs.length) m.px(Math.floor(x0+0.5),Math.floor(y0+0.5),20,80,100);
  if(sf>0) sf--;
  m.show();
}
