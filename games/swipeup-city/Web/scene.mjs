import * as T from './vendor/three/three.module.js';

export { T };
export const toWorld = ([x,y,z]) => new T.Vector3(x/100,z/100,-y/100);
const deg = T.MathUtils.degToRad;
const colorLookup = Float32Array.from({length:256},(_,i)=>{
  const value=i/255;
  return value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4;
});
const standard = options => new T.MeshStandardMaterial({vertexColors:true,...options});

function decode(buffer,name,materials) {
  const view=new DataView(buffer);
  const invalid=()=>new Error('Geçersiz model: '+name);
  if (buffer.byteLength<8 || view.getUint32(0)!==0x53434d31) throw invalid();
  const count=view.getUint32(4,true);
  if (!count || count>materials.length) throw invalid();
  let offset=8;
  const sections=[];
  for (let section=0;section<count;section++) {
    if (buffer.byteLength-offset<12) throw invalid();
    const material=view.getUint32(offset,true);
    const vertices=view.getUint32(offset+4,true);
    const indexCount=view.getUint32(offset+8,true);
    offset+=12;
    if (!materials[material] || !vertices || vertices>250000 || !indexCount || indexCount%3 ||
      offset+vertices*28+indexCount*4>buffer.byteLength) throw invalid();
    const position=new Float32Array(vertices*3);
    const normal=new Float32Array(vertices*3);
    const color=new Float32Array(vertices*3);
    for (let i=0;i<vertices;i++,offset+=28) {
      const j=i*3;
      position[j]=view.getFloat32(offset,true)/100;
      position[j+1]=view.getFloat32(offset+8,true)/100;
      position[j+2]=-view.getFloat32(offset+4,true)/100;
      normal[j]=view.getFloat32(offset+12,true);
      normal[j+1]=view.getFloat32(offset+20,true);
      normal[j+2]=-view.getFloat32(offset+16,true);
      color[j]=colorLookup[view.getUint8(offset+24)];
      color[j+1]=colorLookup[view.getUint8(offset+25)];
      color[j+2]=colorLookup[view.getUint8(offset+26)];
    }
    const index=vertices<=65536 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
    for (let i=0;i<indexCount;i+=3,offset+=12) {
      const a=view.getUint32(offset,true);
      const b=view.getUint32(offset+4,true);
      const c=view.getUint32(offset+8,true);
      if (Math.max(a,b,c)>=vertices) throw invalid();
      index[i]=a; index[i+1]=c; index[i+2]=b;
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(position,3));
    geometry.setAttribute('normal',new T.BufferAttribute(normal,3));
    geometry.setAttribute('color',new T.BufferAttribute(color,3));
    geometry.setIndex(new T.BufferAttribute(index,1));
    geometry.computeBoundingSphere();
    sections.push({geometry,material});
  }
  if (offset!==buffer.byteLength) throw invalid();
  return sections;
}

async function load(url,type) {
  const response=await fetch(url);
  if (!response.ok) throw new Error(`${url} · HTTP ${response.status}`);
  return response[type]();
}

function avatar(mesh,style) {
  const root=new T.Group();
  const part=name=>mesh('Avatar'+name+style);
  const body=part('Body');
  root.add(body);
  const joints=[-1,1].map(side=>{
    const arm=part('Arm'), forearm=part('Forearm'), leg=part('Leg'), shin=part('Shin');
    arm.position.set(0,1.30,-side*.23);
    forearm.position.set(0,-.25,-side*.02);
    leg.position.set(0,.87,-side*.10);
    shin.position.y=-.40;
    body.add(arm,leg); arm.add(forearm); leg.add(shin);
    return {side,arm,forearm,leg,shin};
  });
  return {
    root,
    pose(time,movement,mode) {
      const phase=time*(movement>1.15 ? 12 : 8);
      const pulse=Math.sin(time*6);
      body.position.y=movement ? Math.abs(Math.sin(phase))*.04 : Math.sin(time*2.1)*.012;
      body.rotation.x=mode==='dance' ? pulse*.14 : 0;
      for (const {side,arm,forearm,leg,shin} of joints) {
        const stride=side*Math.sin(phase)*Math.min(1,movement);
        arm.rotation.x=side*(mode==='dance' ? -.94-pulse*.26 : mode==='yoga' ? -1.15 : -.10);
        arm.rotation.z=-stride*.49+(mode==='jump' ? .55 : 0);
        forearm.rotation.z=.15+Math.max(0,stride)*.62;
        leg.rotation.z=stride*.60+(mode==='jump' ? -.3 : 0);
        shin.rotation.z=-Math.max(0,stride)*.70;
      }
    },
  };
}

function car(mesh,spec) {
  const root=mesh('CarBody'+spec.id);
  const wheels=[];
  const home=toWorld(spec.position);
  for (const x of [-1,1]) for (const side of [-1,1]) {
    const joint=new T.Group();
    joint.position.set(x*spec.axle/100,(spec.wheelRadius-spec.bodyHeight)/100,-side*spec.wheelSide/100);
    const wheel=mesh('Wheel');
    wheel.scale.set(spec.wheelRadius/34,spec.wheelRadius/34,1);
    if (side===1) wheel.rotation.y=Math.PI;
    root.add(joint); joint.add(wheel);
    wheels.push({joint,wheel,front:x===1,side});
  }
  root.position.copy(home);
  root.rotation.y=deg(spec.heading);
  return {root,wheels,home,spec,speed:0,roll:0,steer:0};
}

