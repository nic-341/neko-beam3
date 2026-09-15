'use strict';
// Replace these PNGs to customize the artwork. Missing images use pixel-art fallbacks.
const SPRITES={cat:'assets/cat.png',catAnimation:'assets/cat-animation.png',run:'assets/cat-run.png',mouseAnimation:'assets/mouse-animation.png',settle:'assets/cat-settle.png',sleep:'assets/cat-sleep.png',mouse:'assets/mouse.png',taiyaki:'assets/taiyaki-simple.png',tower:'assets/tower-warm.png',background:'assets/hills-background.png',forest:'assets/forest-background.png'};
const art={};for(const [k,src] of Object.entries(SPRITES)){const im=new Image();let retried=false;im.onload=()=>{art[k]=im;paintHUDIcon(k,im);};im.onerror=()=>{const embedded=window.NEKO_EMBEDDED_ASSETS?.[k];if(!retried&&embedded){retried=true;im.src=embedded;}};im.src=src;}
const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d');
const ui={overlay:document.querySelector('#overlay'),title:document.querySelector('h1'),msg:document.querySelector('#message'),start:document.querySelector('#start'),life:document.querySelector('#life'),fish:document.querySelector('#fish'),bar:document.querySelector('#progress i')};
const HEART_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="h" x2=".3" y2="1"><stop stop-color="#ffaaa6"/><stop offset=".45" stop-color="#ff626e"/><stop offset="1" stop-color="#d73252"/></linearGradient></defs><path d="M16 28C12 25 3 19 3 11C3 3 12 1 16 8C20 1 29 3 29 11C29 19 20 25 16 28Z" fill="url(#h)" stroke="#99354d" stroke-width="1.5"/><path d="M6 11C6 7 10 5 12 8" fill="none" stroke="#ffe6db" stroke-width="2.5" stroke-linecap="round"/></svg>';
const heartURL='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(HEART_SVG),heartArt=new Image();heartArt.src=heartURL;
let heartDrops=[];
const GOAL_OFFSET=7; // Compensate for transparent pixels below the tower feet.
const WORLD=8800,GROUND=440,SECTION=1100,SECTION_COUNT=8,keys={left:false,right:false,jump:false,beam:false},dash={left:false,right:false},lastTap={left:-1000,right:-1000};
// Ground spans and raised ledges are local to each section. The first 300px
// remain safe for respawning; every required jump fits ordinary walking speed.
const COURSE_PATTERNS=[
 {ground:[[0,960],[1080,120]],ledges:[[390,55,120],[650,105,160],[895,65,140]]},
 {ground:[[0,1200]],ledges:[[370,35,100],[470,70,100],[570,105,110],[840,45,150]]},
 {ground:[[0,620],[700,200],[990,210]],ledges:[[360,45,120],[735,35,95]]},
 {ground:[[0,1200]],ledges:[[360,60,180],[590,110,170],[820,60,180]]},
 {ground:[[0,840],[940,260]],ledges:[[390,45,170],[650,75,140],[970,30,100]]}
];
const COURSE_ORDER=[0,1,2,3,4,2,1,3,0,4];
let stage=1;
let completeCelebrated=false;
let midpointUnlocked=false;
let state='ready',player,camera=0,platforms=[],mice=[],fish=[],shots=[],particles=[],collected=0,elapsed=0,checkpoint=80,last=0,acc=0,jumpQueued=false,sound=false,audio;
let endingTime=0,arrivalX=0,arrivalY=0,stock=3,restartTime=0;
function tone(f,d=.08){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{}}
function reset(newGame=true){completeCelebrated=false;if(newGame){stock=3;midpointUnlocked=false;}restartTime=0;endingTime=0;ui.overlay.classList.remove('ending');ui.overlay.classList.remove('complete');player={x:80,y:GROUND-38,w:38,h:38,vx:0,vy:0,dir:1,hp:3,inv:0,grounded:false,coyote:0,cool:0};camera=0;collected=0;elapsed=0;checkpoint=80;heartDrops=[];shots=[];particles=[];platforms=[];mice=[];fish=[];
 // Eight deliberate learning jumps; long quiet stretches between challenges.
 const gaps=stage===1?[[1800,1890],[4800,4890],[7600,7700]]:[[1700,1800],[4700,5140],[6200,6300],[7600,8070]];
 let edge=0;for(const [left,right] of gaps){platforms.push({x:edge,y:GROUND,w:left-edge,h:180});edge=right;}platforms.push({x:edge,y:GROUND,w:WORLD-edge,h:180});
 const ledges=stage===1?[[850,40,100],[2700,50,220],[3020,85,240],[5700,55,120],[6700,45,180]]:[[900,45,120],[2500,50,180],[2780,95,200],[3800,40,110],[5700,55,130],[6750,50,160]];
 for(const [x,height,width] of ledges)platforms.push({x,y:GROUND-height,w:width,h:height});
 // Patrol only on clear stretches of the starting ground, never on ledges.
 const blocked=[...gaps,...ledges.map(([x,h,w])=>[x,x+w])].sort((a,b)=>a[0]-b[0]);
 const safe=[];edge=350;for(const [left,right] of blocked){if(left-edge>=200)safe.push([edge,left]);edge=Math.max(edge,right);}safe.push([edge,WORLD-350]);
 for(let s=0;s<SECTION_COUNT;s++)for(const offset of [450,900]){
  const desired=s*SECTION+offset;
  const span=safe.reduce((best,p)=>{const distance=q=>Math.abs(desired-Math.max(q[0]+20,Math.min(q[1]-54,desired)));return distance(p)<distance(best)?p:best;},safe[0]);
  const x=Math.max(span[0]+20,Math.min(span[1]-54,desired));
  mice.push({x,y:GROUND-25,w:34,h:25,v:s%2?42:-42,min:Math.max(span[0]+8,x-55),max:Math.min(span[1]-42,x+55),alive:true});
 }
 // Optional rear walls: pass through their sides and underside, land only on top.
 for(const [x,height,width] of [[1250,55,200],[2100,50,150],[2330,95,180],[3550,65,260],[3900,105,160],[5100,55,180],[5350,100,160],[6100,65,220],[7050,55,180],[7310,95,160]])platforms.push({x,y:GROUND-height,w:width,h:height,oneWay:true});
 // Keep all 40 treats before the quiet final approach; reward both routes.
 for(const x of [300,520,720,1030,1550,1980,2550,2820,3150,3380,4250,4510,4670,4990,5590,5920,6490,6840,7860,8000]){
  const surface=Math.min(...platforms.filter(p=>p.x<=x&&p.x+p.w>x).map(p=>p.y));
  fish.push({x,y:surface-34,taken:false});
 }
 for(const p of platforms.filter(p=>p.oneWay))for(const ratio of [.3,.7])fish.push({x:p.x+p.w*ratio,y:p.y-34,taken:false});
 // Airborne treats retain the total count and stay within ordinary jump reach.
 for(const x of [520,1550,1980,4250,4990,6490])fish.find(f=>f.x===x).y=GROUND-90;
 // This single high treat requires a second jump from the 55px rear platform.
 Object.assign(fish[20],{x:1390,y:GROUND-155});
 // Five sparkling bonus treats, each worth two.
 for(const [x,y] of [[2680,GROUND-130],[6490,GROUND-100]])fish.push({x,y,taken:false,value:2});
 for(const x of [520,4510,7860]){const beside=fish.find(f=>f.x===x);fish.push({x:beside.x+80,y:beside.y,taken:false,value:2});}
 // Separate the ordinary airborne treat from the nearby bonus treat.
 fish.find(f=>f.x===6490&&!f.value).x=6380;
 if(stage===2)buildForestStage();
 updateStageLabels();
 if(!newGame&&midpointUnlocked){player.x=WORLD/2+80;checkpoint=player.x;player.inv=2;camera=Math.max(0,Math.min(WORLD-viewW(),player.x-viewW()*.33));}
 clearKeys();updateHUD();}

