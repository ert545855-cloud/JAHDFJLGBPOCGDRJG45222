#!/usr/bin/env python3
# Parti Kupası araç ve korsan paketleri.
# Kullanım: python3 -I games/kupa/pack.py <kenney_car-kit> <kenney_pirate-pack> <çıktı klasörü>
# Car Kit modelleri tarayıcıda yükleyici gerektirmesin diye düz geometriye çevrilir (konumlar int16, normaller int8,
# doku koordinatları uint16); tekerlekler ayrı tutulur (döner, öndekiler direksiyonla kırılır).
import json, struct, base64, os, sys, shutil, math
import xml.etree.ElementTree as ET

CK, PP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
M = os.path.join(CK, 'Models', 'GLB format')
CARS = 'sedan-sports hatchback-sports taxi police race race-future kart-oopi kart-oobi kart-oozi suv-luxury'.split()
PROPS = 'cone box'.split()
CT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def glb(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
    o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0]; return j, b[o + 8:o + 8 + bl]

def acc(j, bin_, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; f, s = CT[a['componentType']]; n = NC[a['type']]
    st = v.get('byteStride', s * n); base = v.get('byteOffset', 0) + a.get('byteOffset', 0); out = []
    for k in range(a['count']):
        out.append(struct.unpack_from('<' + f * n, bin_, base + k * st))
    return out

def qmat(t=None, r=None, s=None):  # TRS -> 4x4 (satır düzeni)
    t = t or [0, 0, 0]; x, y, z, w = r or [0, 0, 0, 1]; sx, sy, sz = s or [1, 1, 1]
    return [[(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y - z * w)) * sy, (2 * (x * z + y * w)) * sz, t[0]],
            [(2 * (x * y + z * w)) * sx, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z - x * w)) * sz, t[1]],
            [(2 * (x * z - y * w)) * sx, (2 * (y * z + x * w)) * sy, (1 - 2 * (x * x + y * y)) * sz, t[2]], [0, 0, 0, 1]]

def mul(a, b): return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def ap(m, p): return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]
def an(m, n):
    v = [m[i][0] * n[0] + m[i][1] * n[1] + m[i][2] * n[2] for i in range(3)]; l = math.sqrt(sum(c * c for c in v)) or 1; return [c / l for c in v]

def collect(path):
    j, bin_ = glb(path); parts = []  # (ad, dünya matrisi, ilkel listesi)
    def walk(ni, pm):
        nd = j['nodes'][ni]; m = mul(pm, qmat(nd.get('translation'), nd.get('rotation'), nd.get('scale')))
        if 'mesh' in nd:
            prims = []
            for pr in j['meshes'][nd['mesh']]['primitives']:
                P = acc(j, bin_, pr['attributes']['POSITION']); N = acc(j, bin_, pr['attributes']['NORMAL']); U = acc(j, bin_, pr['attributes']['TEXCOORD_0'])
                I = [x[0] for x in acc(j, bin_, pr['indices'])]; prims.append((P, N, U, I))
            parts.append((nd.get('name', ''), m, prims))
        for c in nd.get('children', []): walk(c, m)
    I4 = qmat()
    for ni in j['scenes'][j.get('scene', 0)]['nodes']: walk(ni, I4)
    return parts

def geo(prims, m, center=(0, 0, 0)):
    P, N, U, I = [], [], [], []
    for (pp, nn, uu, ii) in prims:
        b = len(P)
        for k in range(len(pp)): q = ap(m, pp[k]); P.append([q[0] - center[0], q[1] - center[1], q[2] - center[2]]); N.append(an(m, nn[k])); U.append(uu[k])
        I += [b + x for x in ii]
    return P, N, U, I

def enc(P, N, U, I, S):
    p = b''.join(struct.pack('<3h', *[max(-32767, min(32767, round(c / S * 32767))) for c in v]) for v in P)
    n = b''.join(struct.pack('<3b', *[max(-127, min(127, round(c * 127))) for c in v]) for v in N)
    u = b''.join(struct.pack('<2H', *[max(0, min(65535, round(c * 65535))) for c in v]) for v in U)
    i = struct.pack('<%dH' % len(I), *I)
    b64 = lambda x: base64.b64encode(x).decode()
    return {'p': b64(p), 'n': b64(n), 'u': b64(u), 'i': b64(i)}

def bake(name, wheels=True):
    parts = collect(os.path.join(M, name + '.glb')); body = []; wl = []
    for nm, m, prims in parts:
        if wheels and nm.startswith('wheel-'):
            P, N, U, I = geo(prims, m); xs = [v[0] for v in P]; ys = [v[1] for v in P]; zs = [v[2] for v in P]
            c = [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2]
            P = [[v[0] - c[0], v[1] - c[1], v[2] - c[2]] for v in P]
            wl.append((c, nm.startswith('wheel-front'), (P, N, U, I)))
        else: body.append((m, prims))
    P, N, U, I = [], [], [], []
    for m, prims in body:
        p, n, u, i = geo(prims, m); b = len(P); P += p; N += n; U += u; I += [b + x for x in i]
    allp = P + [v for _, _, g in wl for v in g[0]]
    S = max(abs(c) for v in allp for c in v) * 1.001 or 1
    xs = [v[0] for v in P]; zs = [v[2] for v in P]
    out = {'s': S, 'body': enc(P, N, U, I, S), 'len': max(zs) - min(zs), 'wid': max(xs) - min(xs)}
    if wl:  # aynı tekerlek geometrisi bir kez saklanır
        gs = []; out['wheels'] = []
        for c, f, g in wl:
            e = enc(*g, S); k = next((n for n, x in enumerate(gs) if x == e), None)
            if k is None: gs.append(e); k = len(gs) - 1
            out['wheels'].append({'c': [round(x, 4) for x in c], 'f': f, 'g': k})
        out['wg'] = gs
    return out

os.makedirs(OUT, exist_ok=True)
pack = {'cars': {n: bake(n) for n in CARS}, 'props': {n: bake(n, False) for n in PROPS}}
open(os.path.join(OUT, 'araclar.json'), 'w').write(json.dumps(pack, separators=(',', ':')))
shutil.copy(os.path.join(M, 'Textures', 'colormap.png'), os.path.join(OUT, 'arac-doku.png'))
# Korsan paketi: gemi ve efekt atlası (koordinatlar JSON'a), ada karoları
shutil.copy(os.path.join(PP, 'Spritesheet', 'shipsMiscellaneous_sheet.png'), os.path.join(OUT, 'korsan.png'))
shutil.copy(os.path.join(PP, 'Tilesheet', 'tiles_sheet.png'), os.path.join(OUT, 'ada.png'))
root = ET.parse(os.path.join(PP, 'Spritesheet', 'shipsMiscellaneous_sheet.xml')).getroot()
rects = {s.get('name').replace('.png', '').replace(' (', '').replace(')', ''): [int(s.get(k)) for k in ('x', 'y', 'width', 'height')] for s in root}
open(os.path.join(OUT, 'korsan.json'), 'w').write(json.dumps({'r': rects}, separators=(',', ':')))
print('araçlar', os.path.getsize(os.path.join(OUT, 'araclar.json')) // 1024, 'KB ·', len(rects), 'korsan parçası')
