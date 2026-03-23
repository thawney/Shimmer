/**
 * @name Kaleidoscope
 * @author Tony Nacho
 * @hue 175
 * @sat 210
 * @param_label Glass
 * @description Mirrored glass shards drift and bloom into chords. Tilt biases the spread; knocks reshuffle it.
 * @sound Glass pad / choir
 */

var KM=6,kn=0,kx=[],ky=[],ktx=[],kty=[],kh=[],kth=[],kb=[],ku=[],ks=[],kv=[];
var kp=0.0,kc=0.0,kk=0.0,km=0,kb0=0,kl=0,kr=1,kf=0,kax=0.0,kay=0.0;
var SH=[[0,2,4,6,8],[0,2,4,5,7],[0,1,4,6,7],[0,2,3,5,7],[0,2,5,7,9]];

function ca(v){return v<0?-v:v;}
function cc(v,l,h){return v<l?l:v>h?h:v;}
function cdt(m){var v=m.dt;return v<1?1:v>96?96:v;}
function cbm(m){var v=m.beatMs;return v<40?40:v>4000?4000:v;}

function clr(m){for(var i=0,n=m.COLS*m.ROWS;i<n;i++){kv[i]=0;ku[i]=0;ks[i]=0;}}
function put(m,c,r,h,s,v){
  if(c<0||r<0||c>=m.COLS||r>=m.ROWS||v<=0) return;
  if(v>255) v=255;
  if(s<0) s=0; else if(s>255) s=255;
  var i=r*m.COLS+c;
  if(v>kv[i]){kv[i]=v;ku[i]=h&255;ks[i]=s;}
}
function kern(m,x,y,h,s,v){
  var ix=Math.floor(x),iy=Math.floor(y);
  for(var r=iy-1;r<=iy+1;r++) for(var c=ix-1;c<=ix+1;c++){
    var dx=c-x; if(dx<0) dx=-dx;
    var dy=r-y; if(dy<0) dy=-dy;
    var br=v-Math.floor((dx+dy)*92);
    if(br>0) put(m,c,r,h,s,br);
  }
}
function burst(m,x,y,h,s,v){
  kern(m,x,y,h,s,v);
}
function plot8(m,x,y,h,s,v){
  burst(m,x,y,h,s,v); burst(m,11-x,y,h,s,v); burst(m,x,11-y,h,s,v); burst(m,11-x,11-y,h,s,v);
  burst(m,y,x,h,s,v); burst(m,11-y,x,h,s,v); burst(m,y,11-x,h,s,v); burst(m,11-y,11-x,h,s,v);
}

function target(i,m,strong){
  var nx=ktx[i],ny=kty[i];
  if(strong||ny==null||m.rnd(4)===0){ ny=0.7+m.rnd(46)/10; nx=0.2+m.rnd(48)/10; if(strong) ny+=0.45; }
  else { nx+=(m.rnd(3)-1)*(strong?1.2:0.55); ny+=(m.rnd(3)-1)*(strong?1.35:0.65); }
  nx+=kay*0.28; ny+=kax*0.18; if(m.accelZ<32) ny+=0.35;
  nx=cc(nx,0.1,5.1); ny=cc(ny,0.6,5.35); if(nx>ny-0.12) nx=ny-0.12; if(nx<0.1) nx=0.1;
  ktx[i]=nx; kty[i]=ny;
  kth[i]=((kth[i]==null?170+i*17:Math.floor(kth[i]))+(strong?24+m.rnd(92):8+m.rnd(28))+Math.floor(ca(kay)*22))&255;
  kb[i]=strong?255:(170+m.rnd(80));
}

function init(i,m){
  kx[i]=1.5+i*0.35; ky[i]=2.8+i*0.22; ktx[i]=kx[i]; kty[i]=ky[i];
  kh[i]=(160+i*17)&255; kth[i]=kh[i]; kb[i]=190; target(i,m,1); kx[i]=ktx[i]; ky[i]=kty[i]; kh[i]=kth[i];
}

function resize(m){
  var want=4+Math.floor(m.density*5/255); if(want<4) want=4; if(want>KM) want=KM;
  while(kn<want){ init(kn,m); kn++; }
  while(kn>want) kn--;
}

function comp(){
  if(kn<1) return 0.0;
  var s=0.0;
  for(var i=0;i<kn;i++) s+=(ky[i]-kx[i])+ky[i]*0.55;
  s=s/(kn*6.4);
  var v=((kn-4)/5.0)*0.45+s*0.55;
  return v<0?0:v>1?1:v;
}
function voices(c){var v=2+Math.floor(c*1.7); return v>3?3:v;}

function adv(m,hard){
  var d=0;
  if(kay>0.28) d=1; else if(kay<-0.28) d=-1; else if(hard||m.rnd(3)===0) d=m.rnd(2)===0?-1:1;
  if(m.rnd(hard?2:5)===0) kf=(kf+1+m.rnd(2))%SH.length;
  kr+=d; if(kr<0) kr=0; if(kr>4) kr=4;
}