function updateStageLabels(){
 const name=stage===1?'はじまりの丘':'木漏れ日の森';
 for(const selector of ['.edition','.eyebrow'])document.querySelector(selector).textContent='STAGE 1–'+stage+' / '+name;
 document.querySelector('.brand span').textContent=name;
 document.querySelector('.below span').textContent=name+'を越えて、あのキャットハウスまで。';
 document.querySelector('#stage-select').value=String(stage);
}
function buildForestStage(){
 // Layered fern terraces, safe gaps and a clear midpoint clearing.
 platforms=platforms.filter(p=>!p.oneWay);
 for(const [x,height,width] of [[1250,55,200],[2050,55,180],[2270,100,150],[3200,65,220],[3480,105,150],[4780,50,105],[4960,90,105],[7050,55,180],[7680,55,110],[7880,95,110]])platforms.push({x,y:GROUND-height,w:width,h:height,oneWay:true});
 const walls=platforms.filter(p=>p.oneWay);
 fish=[];
 for(const x of [300,530,750,1150,1560,1900,2550,2860,3100,3700,4200,4510,4825,5500,5580,5900,6440,7000,7900,7480]){
 const surface=Math.min(...platforms.filter(p=>p.x<=x&&p.x+p.w>x).map(p=>p.y));fish.push({x,y:surface-34,taken:false});}
 for(const wall of walls)for(const r of [.3,.7])fish.push({x:wall.x+wall.w*r,y:wall.y-34,taken:false});
 for(const [x,y] of [[610,350],[2380,275],[4590,350],[6500,350],[7980,406]])fish.push({x,y,taken:false,value:2});
 for(const x of [4100,7400])mice.push({x,y:GROUND-25,w:34,h:25,v:42,min:x-40,max:x+45,alive:true});
 mice.forEach((m,i)=>{if(i%2===1){m.kind='hopper';m.wait=.8+(i%3)*.2;m.vy=0;m.v=0;}});
}
function drawHopper(m){
 const rows=['  bb      bb  ',' bppb    bppb ',' bbbb    bbbb ','  bbbbbbbbbb  ',' bbbwwbbwwbbb ',' bbbkkbbkkbbb ',' bbbbbnnbbbbb ','  bwwwwwwwwb  ','  bbbbbbbbbb  ','   bb    bb   '];
 pixel(rows,m.x-4,m.y-7,3,{b:'#855d42',p:'#f3b5a1',w:'#fff0d1',k:'#273d37',n:'#cc766e'},m.v<0);
}
function drawForest(w){
 if(art.forest){const im=art.forest,bw=540*im.width/im.height,offset=(camera*.12)%bw;for(let i=-1;i<=Math.ceil(w/bw);i++){const x=i*bw-offset;ctx.save();if(i%2){ctx.translate(x+bw,0);ctx.scale(-1,1);ctx.drawImage(im,0,0,bw+1,540);}else ctx.drawImage(im,x,0,bw+1,540);ctx.restore();}return;}

 ctx.fillStyle='#c5e7b3';ctx.fillRect(0,0,w,540);
 // Three layers of trees give the forest depth while keeping the path bright.
 for(let layer=0;layer<3;layer++){
 const spacing=[155,220,310][layer],offset=camera*[.08,.17,.28][layer],base=[400,435,460][layer];
 for(let i=Math.floor(offset/spacing)-1;i<Math.ceil((offset+w)/spacing)+1;i++){
 const x=i*spacing-offset,seed=noise(i+layer*31),tw=[12,23,38][layer],top=35+seed*85;
 ctx.fillStyle=['#93bea0','#789e80','#69856a'][layer];ctx.fillRect(x,top,tw,base-top);ctx.fillStyle=['#b1cda6','#a6b993','#b3b082'][layer];ctx.fillRect(x+tw*.18,top,tw*.22,base-top);
 for(let b=0;b<4;b++){ctx.fillStyle=['#a8cf93','#80b877','#559966'][layer];ctx.fillRect(x-55-b*8,top-35+b*20,120+b*15,25);}
 for(let j=0;j<22;j++){const lx=x-75+noise(i*23+j)*175,ly=top-65+noise(i*19+j+5)*110;ctx.fillStyle=['#b8db9a','#93c87a','#6eae66'][layer];ctx.fillRect(lx,ly,18+noise(j+i)*27,12);ctx.fillStyle=['#d9eab3','#b6d98a','#a4cb74'][layer];ctx.fillRect(lx+2,ly,14,3);}
 if(layer===2){ctx.fillStyle='#79955b';ctx.fillRect(x-16,base-15,tw+36,15);}
 }
 }
 // Ferns and distant undergrowth soften the tree bases.
 for(let i=-1;i<Math.ceil(w/70)+1;i++){const x=i*70-(camera*.35%70),y=405+noise(i)*24;ctx.fillStyle='#86b385';ctx.fillRect(x-15,y-12,60,25);ctx.fillStyle='#a4c892';ctx.fillRect(x-7,y-19,40,12);for(let j=0;j<4;j++){ctx.fillStyle=j%2?'#b6cf98':'#729f77';ctx.fillRect(x+j*10,y-15-j*3,4,30);ctx.fillRect(x+j*10-5,y-11-j*3,14,3);}}
 // Broad shafts through canopy openings, plus small motes in the light.
 for(let i=-1;i<Math.ceil(w/330)+1;i++){const x=i*330-(camera*.12%330);ctx.fillStyle='rgba(255,249,186,.20)';ctx.beginPath();ctx.moveTo(x+110,0);ctx.lineTo(x+148,0);ctx.lineTo(x+10,460);ctx.lineTo(x-95,460);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(255,255,220,.18)';ctx.beginPath();ctx.moveTo(x+120,0);ctx.lineTo(x+128,0);ctx.lineTo(x-22,460);ctx.lineTo(x-52,460);ctx.closePath();ctx.fill();}
 for(let i=0;i<28;i++){const x=((i*137-camera*.22+Math.sin(elapsed*.4+i)*9)%w+w)%w,y=120+(i*71%300);ctx.fillStyle='rgba(255,253,199,.7)';ctx.fillRect(x,y,2,2);}
}

function clearKeys(){for(const k in keys)keys[k]=false;dash.left=dash.right=false;jumpQueued=false;document.querySelectorAll('.active').forEach(e=>e.classList.remove('active'));}
function paintHUDIcon(name,im){
 if(name!=='catAnimation'&&name!=='taiyaki')return;
 const icon=document.querySelector(name==='catAnimation'?'#stock-icon':'#fish-icon');if(!icon)return;
 const brush=icon.getContext('2d');brush.clearRect(0,0,icon.width,icon.height);brush.imageSmoothingEnabled=true;
 if(name==='catAnimation'){const cw=im.width/4,ch=im.height/2;brush.drawImage(im,cw*.64,ch*.28,cw*.31,ch*.36,2,0,36,40);}
 else brush.drawImage(im,0,0,icon.width,icon.height);
}
function updateHUD(){ui.life.innerHTML=Array.from({length:3},(_,i)=>'<span class="hud-heart '+(i<player.hp?'full':'empty')+'" aria-hidden="true"><img src="'+heartURL+'" alt="" draggable="false"></span>').join('');ui.life.setAttribute?.('aria-label','ライフ '+player.hp+' / 3');document.querySelector('#stock').textContent=String(stock);ui.fish.textContent=String(collected).padStart(2,'0');ui.bar.style.width=Math.min(100,player.x/(WORLD-200)*100)+'%';}
function show(title,msg,label){ui.overlay.classList[state==='paused'?'add':'remove']('paused');ui.title.innerHTML=title;ui.msg.textContent=msg;ui.start.innerHTML=label+' <span>→</span>';ui.overlay.style.display='flex';}
function start(){if(state==='clear'&&stage===1){const remainingStock=stock;stage=2;reset();stock=remainingStock;state='playing';ui.overlay.style.display='none';updateHUD();tone(660);return;}if(state==='over'&&midpointUnlocked){reset();midpointUnlocked=true;player.x=WORLD/2+80;checkpoint=player.x;player.inv=2;camera=Math.max(0,Math.min(WORLD-viewW(),player.x-viewW()*.33));state='playing';ui.overlay.style.display='none';updateHUD();tone(660);return;}if(state==='restarting')return;if(state==='paused'){state='playing';ui.overlay.style.display='none';return;}reset();state='playing';ui.overlay.style.display='none';tone(660);}
function pause(){if(state==='playing'){state='paused';clearKeys();show('ひとやすみ。','猫もあなたも、ちょっと休憩。','冒険をつづける');}else if(state==='paused')start();}
function hit(fall=false){
 if(state!=='playing'||(!fall&&player.inv>0))return;
 player.hp--;tone(130,.2);burst(player.x+18,player.y+15,'#f3978c',12);
 if(player.hp<=0){
  stock--;clearKeys();
  if(stock===0){state='over';show('GAME OVER',midpointUnlocked?'中間地点からライフ3・残機3でコンティニューできます。':'残機がなくなりました。たい焼き '+collected+' 個を集めました。',midpointUnlocked?'中間地点からコンティニュー':'もういちど遊ぶ');}
  else{state='restarting';restartTime=1.2;ui.overlay.style.display='none';}
 }else{player.inv=2;player.vy=-210;if(fall){player.x=checkpoint;player.y=GROUND-100;player.vy=0;shots=[];}}
 updateHUD();
}
function rect(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function burst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:Math.cos(i*2.4)*70,vy:Math.sin(i*2.4)*90-40,t:.5,color});}
function step(dt){
 if(state==='restarting'){if(document.hidden)return;restartTime-=dt;if(restartTime<=0){reset(false);state='playing';ui.overlay.style.display='none';}return;}
 if(state==='arriving'||state==='clear'){
  if(document.hidden)return;
  endingTime+=dt;
  if(state==='clear'&&collected===50&&endingTime>=7.2&&!completeCelebrated){completeCelebrated=true;ui.overlay.classList.add('complete');tone(1047,.25);}
  if(state==='arriving'){
   const t=Math.min(1,endingTime/1.3),ease=t*t*(3-2*t);
   player.x=arrivalX+(WORLD-178-arrivalX)*ease;
   const stepUp=Math.max(0,Math.min(1,(t-.35)/.65));
   player.y=arrivalY+(GROUND-61+GOAL_OFFSET-arrivalY)*stepUp;player.dir=1;player.grounded=true;player.vx=endingTime<1.3?55:0;
   camera=Math.max(0,Math.min(WORLD-viewW(),player.x-viewW()*.33));
   if(endingTime>=5.4){state='clear';ui.overlay.classList.add('ending');show('ステージクリア！','たい焼き '+collected+' / '+fish.reduce((total,f)=>total+(f.value||1),0)+' 個 · '+Math.floor(elapsed/60)+'分'+Math.floor(elapsed%60)+'秒',stage===1?'1-2 木漏れ日の森へ':'もういちど遊ぶ');} 
  }return;
 }
 if(state!=='playing')return;elapsed+=dt;player.inv=Math.max(0,player.inv-dt);player.cool-=dt;player.coyote=player.grounded?.11:Math.max(0,player.coyote-dt);
 const direction=Number(keys.right)-Number(keys.left);const running=direction>0?dash.right:dash.left;player.vx=direction*(running?265:190);if(direction)player.dir=direction;
 if(jumpQueued&&player.coyote>0){player.vy=-465;player.grounded=false;player.coyote=0;tone(430);}jumpQueued=false;
 player.vy=Math.min(700,player.vy+1250*dt);player.x=Math.max(0,Math.min(WORLD-40,player.x+player.vx*dt));
 for(const p of platforms)if(!p.oneWay&&rect(player,p)){if(player.vx>0)player.x=p.x-player.w;else if(player.vx<0)player.x=p.x+p.w;}
 const oldY=player.y;player.y+=player.vy*dt;player.grounded=false;for(const p of platforms)if(rect(player,p)){if(player.vy>=0&&oldY+player.h<=p.y+1){player.y=p.y-player.h;player.vy=0;player.grounded=true;}else if(!p.oneWay&&player.vy<0&&oldY>=p.y+p.h-1){player.y=p.y+p.h;player.vy=0;}}
 if(player.grounded&&player.x>=WORLD/2)midpointUnlocked=true;
 if(player.grounded&&player.x%SECTION<300){const candidate=Math.floor(player.x/SECTION)*SECTION+80;if(platforms.some(p=>!p.oneWay&&p.y===GROUND&&candidate>=p.x&&candidate+player.w<=p.x+p.w))checkpoint=candidate;}
 if(player.y>700){hit(true);if(state!=='playing')return;}
 if(keys.beam&&player.cool<=0){shots.push({x:player.x+(player.dir===1?32:-22),y:player.y+12,w:28,h:5,v:player.dir*650,t:1.1});player.cool=.24;tone(880,.04);}
 for(const b of shots){b.x+=b.v*dt;b.t-=dt;for(const m of mice)if(m.alive&&b.t>0&&rect(b,m)){m.alive=false;b.t=0;if(Math.random()<1/10)heartDrops.push({x:m.x+5,y:GROUND-30,w:26,h:26});burst(m.x+15,m.y+10,'#f8ca73',10);tone(220,.08);}}shots=shots.filter(b=>b.t>0);
 for(const m of mice){if(!m.alive)continue;if(m.kind==='hopper'){m.wait-=dt;if(m.y>=GROUND-m.h&&m.wait<=0){m.vy=-230;m.wait=1.5;m.v=player.x<m.x?-65:65;}m.vy+=850*dt;m.y=Math.min(GROUND-m.h,m.y+m.vy*dt);if(m.y>=GROUND-m.h){m.vy=0;m.v=0;}}
 m.x+=m.v*dt;if(m.x<m.min){m.x=m.min;m.v=Math.abs(m.v);}if(m.x>m.max){m.x=m.max;m.v=-Math.abs(m.v);}if(rect(player,m)){hit();if(state!=='playing')return;}}
 for(const heart of heartDrops)if(!heart.taken&&rect(player,heart)){heart.taken=true;if(player.hp<3){player.hp++;burst(heart.x+13,heart.y+13,'#ff9aab',8);tone(660,.12);}}
 heartDrops=heartDrops.filter(h=>!h.taken);
 for(const f of fish)if(!f.taken&&rect(player,{x:f.x-12,y:f.y-10,w:24,h:20})){f.taken=true;const previousCount=collected;collected+=f.value||1;if(previousCount<50&&collected>=50)stock++;burst(f.x,f.y,'#ffdf8d',8);tone(1100,.08);}
 particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;p.t-=dt;});particles=particles.filter(p=>p.t>0);
 camera=Math.max(0,Math.min(WORLD-viewW(),player.x-viewW()*.33));
 if(player.grounded&&player.y+player.h>=GROUND-1&&rect(player,{x:WORLD-200,y:GROUND-145,w:110,h:145})){state='arriving';endingTime=0;arrivalX=player.x;arrivalY=player.y;clearKeys();shots=[];player.inv=0;tone(784,.18);}updateHUD();}
