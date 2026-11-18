# Swipe Race model paketi: seçili GLB'ler + dokular tek dosyada.
# Biçim: [u32 başlık uzunluğu][başlık JSON][veriler], base64 olarak tek elemanlı bir JSON dizisine yazılır.
# Kullanım: python3 pack.py <racing-kit-dir> <toy-car-kit-dir> <cikti.json>
import json,struct,sys,os,base64
RK, TK, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
R=os.path.join(RK,'Models','GLTF format')+'/'
T=os.path.join(TK,'Models','GLB format')+'/'
racing='''roadStraight roadStart roadStartPositions roadCornerLarge roadCornerLarger roadCornerLargeBorder roadCornerLargeBorderInner
roadCornerLargerBorder roadCornerLargerBorderInner grandStand grandStandCovered grandStandAwning pitsGarage pitsGarageClosed pitsOffice
pitsOfficeRoof treeLarge treeSmall lightPostLarge billboard billboardLow overheadLights tent tentLong flagCheckers flagRed flagGreen
bannerTowerRed bannerTowerGreen barrierRed barrierWhite rail fenceStraight pylon radarEquipment lightRedDouble grandStandRound'''.split()
toy='''vehicle-racer vehicle-racer-low vehicle-speedster vehicle-vintage-racer vehicle-drag-racer vehicle-suv vehicle-truck vehicle-monster-truck
item-coin-gold item-cone smoke'''.split()
def glb_parts(b):
    l=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+l]); off=20+l
    bl,bt=struct.unpack('<II',b[off:off+8]); return j,b[off+8:off+8+bl]
def glb_build(j,bin_):
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
    bin_+=b'\0'*((4-len(bin_)%4)%4)
    total=12+8+len(js)+8+len(bin_)
    return struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bin_),0x004E4942)+bin_
def strip_tex(j):
    for k in ('images','textures','samplers'): j.pop(k,None)
    for m in j.get('materials',[]):
        p=m.get('pbrMetallicRoughness',{}); p.pop('baseColorTexture',None)
    j['extensionsUsed']=[e for e in j.get('extensionsUsed',[]) if e!='KHR_texture_transform']
    if not j['extensionsUsed']: j.pop('extensionsUsed')
    j.pop('extensionsRequired',None)
    return j
entries=[];blob=bytearray()
def add(name,data):
    entries.append([name,len(blob),len(data)]); blob.extend(data); blob.extend(b'\0'*((4-len(blob)%4)%4))
for n in racing:
    b=open(R+n+'.glb','rb').read(); j,bi=glb_parts(b)
    for m in j.get('materials',[]): m.pop('extensions',None)
    j.pop('extensionsUsed',None); j.pop('extensionsRequired',None)
    add(n,glb_build(j,bi))
for n in toy:
    b=open(T+n+'.glb','rb').read(); j,bi=glb_parts(b); add(n,glb_build(strip_tex(j),bi))
for n,p in [('tex0',T+'Textures/colormap.png'),('tex1',os.path.join(TK,'Models','Textures','variation-a.png')),('tex2',os.path.join(TK,'Models','Textures','variation-b.png'))]:
    add(n,open(p,'rb').read())
hdr=json.dumps(entries,separators=(',',':')).encode(); hdr+=b' '*((4-(len(hdr)+4)%4)%4)
raw=struct.pack('<I',len(hdr))+hdr+bytes(blob)
open(OUT,'w').write(json.dumps([base64.b64encode(raw).decode()]))
print(len(entries),'parça',os.path.getsize(OUT)//1024,'KB')