function chord(m,c,still,accent,beat){
  var sh=SH[kf],v=voices(c+(accent?0.18:0.0)),vel=50+Math.floor(c*30)+(accent?18:0),dur=Math.floor(beat*(still?1.35:0.95));
  if(dur<140) dur=140;
  for(var i=0;i<v;i++){
    var dg=kr+sh[i],nv=vel-i*7+m.rnd(8);
    if(dg>13) dg=13; if(nv<34) nv=34; if(nv>120) nv=120;
    m.note(dg,nv,dur);
  }
}

function melody(m,c,beat){
  if(kn<1) return;
  var sh=SH[kf],v=voices(c),i=kl%kn,span,a,b,d0,d1,v0,v1,dur;
  kl++; span=Math.floor((ky[i]-kx[i])*1.7); if(span<0) span=0;
  a=span%v; b=v-1-a; d0=kr+sh[a]; d1=kr+sh[b]; if(d0>13) d0=13; if(d1>13) d1=13;
  v0=38+Math.floor(c*28)+Math.floor(ky[i]*4)+m.rnd(12); v1=v0-10+Math.floor((kx[i]+0.5)*3);
  dur=Math.floor(beat*(0.42+c*0.18)); if(dur<80) dur=80;
  m.note(d0,v0,dur);
  if(v>3||b!==a){ if(v1<26) v1=26; m.note(d1,v1,dur); }
}

function shock(m,beat){
  kk=900; adv(m,1); kf=(kf+1+m.rnd(SH.length-1))%SH.length;
  for(var i=0;i<kn;i++) target(i,m,1);
  chord(m,comp(),0,1,beat);
}

function activate(m){
  kn=0; kp=0.0; kc=0.0; kk=0.0; km=0; kb0=0; kl=0; kr=1+m.rnd(3); kf=m.rnd(SH.length);
  ku=[]; ks=[]; kv=[];
  kax=m.accelX/72.0; kay=m.accelY/72.0; resize(m); m.clear(); m.show();
}

function deactivate(m){ m.allOff(); }

function update(m){
  var d=cdt(m),beat=cbm(m),c,still,sub,glow,sh;
  resize(m);
  kax+=((m.accelX/72.0)-kax)*(d/900.0);
  kay+=((m.accelY/72.0)-kay)*(d/900.0);
  if(m.motion<16) kc+=d; else kc=0;
  still=kc>320;
  if(m.motion>148&&km<=148) shock(m,beat);
  km=m.motion;
  if(kk>0){ kk-=d; if(kk<0) kk=0; }
  c=comp();
  sub=Math.floor(beat/(2+Math.floor(c*2.2))); if(sub<70) sub=70;

  if(m.tick(0,sub)){
    var edits=1;
    for(var n=0;n<edits;n++) target((kl+n+m.rnd(kn))%kn,m,0);
    melody(m,c,beat);
  }
  if(m.tick(1,beat)){
    kb0++;
    if((kb0&3)===0||m.motion>60) adv(m,0);
    chord(m,c,still,0,beat);
  }

  clr(m);
  kp+=d/beat; if(kp>=1.0) kp-=Math.floor(kp);
  glow=0.55+0.45*Math.sin(kp*6.28318); sh=kk>0?kk/900.0:0.0;
  kern(m,5.5,5.5,24+Math.floor(glow*28),120,Math.floor(m.brightness*(0.10+0.14*glow+0.28*sh)));

  for(var i=0;i<kn;i++){
    var lag=still?850.0:280.0,hl=still?1600.0:420.0,dh,h,s,b;
    kx[i]+=(ktx[i]-kx[i])*(d/lag);
    ky[i]+=(kty[i]-ky[i])*(d/lag);
    dh=kth[i]-kh[i]; if(dh>128) dh-=256; if(dh<-128) dh+=256;
    kh[i]+=dh*(d/hl); if(kh[i]<0) kh[i]+=256; if(kh[i]>=256) kh[i]-=256;
    h=(Math.floor(kh[i])+Math.floor(kp*24)+i*9)&255;
    s=170+Math.floor(c*56)+Math.floor(sh*25);
    b=Math.floor(kb[i]*(0.42+0.36*glow)+c*40+sh*70);
    if(i>=voices(c)&&still) b-=18;
    if(b>255) b=255;
    plot8(m,kx[i],ky[i],h,s,b);
  }

  for(var r=0;r<m.ROWS;r++) for(var col=0;col<m.COLS;col++){
    var i0=r*m.COLS+col;
    if(kv[i0]>0) m.px(col,r,ku[i0],ks[i0],kv[i0]); else m.px(col,r,0);
  }
  m.show();
}