const catPixels=['  gg      gg  ',' gwwg    gwwg ',' gwwwggggwwwg ','gwwwwwwwwwwwwg','gwwggwwwwggwwg','gwwkkwwwwkkwwg','gwwwwwnnwwwwwg',' gwwwwwwwwwwg ','  gwwggggwwg  ','  gwwwwwwwwg  ','gggwwwwwwwwg  ','gwwwwwwwwwwg  ',' gggwwggwwgg  ','   gww  wwg   '],mousePixels=['  gg    gg    ',' gppg  gppg   ','  gggggggg    ',' gggggggggg   ','ggggkgggkggg  ','gggggggggggn  ',' gggggggggg   ','  gggggggg  gg','  gg    ggggg '],fishPixels=['     aa       ','   aaooaa   aa','  aooooooaaaao',' aooaoaooooooo',' aooookooooooo','  aooooooaaaao','   aaooaa   aa','     aa       '];
function pixel(rows,x,y,scale,palette,flip=false){ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip){ctx.translate(rows[0].length*scale,0);ctx.scale(-1,1);}rows.forEach((r,yy)=>[...r].forEach((c,xx)=>{if(palette[c]){ctx.fillStyle=palette[c];ctx.fillRect(xx*scale,yy*scale,scale,scale);}}));ctx.restore();}
function sprite(name,x,y,w,h,flip=false){if(!art[name])return false;ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(art[name],0,0,w,h);ctx.restore();return true;}
function viewW(){return canvas.width/canvas.height*540;}
function catFrame(){
 if(!player.grounded)return player.vy<0?6:7;
 if(Math.abs(player.vx)>220)return 4+Math.floor(elapsed*9)%2;
 if(Math.abs(player.vx)>0)return Math.floor((elapsed+endingTime)*9)%4;
 return 1;
}
function animatedCat(){
 const frame=catFrame(),sheet=art.catAnimation;
 ctx.save();
 // A crisp dark outline and pale rim separate the cat from foliage.
 ctx.shadowColor='#102139';ctx.shadowBlur=3;ctx.shadowOffsetY=1;
 if(art.run&&player.grounded&&Math.abs(player.vx)>220){
  const runSheet=art.run,frame=Math.floor(elapsed*9)%4,cw=runSheet.width/4;
  // Match the walking sheet scale: each walk frame is square; the run sheet has taller transparent margins.
  const drawHeight=64*runSheet.height/cw;
  ctx.translate(Math.round(player.x+19),Math.round(player.y+38-drawHeight*.71));
  if(player.dir<0)ctx.scale(-1,1);
  ctx.drawImage(runSheet,frame*cw,0,cw,runSheet.height,-40,0,80,drawHeight);
 }else if(sheet){
  const cw=sheet.width/4,ch=sheet.height/2,baseline=[.90,.90,.90,.90,.77,.82,.85,.85][frame];
  const bob=player.grounded&&player.vx?Math.sin(elapsed*(Math.abs(player.vx)>220?26:18))*.7:0;
  ctx.translate(Math.round(player.x+19),Math.round(player.y+38-64*baseline+bob));
  if(player.dir<0)ctx.scale(-1,1);
  ctx.drawImage(sheet,(frame%4)*cw,Math.floor(frame/4)*ch,cw,ch,-40,0,80,64);
 }else if(!sprite('cat',player.x-20,player.y-10,68,48,player.dir<0))pixel(catPixels,player.x-2,player.y-2,3,{g:'#909da1',w:'#f9f6e9',k:'#263e44',n:'#e4aaa6'},player.dir<0);
 ctx.restore();
}
function animatedMouse(m){
 const sheet=art.mouseAnimation;
 if(!sheet)return false;
 const frame=Math.floor(elapsed*9+m.min*.01)%4,cw=sheet.width/4;
 ctx.save();ctx.translate(Math.round(m.x+17),Math.round(m.y-8+Math.sin(elapsed*18+m.min)*.5));
 if(m.v<0)ctx.scale(-1,1);
 ctx.drawImage(sheet,frame*cw,0,cw,sheet.height,-27,0,54,44);ctx.restore();return true;
}
function sleepingCat(tx){
 const age=endingTime-1.3,blend=Math.max(0,Math.min(1,age/.18));
 if(blend<=0)return;
 const breath=age>=2.1?Math.sin((age-2.1)*2.1)*.55:0;
 ctx.save();ctx.globalAlpha=blend;
 const sheet=art.settle;
 if(sheet){
  const pose=Math.min(3,Math.floor(age/.7)),transition=pose<3?Math.max(0,(age% .7-.52)/.18):0,cw=sheet.width/4;
  const paint=(i,alpha)=>{ctx.globalAlpha=blend*alpha;ctx.drawImage(sheet,i*cw,0,cw,sheet.height,tx+16,GROUND-78-breath,48,64+breath);};
  paint(pose,1-transition);if(transition>0)paint(pose+1,transition);
 }else if(!sprite('sleep',tx+16,GROUND-53-breath,46,30+breath))sprite('cat',tx+16,GROUND-49-breath,44,26+breath);
 ctx.font='bold 10px monospace';ctx.textAlign='center';
 if(age>=2.1)for(let i=0;i<3;i++){const t=((age-2.1)*.45+i/3)%1;ctx.globalAlpha=blend*(1-t);ctx.fillStyle='#253a61';ctx.fillText('z',tx+48+t*14,GROUND-55-t*30);}
 ctx.restore();
}