export async function makeScene(view,progress) {
  const coarse=matchMedia('(pointer:coarse)').matches;
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,coarse ? 1.25 : 1.6));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=T.AgXToneMapping;
  renderer.toneMappingExposure=1.25;
  const scene=new T.Scene();
  scene.background=new T.Color('#8ac3da');
  scene.fog=new T.FogExp2('#aad0dc',.0027);
  scene.add(new T.HemisphereLight('#ddecff','#b99978',2.0));
  const sun=new T.DirectionalLight('#fff0d2',3.05);
  sun.position.set(-66,116,20);
  sun.target.position.set(5,0,49);
  sun.castShadow=true;
  sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera,{left:-84,right:84,top:76,bottom:-76,near:2,far:240});
  sun.shadow.normalBias=.048;
  sun.shadow.bias=-.00024;
  scene.add(sun,sun.target);
  const waterTime={value:0};
  const water=standard({roughness:.54,metalness:.06});
  water.onBeforeCompile=shader=>{
    shader.uniforms.waterTime=waterTime;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 harborWater;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nharborWater = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float waterTime; varying vec3 harborWater;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float waves = sin(harborWater.x * 1.6 + harborWater.z * 2.4 + waterTime * 0.8)
          * sin(harborWater.x * 0.31 - harborWater.z * 0.52 - waterTime * 0.63);
        diffuseColor.rgb *= 1.0 + 0.105 * waves;
      `);
  };
  const materials=[
    standard({roughness:.83}),
    standard({roughness:.27,metalness:.17}),
    standard({roughness:.50,emissive:'#ba701c',emissiveIntensity:.26}),
    standard({roughness:.94,side:T.DoubleSide}),
    water,
    new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false,toneMapped:false}),
    new T.MeshPhysicalMaterial({vertexColors:true,roughness:.29,metalness:.19,clearcoat:.65,clearcoatRoughness:.18}),
  ];
  const world=await load('./world.json','json');
  if (world.schema!==1 || world.units!=='cm') throw new Error('Şehir verisi uyumsuz.');
  const models=new Map();
  let complete=0;
  await Promise.all(world.meshes.map(async name=>{
    models.set(name,decode(await load('./meshes/'+name+'.scmesh','arrayBuffer'),name,materials));
    progress(++complete,world.meshes.length);
  }));
  function mesh(name) {
    const group=new T.Group();
    for (const {geometry,material} of models.get(name)) {
      const item=new T.Mesh(geometry,materials[material]);
      item.castShadow=material!==4 && material!==5;
      item.receiveShadow=material!==5;
      group.add(item);
    }
    return group;
  }
  for (const name of world.harborMeshes) scene.add(mesh(name));
  const decor=[mesh('CafeDecor2'),mesh('CafeDecor3')];
  decor.forEach(item=>{item.visible=false;scene.add(item);});
  const player=avatar(mesh,0);
  player.root.position.copy(toWorld(world.spawn.position)).y=0;
  player.root.rotation.y=deg(world.spawn.heading);
  scene.add(player.root);
  const cars=world.vehicles.map(spec=>car(mesh,spec));
  cars.forEach(entry=>scene.add(entry.root));
  const pedestrians=world.pedestrians.map(spec=>{
    const actor=avatar(mesh,spec.style);
    const route=spec.waypoints.map(toWorld);
    actor.root.position.copy(route[spec.startIndex]);
    actor.root.scale.setScalar(spec.scale);
    scene.add(actor.root);
    return {actor,route,next:(spec.startIndex+1)%route.length,speed:spec.speed/100};
  });
  const social=world.social.map(spec=>{
    const actor=avatar(mesh,spec.style);
    actor.root.position.copy(toWorld(spec.position));
    actor.root.rotation.y=deg(spec.heading);
    scene.add(actor.root);
    return {actor,phase:spec.phase};
  });
  const camera=new T.PerspectiveCamera(58,1,.09,750);
  const resize=()=>{
    const width=view.clientWidth || innerWidth;
    const height=view.clientHeight || innerHeight;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  };
  view.append(renderer.domElement);
  resize();
  addEventListener('resize',resize);
  const direction=new T.Vector3();
  return {
    world,renderer,scene,camera,player,cars,decor,
    draw(time,dt,focus) {
      waterTime.value=time;
      for (const {actor,phase} of social) actor.pose(time+phase,0,'dance');
      for (const item of pedestrians) {
        const {actor,route,speed}=item;
        direction.subVectors(route[item.next],actor.root.position);
        const distance=direction.length();
        if (distance<.035) item.next=(item.next+1)%route.length;
        else {
          actor.root.position.addScaledVector(direction,Math.min(1,dt*speed/distance));
          actor.root.rotation.y=Math.atan2(-direction.z,direction.x);
        }
        actor.pose(time,.67,'walk');
      }
      if (focus) {
        sun.target.position.set(focus.x,0,focus.z);
        sun.position.set(focus.x-71,116,focus.z-29);
      }
      renderer.shadowMap.needsUpdate=true;
      renderer.render(scene,camera);
    },
  };
}
