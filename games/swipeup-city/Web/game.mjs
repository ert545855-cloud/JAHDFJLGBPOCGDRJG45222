import { makeScene,T,toWorld } from './scene.mjs';
import { CityLife } from './life.mjs';

const $=id=>document.getElementById(id);
const ids=['view','pause','hud','cash','social','place','tour','task','speed','map','map-canvas','toast','action-bar',
  'interact','vehicle','touch','stick','run','jump','controls','intro','start','loading','menu','menu-title',
  'menu-summary','close-menu','options','menu-notice'];
const ui=Object.fromEntries(ids.map(id=>[id,$(id)]));
const deg=T.MathUtils.degToRad;
const clamp=T.MathUtils.clamp;
const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const toward=(a,b,d)=>a<b ? Math.min(a+d,b) : Math.max(a-d,b);
const number=new Intl.NumberFormat('tr-TR');
const keyboard=!(matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints>0);
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'ShiftLeft','ShiftRight','Space','KeyF','KeyE','KeyK','Escape']);
let storage;
try { storage=localStorage; } catch { /* Private browsing may disable storage. */ }

function play(gfx) {
  const {world,camera,player,cars,decor}=gfx;
  const life=new CityLife(world,storage);
  const stations=world.stations.map(s=>({...s,center:toWorld(s.position),reach:s.radius/100}));
  const stops=world.tour.map(s=>({...s,center:toWorld(s.position),reach:s.radius/100}));
  const visited=new Set();
  const collision=world.solids.map(({center,size})=>{
    const p=toWorld(center), half=new T.Vector3(size[0],size[2],size[1]).multiplyScalar(.005);
    return new T.Box3(p.clone().sub(half),p.clone().add(half));
  });
  const obstacles=collision.filter(box=>box.max.y>.48);
  const walkSurfaces=collision.filter(box=>box.max.y<=.48);
  const ray=new T.Ray();
  const hit=new T.Vector3();
  const position=player.root.position;
  const spawn=position.clone();
  const map=ui['map-canvas'].getContext('2d');
  const keys=new Set();
  const stick={id:null,x:0,y:0};
  const look={id:null,x:0,y:0};
  const eye=new T.Vector3();
  const target=new T.Vector3();
  const cameraOffset=new T.Vector3();
  let active=false, driving=null, nearby=null, station=null;
  let yaw=0, pitch=.39, verticalSpeed=0, footSpeed=0, jump=false, brake=false, running=false, follow=false;
  let toast='', toastUntil=0, lastTime=performance.now(), artTime=0, lastDraw=0, nextHud=0, wasHidden=false;

  function floor(x,z) {
    let height=-Infinity;
    for (const box of walkSurfaces) {
      if (x>=box.min.x && x<=box.max.x && z>=box.min.z && z<=box.max.z) height=Math.max(height,box.max.y);
    }
    return height;
  }
  function blocked(x,y,z,radius=.33) {
    return obstacles.some(b=>y+.10<b.max.y && y+1.50>b.min.y &&
      x+radius>b.min.x && x-radius<b.max.x && z+radius>b.min.z && z-radius<b.max.z);
  }
  function carBox(entry,x,z,yaw) {
    const length=entry.spec.halfLength/100, width=entry.spec.halfWidth/100;
    const c=Math.cos(yaw), s=Math.sin(yaw);
    return { x,z,c,s,length,width,rx:Math.abs(c)*length+Math.abs(s)*width,rz:Math.abs(s)*length+Math.abs(c)*width };
  }
  function blocksCar(entry,x,z,yaw) {
    const {c,s,length,width,rx,rz}=carBox(entry,x,z,yaw);
    for (const b of obstacles) {
      if (b.min.y>entry.root.position.y+1.1 || x+rx<=b.min.x || x-rx>=b.max.x || z+rz<=b.min.z || z-rz>=b.max.z) continue;
      const bx=(b.max.x+b.min.x)/2-x, bz=(b.max.z+b.min.z)/2-z;
      const hx=(b.max.x-b.min.x)/2, hz=(b.max.z-b.min.z)/2;
      if (Math.abs(bx*c-bz*s)<length+hx*Math.abs(c)+hz*Math.abs(s) &&
          Math.abs(bx*s+bz*c)<width+hx*Math.abs(s)+hz*Math.abs(c)) return true;
    }
    return cars.some(other=>{
      if (other===entry) return false;
      const a=carBox(other,other.root.position.x,other.root.position.z,other.root.rotation.y);
      const dx=a.x-x, dz=a.z-z;
      if (Math.abs(dx)>=rx+a.rx || Math.abs(dz)>=rz+a.rz) return false;
      const alignment=Math.abs(c*a.c+s*a.s), across=Math.abs(s*a.c-c*a.s);
      return Math.abs(dx*c-dz*s)<length+a.length*alignment+a.width*across &&
        Math.abs(dx*s+dz*c)<width+a.length*across+a.width*alignment &&
        Math.abs(dx*a.c-dz*a.s)<a.length+length*alignment+width*across &&
        Math.abs(dx*a.s+dz*a.c)<a.width+length*across+width*alignment;
    });
  }
  function hitsParkedCar(x,y,z,radius=.30,excluded=null) {
    return cars.some(entry=>{
      if (entry===excluded || y>entry.root.position.y+1.1) return false;
      const dx=x-entry.root.position.x,dz=z-entry.root.position.z,a=entry.root.rotation.y;
      return Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<entry.spec.halfLength/100+radius &&
             Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<entry.spec.halfWidth/100+radius;
    });
  }
  function message(text) { toast=text; toastUntil=life.clock+4; nextHud=0; }

  function resetWalker() {
    position.copy(spawn);
    player.root.rotation.y=deg(world.spawn.heading);
    verticalSpeed=0; yaw=0; pitch=.39; follow=false;
  }
  function foot(dt,steer,forward,fast) {
    const x=(steer*Math.cos(yaw)-forward*Math.sin(yaw))*(fast?6.3:3.85);
    const z=(-steer*Math.sin(yaw)-forward*Math.cos(yaw))*(fast?6.3:3.85);
    const safe=(x,z)=>!blocked(x,position.y,z) && !hitsParkedCar(x,position.y,z);
    footSpeed=Math.hypot(x,z);
    if (footSpeed>.05) {
      const bearing=Math.atan2(-z,x);
      player.root.rotation.y+=Math.atan2(Math.sin(bearing-player.root.rotation.y),Math.cos(bearing-player.root.rotation.y))*Math.min(1,dt*15);
    }
    const nx=position.x+x*dt, nz=position.z+z*dt;
    if (safe(nx,position.z)) position.x=nx;
    if (safe(position.x,nz)) position.z=nz;
    const g=floor(position.x,position.z);
    if (verticalSpeed<=0 && position.y<=g+.015) {
      position.y=g;
      verticalSpeed=jump ? 5.1 : 0;
    } else verticalSpeed-=dt*13.5;
    if (verticalSpeed) position.y+=verticalSpeed*dt;
    if (position.y<-1.55) { resetWalker(); message('Rıhtıma geri döndün.'); }
    jump=false;
  }
  function drive(dt,steer,throttle,stopping) {
    const {root,spec,wheels}=driving;
    const top=spec.topSpeed/100;
    const goal=stopping ? 0 : throttle*top*(throttle<0 ? .34 : 1);
    driving.speed=toward(driving.speed,goal,dt*(stopping ? 17 : throttle ? spec.acceleration/100 : 4.1));
    const speed=driving.speed;
    const old=root.rotation.y;
    const angle=old-steer*deg(spec.turnRate)*Math.min(Math.abs(speed)/5.1,1)*Math.sign(speed)*dt;
    const x=root.position.x+Math.cos(angle)*speed*dt;
    const z=root.position.z-Math.sin(angle)*speed*dt;
    if (!blocksCar(driving,x,z,angle)) {
      root.position.x=x; root.position.z=z; root.rotation.y=angle;
      driving.roll-=speed*dt/(spec.wheelRadius/100);
    } else driving.speed*=.19;
    const h=floor(root.position.x,root.position.z);
    if (!Number.isFinite(h)) {
      root.position.copy(driving.home); root.rotation.y=deg(spec.heading); driving.speed=0;
      driving=null; player.root.visible=true; resetWalker(); message('Araç garaja döndü.');
      return;
    }
    root.position.y=h+spec.bodyHeight/100;
    for (const {joint,wheel,front,side} of wheels) {
      joint.rotation.y=front ? -steer*.31 : 0;
      wheel.rotation.z=side===1 ? -driving.roll : driving.roll;
    }
    const change=root.rotation.y-old;
    yaw+=change;
  }
  function updateNear() {
    const p=driving?.root.position ?? position;
    station=null;
    let best=Infinity;
    for (const item of stations) {
      const distance=horizontal(p,item.center);
      if (distance<item.reach && distance<best) { station=item; best=distance; }
    }
    nearby=null;
    if (!driving) {
      best=3.4;
      for (const entry of cars) {
        const distance=horizontal(p,entry.root.position);
        if (distance<best) { nearby=entry; best=distance; }
      }
    }
    for (const [index,stop] of stops.entries()) {
      if (horizontal(p,stop.center)<stop.reach && !visited.has(index)) {
        visited.add(index); message(visited.size===stops.length ? 'Dört durağı da keşfettin!' : 'Yeni durak keşfedildi.');
      }
    }
  }
  function switchVehicle() {
    if (!active || ui.menu.open) return;
    if (driving) {
      if (Math.abs(driving.speed)>4) { message('İnmeden önce yavaşla.'); return; }
      const {root,spec}=driving;
      const angle=root.rotation.y;
      for (const side of [1,-1]) {
        const distance=side*(spec.halfWidth/100+.66);
        const x=root.position.x+Math.sin(angle)*distance, z=root.position.z+Math.cos(angle)*distance;
        const surface=floor(x,z);
        if (!Number.isFinite(surface) || blocked(x,surface,z) || hitsParkedCar(x,surface,z,.33,driving)) continue;
        position.set(x,surface,z); player.root.rotation.y=angle; player.root.visible=true; verticalSpeed=0;
        driving.speed=0; driving=null; follow=false; updateNear(); updateHud(); return;
      }
      message('Kapının yanında inilecek yer yok.');
    } else if (nearby) {
      if (!life.ownsCar(nearby.spec.id)) { message('Anahtar Liman Garajı’nda · '+nearby.spec.price+' kredi'); return; }
      driving=nearby; player.root.visible=false;
      yaw=driving.root.rotation.y-Math.PI/2; pitch=.40; follow=false;
      updateNear(); updateHud();
    }
  }

  function mapPoint(x,z) { return [100+x*.68,79+(z-10)*.68]; }
  function drawMap(objective) {
    if (!map || ui.map.hidden) return;
    map.fillStyle='#397e91'; map.fillRect(0,0,200,180);
    const [left,top]=mapPoint(-142,-113), [right,bottom]=mapPoint(142,95);
    map.fillStyle='#457769'; map.fillRect(left,top,right-left,bottom-top);
    const [pierX,pierZ]=mapPoint(46.6,94);
    map.fillStyle='#a89976'; map.fillRect(pierX,pierZ,5,26);
    for (const [x,z,w,h] of [[-142,21,284,7],[-142,65,284,8],[-3,-113,6,203],[-100,-113,6,200],[102,-113,6,200]]) {
      const [px,py]=mapPoint(x,z);
      map.fillStyle='#b6b99b'; map.fillRect(px,py,w*.68,h*.68);
    }
    for (const [index,stop] of stops.entries()) {
      const [x,z]=mapPoint(stop.center.x,stop.center.z);
      map.beginPath(); map.arc(x,z,4,0,Math.PI*2); map.fillStyle=visited.has(index)?'#96e0ae':'#ffca7a'; map.fill();
    }
    if (objective?.station) {
      const goal=stations.find(s=>s.id===objective.station);
      const [x,z]=mapPoint(goal.center.x,goal.center.z);
      map.strokeStyle='#fff4cc'; map.lineWidth=2;
      map.strokeRect(x-5,z-5,10,10);
    }
    const p=driving?.root ?? player.root;
    const [x,z]=mapPoint(p.position.x,p.position.z);
    map.save(); map.translate(x,z); map.rotate(-p.rotation.y);
    map.beginPath(); map.moveTo(7,0); map.lineTo(-4,4); map.lineTo(-3,0); map.lineTo(-4,-4); map.closePath();
    map.fillStyle='#fff'; map.fill(); map.restore();
  }
  function updateHud() {
    const s=life.state, objective=life.objective();
    const p=driving?.root.position ?? position;
    const truePlace=station?.name ?? (p.z>89?'Yelken İskelesi':p.z>60?'Sahil Bulvarı':p.z>29?'Çarşı':'Yukarı Mahalle');
    ui.cash.textContent=number.format(s.cash)+' kredi';
    ui.social.textContent=number.format(s.community)+' sosyal puan';
    ui.place.textContent=truePlace;
    ui.tour.textContent=visited.size+' / '+stops.length+' durak';
    ui.task.textContent=objective ? objective.text+(objective.station?' · '+stations.find(item=>item.id===objective.station).name:'')
      : s.cafeLevel ? 'Kafe seviye '+s.cafeLevel+' · '+s.supplies+' malzeme' : '';
    ui.speed.hidden=!driving;
    ui.speed.textContent=driving ? driving.spec.name+' · '+Math.round(Math.abs(driving.speed)*3.6)+' km/sa' : '';
    const notice=life.notice || (life.clock<toastUntil ? toast : '');
    ui.toast.hidden=!notice;
    if (ui.toast.textContent!==notice) ui.toast.textContent=notice;
    const dance=life.activity?.type==='dance' && station?.id==='Stage';
    ui.interact.hidden=!dance && !life.choices(station?.id,!!driving,driving?.speed).length;
    ui.interact.textContent=(keyboard?'F · ':'')+(dance?'Ritme bas':'Etkileş');
    ui.vehicle.hidden=!(nearby || driving);
    ui.vehicle.textContent=(keyboard?'E · ':'')+(driving?'Araçtan in':nearby && !life.ownsCar(nearby.spec.id)?'Anahtarı gör':'Araca bin');
    ui.jump.textContent=driving?'Fren':'Zıpla';
    ui.run.hidden=!!driving;
    const legend=driving?'<kbd>W/S</kbd> Gaz / geri <kbd>A/D</kbd> Direksiyon <kbd>Space</kbd> Fren <kbd>E</kbd> İn':
      '<kbd>WASD</kbd> Hareket <kbd>Fare</kbd> Kamera <kbd>Shift</kbd> Koş <kbd>Space</kbd> Zıpla';
    if (ui.controls.innerHTML!==legend) ui.controls.innerHTML=legend;
    decor[0].visible=s.cafeLevel>=2; decor[1].visible=s.cafeLevel>=3;
    drawMap(objective);
  }

  function releaseInputs() {
    keys.clear(); jump=false; brake=false; look.id=null; stick.id=null;
    stick.x=0; stick.y=0;
    ui.stick.style.removeProperty('--stick-x');
    ui.stick.style.removeProperty('--stick-y');
  }
  function showMenu(title,summary,options,run) {
    releaseInputs();
    ui['menu-title'].textContent=title;
    ui['menu-summary'].textContent=summary;
    ui['menu-notice'].textContent='';
    ui.options.replaceChildren();
    for (const option of options) {
      const button=document.createElement('button');
      button.type='button';
      button.textContent=option.label;
      button.addEventListener('click',()=>run(option.id));
      ui.options.append(button);
    }
    if (!ui.menu.open) ui.menu.showModal();
  }
  function pause() {
    if (!active || ui.menu.open) return;
    showMenu('Oyun duraklatıldı','Kafe, araçlar ve vardiya ilerlemen bu tarayıcıda kayıtlı.',[
      {id:'resume',label:'Devam et'},{id:'reset',label:'Turu yeniden başlat'},
    ],id=>{
      if (id==='reset') {
        if (driving) { driving.speed=0; driving=null; player.root.visible=true; }
        visited.clear(); resetWalker(); updateNear(); updateHud();
      }
      ui.menu.close();
    });
  }
  function interact() {
    if (!active || ui.menu.open) return;
    if (life.danceBeat(station?.id)) { updateHud(); return; }
    const options=life.choices(station?.id,!!driving,driving?.speed);
    if (!options.length) return;
    const at=station.id;
    const summary=at==='Cafe' && life.state.cafeLevel ? number.format(life.state.cash)+' kredi · '+life.state.supplies+' malzeme' : number.format(life.state.cash)+' kredi';
    showMenu(station.name,summary,options,id=>{
      if (life.select(id,at,!!driving,driving?.speed)) {
        ui.menu.close(); updateHud(); return;
      }
      ui['menu-notice'].textContent=life.notice;
    });
  }
  function stickMove(event) {
    const rect=ui.stick.getBoundingClientRect();
    const x=(event.clientX-rect.left-rect.width/2)/32, y=(event.clientY-rect.top-rect.height/2)/32;
    const amount=Math.max(1,Math.hypot(x,y));
    stick.x=x/amount; stick.y=y/amount;
    ui.stick.style.setProperty('--stick-x',(stick.x*25)+'px');
    ui.stick.style.setProperty('--stick-y',(stick.y*25)+'px');
  }
  ui.stick.addEventListener('pointerdown',event=>{
    if (!active || ui.menu.open || stick.id!==null) return;
    stick.id=event.pointerId; ui.stick.setPointerCapture(event.pointerId); stickMove(event);
  });
  ui.stick.addEventListener('pointermove',event=>{ if (event.pointerId===stick.id) stickMove(event); });
  ui.stick.addEventListener('lostpointercapture',event=>{
    if (event.pointerId!==stick.id) return;
    stick.id=null; stick.x=0; stick.y=0;
    ui.stick.style.removeProperty('--stick-x'); ui.stick.style.removeProperty('--stick-y');
  });
  ui.view.addEventListener('pointerdown',event=>{
    if (active && !ui.menu.open && look.id===null && event.button===0) {
      look.id=event.pointerId; look.x=event.clientX; look.y=event.clientY; ui.view.setPointerCapture(event.pointerId);
    }
  });
  ui.view.addEventListener('pointermove',event=>{
    if (event.pointerId!==look.id) return;
    yaw-=(event.clientX-look.x)*.006;
    pitch=clamp(pitch-(event.clientY-look.y)*.005,.12,1.06);
    look.x=event.clientX; look.y=event.clientY;
  });
  ui.view.addEventListener('lostpointercapture',event=>{ if (look.id===event.pointerId) look.id=null; });
  ui.run.addEventListener('click',()=>{ running=!running; ui.run.setAttribute('aria-pressed',running); });
  ui.jump.addEventListener('pointerdown',event=>{
    if (driving) { brake=true; ui.jump.setPointerCapture(event.pointerId); }
    else jump=true;
  });
  ui.jump.addEventListener('lostpointercapture',()=>{ brake=false; });
  window.addEventListener('blur',releaseInputs);
  document.addEventListener('visibilitychange',releaseInputs);
  addEventListener('keydown',event=>{
    if (!active || ui.menu.open || !movementKeys.has(event.code)) return;
    event.preventDefault(); keys.add(event.code);
    if (event.repeat) return;
    if (event.code==='KeyF') interact();
    if (event.code==='KeyE') switchVehicle();
    if (event.code==='Space') jump=true;
    if (event.code==='KeyK') { ui.map.hidden=!ui.map.hidden; updateHud(); }
    if (event.code==='Escape') pause();
  });
  addEventListener('keyup',event=>keys.delete(event.code));
  ui.pause.addEventListener('click',pause);
  ui.interact.addEventListener('click',interact);
  ui.vehicle.addEventListener('click',switchVehicle);
  ui['close-menu'].addEventListener('click',()=>ui.menu.close());
  ui.menu.addEventListener('close',()=>{ releaseInputs(); nextHud=0; });
  ui.start.addEventListener('click',()=>{
    active=true;
    ui.intro.hidden=true;
    for (const item of [ui.pause,ui.hud,ui.map,ui['action-bar']]) item.hidden=false;
    ui.touch.hidden=keyboard; ui.controls.hidden=!keyboard;
    updateNear(); updateHud();
  });

  function cameraFollow(dt) {
    const source=driving?.root.position ?? position;
    eye.copy(source);
    eye.y+=driving ? .86 : 1.27;
    const length=driving ? 6.3 : 4.05;
    cameraOffset.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    ray.set(eye,cameraOffset);
    let available=length;
    for (const obstacle of obstacles) {
      if (!obstacle.containsPoint(eye) && ray.intersectBox(obstacle,hit)) available=Math.min(available,Math.max(.3,hit.distanceTo(eye)-.18));
    }
    target.copy(eye).addScaledVector(cameraOffset,available);
    if (!follow || camera.position.distanceTo(target)>14) camera.position.copy(target);
    else camera.position.lerp(target,1-Math.exp(-dt*15));
    camera.lookAt(eye);
    follow=true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { wasHidden=true; lastTime=now; return; }
    const dt=clamp((now-lastTime)/1000,0,.10);
    lastTime=now;
    if (wasHidden) { wasHidden=false; follow=false; }
    if (ui.menu.open) return;
    artTime+=dt;
    if (active) {
      const axis=(a,b)=>a.some(k=>keys.has(k))-b.some(k=>keys.has(k));
      let steer=clamp(axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft'])+stick.x,-1,1);
      let forward=clamp(axis(['KeyW','ArrowUp'],['KeyS','ArrowDown'])-stick.y,-1,1);
      if (!driving) {
        const amount=Math.max(1,Math.hypot(steer,forward));
        steer/=amount; forward/=amount;
      }
      const steps=Math.max(1,Math.ceil(dt/.014));
      for (let i=0;i<steps;i++) {
        if (driving) drive(dt/steps,steer,forward,brake||keys.has('Space'));
        else foot(dt/steps,steer,forward,running||keys.has('ShiftLeft')||keys.has('ShiftRight'));
      }
      updateNear();
      life.tick(dt,station?.id,!!driving,driving?.speed ?? footSpeed);
      const mode=life.activity?.type ?? (Math.abs(verticalSpeed)>.25?'jump':'walk');
      player.pose(artTime,mode==='yoga'?0:footSpeed/3.4,mode);
      cameraFollow(dt);
      if (now>=nextHud) { nextHud=now+94; updateHud(); }
    } else {
      camera.position.set(-26.2+Math.sin(artTime*.16)*1.8,3.37,72.2);
      camera.lookAt(-43.2,1.89,58.1);
      player.pose(artTime,0,'walk');
    }
    const drawGap=keyboard ? 12 : 25;
    const sinceDraw=now-lastDraw;
    if (sinceDraw>=drawGap) {
      const focus=active ? driving?.root.position ?? position : {x:-34,z:63};
      gfx.draw(artTime,Math.min(.1,sinceDraw/1000),focus);
      lastDraw=now;
    }
  }
  requestAnimationFrame(frame);
  ui.start.disabled=false;
  ui.start.textContent='Şehre gir';
  ui.loading.textContent='Bilgisayar ve telefon kontrolleri hazır.';
}

try {
  const gfx=await makeScene(ui.view,(loaded,total)=>{ui.loading.textContent='3D modeller · '+loaded+' / '+total;});
  play(gfx);
} catch (error) {
  ui.start.textContent='Şehir yüklenemedi';
  ui.loading.textContent='Sayfayı yenile. Sorun sürerse WebGL 2 destekleyen bir tarayıcı kullan.';
  console.error(error);
}