// Deterministic stone and grass tiles; visuals never change collision geometry.
function noise(n){return Math.abs(Math.sin(n*127.1+311.7)*43758.5453)%1;}
function forestTerrain(p){
 // Every pattern is anchored to the platform, never to the scrolling camera.
 const first=step=>p.x+Math.max(0,Math.floor((camera-50-p.x)/step))*step;
 const right=Math.min(p.x+p.w,camera+viewW()+50);
 ctx.save();ctx.beginPath();ctx.rect(p.x,p.y-6,p.w,p.h+6);ctx.clip();
 if(p.oneWay){
 ctx.fillStyle='#493b29';ctx.fillRect(p.x,p.y,p.w,23);ctx.fillStyle='#856238';ctx.fillRect(p.x,p.y+4,p.w,15);
 for(let x=first(9);x<right;x+=9){ctx.fillStyle=noise(x)>.5?'#58442d':'#a47c43';ctx.fillRect(x,p.y+12+noise(x+4)*5,7,2);}
 for(const x of [p.x+3,p.x+p.w-9]){ctx.fillStyle='#d5b575';ctx.fillRect(x,p.y+9,5,11);ctx.fillStyle='#8c6637';ctx.fillRect(x+2,p.y+11,2,7);}
 }else{
 ctx.fillStyle='#705039';ctx.fillRect(p.x,p.y,p.w,p.h);
 // Scattered fine grains, rounded pebbles, and branching roots instead of blocks.
 for(let y=p.y+15;y<p.y+p.h;y+=7)for(let x=first(8);x<right;x+=8){const n=noise(x*3+y*7),px=x+noise(x+y)*7,py=y+noise(x-y)*6;ctx.fillStyle=['#634830','#886340','#79583a','#9c784f','#55432f'][Math.floor(n*5)];ctx.fillRect(px,py,1+n*2,1+noise(y+x+8)*2);if(n>.975){ctx.fillStyle='#a28b64';ctx.beginPath();ctx.ellipse(px,py,3,2,.3,0,Math.PI*2);ctx.fill();}}
 for(let x=first(47);x<right;x+=47){const length=25+noise(x)*55;ctx.strokeStyle='#4e3a29';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,p.y+14);ctx.bezierCurveTo(x+8,p.y+30,x-7,p.y+length*.7,x+3,p.y+length);ctx.moveTo(x+1,p.y+28);ctx.lineTo(x-9,p.y+39);ctx.moveTo(x,p.y+43);ctx.lineTo(x+10,p.y+52);ctx.stroke();}
 }
 // Dense, overlapping moss cushions, with a soft irregular fringe.
 ctx.fillStyle='#385c32';ctx.fillRect(p.x,p.y,p.w,p.oneWay?12:18);
 for(let x=first(6);x<right;x+=6){const n=noise(x+3),depth=p.oneWay?7+n*5:12+n*10;ctx.fillStyle='#4c7935';ctx.beginPath();ctx.ellipse(x+3,p.y+depth*.55,7,depth*.65,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=n>.5?'#78a846':'#65943c';ctx.beginPath();ctx.ellipse(x+3,p.y+3,7,6+n*3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a7c866';ctx.fillRect(x+1,p.y-2,3,2);ctx.fillStyle='#bcd986';ctx.fillRect(x+4,p.y,1,1);}
 ctx.restore();
 for(let x=first(40)+8;x<Math.min(p.x+p.w-8,right);x+=40){ctx.fillStyle='#a4ce68';ctx.fillRect(x,p.y-5,2,7);ctx.fillRect(x-3,p.y-3,7,2);if(noise(x)>.72)flower(x,p.y);}
}

function terrain(p){if(stage===2){forestTerrain(p);return;}ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,p.w,p.h);ctx.clip();ctx.fillStyle='#283c4c';ctx.fillRect(p.x,p.y,p.w,p.h);
 const colors=['#647777','#7b8580','#87928a','#536b70','#8d9185'];
 for(let row=0;row<p.h/25;row++){for(let col=-1;col<p.w/34+1;col++){const x=p.x+col*34+(row%2)*17,y=p.y+row*25+5,n=row*97+col*3+p.x;ctx.fillStyle=colors[Math.floor(noise(n)*5)];ctx.fillRect(x+2,y+2,30,21);ctx.fillStyle='#b3b4a0';ctx.fillRect(x+3,y+2,27,2);ctx.fillRect(x+2,y+4,2,10);ctx.fillStyle='#3b515b';ctx.fillRect(x+4,y+21,26,2);for(let d=0;d<6;d++){ctx.fillStyle=d%2?'#455e62':'#a1a48e';ctx.fillRect(x+4+Math.floor(noise(n+d+8)*24),y+5+Math.floor(noise(n+d+31)*14),2,2);}if(noise(n+2)>.62){ctx.fillStyle='#356549';ctx.fillRect(x+2,y+2,7,9);ctx.fillStyle='#78a456';ctx.fillRect(x+2,y+2,4,4);}}}
 ctx.fillStyle='#254c40';ctx.fillRect(p.x,p.y,p.w,10);ctx.fillStyle='#699b43';ctx.fillRect(p.x,p.y,p.w,5);ctx.fillStyle='#d4e68a';ctx.fillRect(p.x,p.y,p.w,2);
 for(let x=p.x;x<p.x+p.w;x+=5){let n=noise(x);ctx.fillStyle=n>.5?'#88b854':'#adc969';ctx.fillRect(x,p.y+2,3,3+n*9);if(n>.8){ctx.fillStyle='#568c48';ctx.fillRect(x,p.y+8,3,12+n*5);}}ctx.restore();
 for(let x=p.x+8;x<p.x+p.w;x+=19){ctx.fillStyle='#a6ce65';ctx.fillRect(x,p.y-3,2,4);if(noise(x)>.5){ctx.fillStyle='#76ab4f';ctx.fillRect(x+3,p.y-5,2,6);}}
}
function flower(x,y){ctx.fillStyle='#3f7b48';ctx.fillRect(x,y-17,2,17);ctx.fillRect(x-4,y-8,4,2);ctx.fillStyle='#fff9d7';ctx.fillRect(x-4,y-20,10,3);ctx.fillRect(x-1,y-23,4,10);ctx.fillStyle='#efcf57';ctx.fillRect(x-1,y-20,4,3);}
// Small world decorations are visual only: they never hide holes or block movement.
function details(p){if(stage===2)return;
 const left=p.x+8+Math.max(0,Math.floor((camera-p.x-8)/32))*32,right=Math.min(p.x+p.w-8,camera+viewW()+20);
 for(let x=left;x<right;x+=32){const n=noise(x+p.y),y=p.y;
  if(n>.76){flower(x,y);ctx.fillStyle='#deb1e9';ctx.fillRect(x-3,y-20,3,3);}
  else if(n>.53){ctx.fillStyle='#314f46';ctx.fillRect(x,y-6,10,6);ctx.fillStyle='#88a68d';ctx.fillRect(x+2,y-7,6,4);ctx.fillStyle='#d0cdb0';ctx.fillRect(x+3,y-7,3,1);}
  else if(n>.35){ctx.fillStyle='#d6bb8a';ctx.fillRect(x+3,y-8,2,8);ctx.fillStyle='#b75256';ctx.fillRect(x,y-10,9,4);ctx.fillStyle='#f8dfb0';ctx.fillRect(x+2,y-10,2,2);}
  // Fine moss, root cracks, and hanging ivy break up the stone grid.
  if(p.h>45&&n>.45){for(let d=9;d<Math.min(p.h-5,35+n*58);d+=5){const vx=x+Math.round(Math.sin(d*.15)*3);ctx.fillStyle='#304d45';ctx.fillRect(vx,y+d,2,6);ctx.fillStyle=d%2?'#5b874b':'#87a55e';ctx.fillRect(vx+(d%2?-3:1),y+d,4,3);}}
  if(p.h>70){ctx.fillStyle='#354954';ctx.fillRect(x+13,y+40,1,9);ctx.fillRect(x+14,y+48,3,1);ctx.fillRect(x+16,y+48,1,6);}
 }
}
function shrub(x,y){ctx.fillStyle='#284e46';ctx.fillRect(x,y-12,35,12);ctx.fillRect(x+6,y-21,24,14);ctx.fillStyle='#47784c';ctx.fillRect(x+3,y-14,29,8);ctx.fillRect(x+9,y-23,15,13);ctx.fillStyle='#82ad5b';ctx.fillRect(x+10,y-23,9,4);ctx.fillRect(x+3,y-14,8,3);ctx.fillStyle='#e5be79';ctx.fillRect(x+22,y-12,2,2);}
function cuteTower(x,y){
 const r=(a,b,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x+a,y+b,w,h);};
 // Plush base and striped sisal posts.
 r(0,132,110,13,'#4d455b');r(3,130,104,10,'#e4aac1');r(8,130,93,3,'#ffe2e4');
 for(const px of [23,82]){r(px,45,12,85,'#765c5b');r(px+2,45,8,85,'#dcb990');for(let yy=49;yy<128;yy+=6)r(px+2,yy,8,2,'#ae856d');r(px+3,46,2,80,'#efd6a6');}
 // Lower mint hammock with a pink blanket.
 r(39,103,40,6,'#4d455b');r(44,109,31,8,'#6caaab');r(49,114,21,5,'#b8e0cf');r(55,107,15,6,'#f3bbcb');
 // Cat-eared house, round doorway, and tiny face details.
 r(1,54,57,48,'#51475b');r(4,57,51,41,'#f3dabb');
 r(3,45,5,15,'#51475b');r(8,49,5,12,'#51475b');r(46,45,5,15,'#51475b');r(41,49,5,12,'#51475b');
 r(6,50,5,10,'#eaaabd');r(43,50,5,10,'#eaaabd');r(6,59,46,4,'#fff0d7');
 r(20,75,20,23,'#685064');r(24,71,12,6,'#685064');r(22,93,16,5,'#dca1bd');
 r(12,68,3,3,'#66536a');r(44,68,3,3,'#66536a');r(26,65,5,3,'#df99b0');
 r(0,98,61,8,'#85738d');r(3,98,55,3,'#c8b6dc');
 // Top cloud cushion with ears and a dangling golden toy.
 r(61,21,48,10,'#53475e');r(64,16,41,10,'#d6b4da');r(69,13,29,8,'#fbe0e5');
 r(65,5,7,13,'#705675');r(67,7,3,10,'#f4becd');r(95,5,7,13,'#705675');r(97,7,3,10,'#f4becd');
 r(77,20,3,2,'#745b78');r(90,20,3,2,'#745b78');r(84,22,3,2,'#d38eac');
 const swing=Math.round(Math.sin(elapsed*2)*3);r(101,31,1,17,'#e8d6ba');r(98+swing,47,7,7,'#dcab51');r(99+swing,47,3,2,'#ffeb9c');
 // Paw-print badge.
 r(77,135,8,5,'#b77797');for(const px of [73,79,85])r(px,132,3,3,'#b77797');
}
function sign(x,y,line1,line2){
 ctx.save();ctx.translate(x,y);
 const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
 // Cedar post, bevelled timber frame and a small brass paw badge.
 r(35,50,12,42,'#443b32');r(38,51,7,41,'#967451');r(39,57,2,32,'#bd9565');
 r(-5,3,94,56,'#243f4260');r(-7,-3,96,57,'#403c34');
 r(-4,-5,90,59,'#755741');r(-1,-2,84,53,'#d1ad76');
 r(2,1,78,46,'#426764');r(4,3,74,42,'#355653');
 r(-1,-2,84,3,'#f1d39b');r(-1,49,84,3,'#a17b50');
 for(const px of [0,80])for(const py of [3,45]){r(px,py,2,2,'#73583c');r(px,py,1,1,'#ffe5af');}
 r(9,28,62,1,'#77938a');
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px "Noto Sans JP",sans-serif';ctx.fillStyle='#fff2d3';ctx.fillText(line1,41,17);
 ctx.font='9px "Noto Sans JP",sans-serif';ctx.fillStyle='#ead7ad';ctx.fillText(line2,41,38);
 r(32,-13,18,12,'#594b37');r(34,-12,14,11,'#d6ad62');
 r(39,-7,5,4,'#78583d');for(const [px,py] of [[36,-9],[40,-11],[44,-9]])r(px,py,2,2,'#78583d');
 r(27,87,25,5,'#53724b');r(30,83,2,8,'#86a45d');r(48,84,2,7,'#a3b974');
 ctx.restore();
}

function drawCompleteSparkles(w){
 const age=endingTime-7.2;ctx.save();
 for(let i=0;i<32;i++){const speed=22+(i%5)*7,x=(i*.61803398875%1)*w,y=((age*speed+i*43)%560)-10;ctx.globalAlpha=.35+.5*Math.sin(age*2+i)**2;ctx.fillStyle=i%3?'#ffd66c':'#fff9d2';const r=i%3===0?4:2;ctx.fillRect(x-r,y,2*r+1,2);ctx.fillRect(x,y-r,2,2*r+1);}
 ctx.restore();
}
function drawStockLoss(w){
 const age=1.2-restartTime,fade=Math.min(1,age/.12,restartTime/.2),changed=age>=.45;
 ctx.save();ctx.globalAlpha=fade;ctx.fillStyle='#16313d66';ctx.fillRect(0,0,w,540);
 const x=w/2-95,y=220;ctx.fillStyle='#294e58';ctx.fillRect(x-4,y-4,198,88);ctx.fillStyle='#fff0d4';ctx.fillRect(x,y,190,80);
 const face=document.querySelector('#stock-icon');if(face)ctx.drawImage(face,x+18,y+13,52,52);
 ctx.fillStyle='#315667';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('×',x+88,y+40);
 const pop=changed?Math.max(0,1-(age-.45)/.25):0;
 ctx.save();ctx.translate(x+133,y+40);ctx.scale(1+pop*.22,1+pop*.22);ctx.fillStyle=changed?'#db765e':'#315667';ctx.fillText(String(changed?stock:stock+1),0,0);ctx.restore();
 if(age>.3&&age<.85){ctx.globalAlpha=fade*(1-(age-.3)/.55);ctx.font='bold 19px sans-serif';ctx.fillStyle='#bd5b4c';ctx.fillText('−1',x+162,y+17-(age-.3)*32);}
 ctx.restore();
}

function draw(){const w=viewW();ctx.setTransform(canvas.width/w,0,0,canvas.height/540,0,0);ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#3c95ed';ctx.fillRect(0,0,w,540);
 if(stage===2)drawForest(w);
 else if(art.background){const bw=540*art.background.width/art.background.height;const offset=(camera*.035)%bw;for(let i=-1;i<=Math.ceil(w/bw)+1;i++){const x=i*bw-offset;ctx.save();if(i%2){ctx.translate(x+bw,0);ctx.scale(-1,1);ctx.drawImage(art.background,0,0,bw,540);}else ctx.drawImage(art.background,x,0,bw,540);ctx.restore();}}
 // Atmospheric veil affects only the distant scenery, not the game objects.
 ctx.fillStyle='rgba(225,237,245,.32)';ctx.fillRect(0,0,w,540);
 ctx.fillStyle='#268ddb';ctx.fillRect(0,501,w,39);for(let i=0;i<60;i++){ctx.fillStyle=i%2?'#d2f5ff':'#6bc9ff';ctx.fillRect(((i*57-elapsed*20-camera*.3)%(w+70)+w+70)%(w+70)-35,506+i%6*6,10+i%4*5,2);}
 ctx.save();ctx.translate(-Math.round(camera),0);
 // Rear walls use the same stone and grass, softened to read behind the action.
 for(const p of platforms.filter(p=>p.oneWay)){if(p.x+p.w<camera||p.x>camera+w)continue;ctx.save();terrain(p);details(p);if(stage===1){ctx.fillStyle='rgba(173,198,210,.24)';ctx.fillRect(p.x,p.y+5,p.w,p.h-5);}ctx.restore();}
 for(const p of platforms){if(p.oneWay||p.x+p.w<camera||p.x>camera+w)continue;terrain(p);details(p);}
 const signX=WORLD/2-41;if(signX>camera-90&&signX<camera+w)sign(signX,GROUND-92,'中間地点','あと半分！ →');
 for(let i=0;i<SECTION_COUNT;i++){const x=i*SECTION+155;if(x>camera-50&&x<camera+w){shrub(x,GROUND);flower(x+80,GROUND);}}
 for(const f of fish)if(!f.taken&&f.x>camera-30&&f.x<camera+w+30){const y=f.y+Math.sin(elapsed*3+f.x)*3;if(f.value===2){const phase=(elapsed+f.x*.0017)%2.2;if(phase<.4){ctx.save();ctx.globalAlpha=Math.sin(phase/.4*Math.PI)*.85;for(const [dx,dy,r] of [[14,-11,4],[-14,-5,2],[8,12,2]]){const px=f.x+dx,py=y+dy;ctx.fillStyle='#fff1aa';ctx.fillRect(px-r,py,2*r+1,1);ctx.fillRect(px,py-r,1,2*r+1);ctx.fillStyle='#fff';ctx.fillRect(px-1,py-1,3,3);}ctx.restore();}}ctx.save();if(f.value===2)ctx.filter='brightness(1.13) saturate(1.05)';if(!sprite('taiyaki',f.x-18,y-12,36,24))pixel(fishPixels,f.x-14,y-8,2,{a:'#ab6d40',o:'#f4bb66',k:'#493e38'});ctx.restore();}
 for(const m of mice)if(m.alive&&m.x>camera-40&&m.x<camera+w+40){ctx.save();ctx.fillStyle='#15293e80';ctx.fillRect(m.x+2,m.y+m.h-2,30,4);ctx.shadowColor='#fff0d2';ctx.shadowBlur=3;if(m.kind==='hopper')drawHopper(m);else if(!animatedMouse(m)&&!sprite('mouse',m.x,m.y,m.w,m.h,m.v<0))pixel(mousePixels,m.x-2,m.y+2,2.5,{g:'#595365',p:'#efa5ac',k:'#172537',n:'#f4bbb0'},m.v<0);ctx.restore();}
 for(const heart of heartDrops)if(heart.x>camera-30&&heart.x<camera+w+30){const bob=Math.sin(elapsed*4+heart.x)*2;if(heartArt.complete&&heartArt.naturalWidth)ctx.drawImage(heartArt,heart.x,heart.y+bob,26,26);}
 const tx=WORLD-200;if(!sprite('tower',tx-22,GROUND-180+GOAL_OFFSET,160,180))cuteTower(tx,GROUND-145);
 for(const b of shots){ctx.fillStyle='#a5fff0';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle='#fffbe5';ctx.fillRect(b.x,b.y+1,b.w,2);}
 const ending=state==='arriving'||state==='clear';
 if(player.grounded&&!ending){ctx.fillStyle='#132c4770';ctx.fillRect(player.x-6,player.y+36,50,4);}
 if(ending){
  const blend=Math.max(0,Math.min(1,(endingTime-1.3)/.18));
  if(blend<1){ctx.save();ctx.globalAlpha=1-blend;animatedCat();ctx.restore();}
  ctx.save();ctx.translate(0,GOAL_OFFSET);sleepingCat(tx);ctx.restore();
 }else if(player.inv<=0||Math.floor(player.inv*12)%2===0)animatedCat();
 for(const p of particles){ctx.globalAlpha=p.t*2;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);}ctx.globalAlpha=1;ctx.restore();if(state==='restarting')drawStockLoss(w);if(state==='clear'&&completeCelebrated)drawCompleteSparkles(w);}
function resize(){const r=canvas.getBoundingClientRect();const width=Math.round(r.width/r.height*540);if(canvas.width!==width)canvas.width=width;canvas.height=540;draw();}window.addEventListener('resize',resize);
function press(k){if(state!=='playing')return;if((k==='left'||k==='right')&&!keys[k]){const now=performance.now();dash[k]=now-lastTap[k]<300;lastTap[k]=now;}if(k==='jump'&&!keys.jump)jumpQueued=true;keys[k]=true;}
function release(k){keys[k]=false;if(k in dash)dash[k]=false;}
const mapping={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'jump',ArrowUp:'jump',KeyW:'jump',KeyX:'beam',KeyJ:'beam',KeyZ:'beam'};
window.addEventListener('keydown',e=>{if(mapping[e.code]){e.preventDefault();if(!e.repeat)press(mapping[e.code]);}if(e.code==='KeyP'&&!e.repeat)pause();});window.addEventListener('keyup',e=>{if(mapping[e.code]){e.preventDefault();release(mapping[e.code]);}});
document.querySelectorAll('[data-key]').forEach(b=>{
 const pointers=new Set(),touches=new Set();
 const activate=()=>{press(b.dataset.key);b.classList.add('active');};
 const deactivate=()=>{if(!pointers.size&&!touches.size){release(b.dataset.key);b.classList.remove('active');}};
 b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;e.preventDefault();b.setPointerCapture(e.pointerId);pointers.add(e.pointerId);activate();});
 const end=e=>{if(e.pointerType==='touch')return;pointers.delete(e.pointerId);deactivate();};
 b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
 // Explicit non-passive Touch Events also suppress Safari's double-tap zoom.
 b.addEventListener('touchstart',e=>{e.preventDefault();for(const t of e.changedTouches)touches.add(t.identifier);activate();},{passive:false});
 b.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
 const touchEnd=e=>{e.preventDefault();for(const t of e.changedTouches)touches.delete(t.identifier);deactivate();};
 b.addEventListener('touchend',touchEnd,{passive:false});b.addEventListener('touchcancel',touchEnd,{passive:false});
 window.addEventListener('blur',()=>{pointers.clear();touches.clear();deactivate();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pointers.clear();touches.clear();deactivate();}});
});
const gameSurface=document.querySelector('#game');
gameSurface.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
for(const eventName of ['gesturestart','gesturechange','gestureend'])gameSurface.addEventListener(eventName,e=>e.preventDefault(),{passive:false});
document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('dragstart',e=>e.preventDefault());document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});window.addEventListener('blur',()=>{clearKeys();if(state==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearKeys();if(state==='playing')pause();}});
ui.start.onclick=start;document.querySelector('#pause').onclick=pause;document.querySelector('#sound').onclick=()=>{sound=!sound;document.querySelector('#sound').textContent='音 '+(sound?'ON':'OFF');tone(660);};
function frame(t){if(!last)last=t;acc+=Math.min((t-last)/1000,.05);last=t;while(acc>=1/120){step(1/120);acc-=1/120;}draw();requestAnimationFrame(frame);}reset();resize();requestAnimationFrame(frame);





document.querySelector('#stage-select').addEventListener('change',event=>{stage=Number(event.target.value);reset();state='ready';show(stage===2?'木漏れ日の森':'ねこビーム','たい焼きを集めて、キャットハウスをめざそう！','冒険をはじめる');});

