"""Author the harbor meshes in Blender 4.3 and optionally render an art review.

blender -b -t 6 -P Scripts/build_harbor_art.py -- --render /tmp/harbor.png
"""
from collections import defaultdict
from pathlib import Path
import argparse
import math
import random
import struct
import sys

import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parent.parent
MESHES = PROJECT / "Content/SwipeUpCity/Meshes"
randomness = random.Random(27831)
batches = defaultdict(lambda: ([], [], []))
solids = []

CONCRETE = "e4caa5"
SAND = "f5d799"
TEAL = "4da7a1"
CORAL = "d97760"
BLUE = "397d9a"
CREAM = "fff0ce"
LIME = "95a858"
DARK = "354a55"
WOOD = "b78150"
GLASS = "518998"
ASPHALT = "627275"
GRASS = "839d5d"


def rgb(hex_color):
    return tuple(bytes.fromhex(hex_color))


def tint(hex_color, factor):
    return bytes(min(255, round(v * factor)) for v in rgb(hex_color)).hex()


def linear(value):
    c = value / 255
    return c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4


def add(points, faces, color, key=None, smooth=False, slot=0):
    if key is None:
        cx, cy, _ = points[0]
        key = f"Harbor_{min(3, max(0, int((cx + 142)/71)))}_{min(2, max(0, int((cy + 112)/73)))}"
    verts, polys, styles = batches[(key, slot)]
    start = len(verts)
    verts.extend(points)
    polys.extend(tuple(start + i for i in face) for face in faces)
    styles.extend([(rgb(color), smooth)] * len(faces))


def rounded(x, y, z, w, d, h, radius, color, key=None, slot=0, yaw=0, bevel=.11):
    """Extrude a rounded rectangle, with a small bevel on the top and bottom edges."""
    if radius < .078 and min(w, d, h) < .16:
        box(x, y, z, w, d, h, color, key, slot, yaw)
        return
    radius = min(max(radius, .001), w * .49, d * .49)
    bevel = min(radius * .65, h * .23, bevel)
    vertices = []
    for height, inset in [(-h / 2, bevel), (-h / 2 + bevel, 0), (h / 2 - bevel, 0), (h / 2, bevel)]:
        for sx, sy, angle in [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]:
            for step in range(4):
                a = math.radians(angle + 30 * step)
                px = sx * (w/2 - radius) + math.cos(a) * (radius - inset)
                py = sy * (d/2 - radius) + math.sin(a) * (radius - inset)
                vertices.append((x + math.cos(yaw)*px - math.sin(yaw)*py,
                                 y + math.sin(yaw)*px + math.cos(yaw)*py, z + height))
    faces = [tuple(reversed(range(16)))]
    for layer in range(3):
        base = layer * 16
        for i in range(16):
            j = (i + 1) % 16
            faces.append((base+i, base+j, base+j+16, base+i+16))
    faces.append(tuple(range(48, 64)))
    add(vertices, faces, color, key, slot=slot)


def box(x, y, z, w, d, h, color, key=None, slot=0, yaw=0):
    c, s = math.cos(yaw), math.sin(yaw)
    p = [(x+c*a-s*b, y+s*a+c*b, z+e) for e in (-h/2, h/2)
         for a,b in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]]
    add(p, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], color, key, slot=slot)


def ellipsoid(x, y, z, a, b, c, color, key=None, slot=0, yaw=0):
    seg, rings = 12, 8
    p = [(x, y, z-c)]
    for j in range(1, rings):
        lat = -math.pi/2 + j*math.pi/rings
        for i in range(seg):
            turn = i*math.tau/seg
            u, v = a*math.cos(lat)*math.cos(turn), b*math.cos(lat)*math.sin(turn)
            p.append((x+u*math.cos(yaw)-v*math.sin(yaw), y+u*math.sin(yaw)+v*math.cos(yaw),
                      z+c*math.sin(lat)))
    p.append((x,y,z+c))
    faces = [(0, 1+(i+1)%seg, 1+i) for i in range(seg)]
    for j in range(rings-2):
        for i in range(seg):
            k, m = 1+j*seg+i, 1+j*seg+(i+1)%seg
            faces.append((k,m,m+seg,k+seg))
    top = 1+(rings-2)*seg
    faces.extend((top+i,top+(i+1)%seg,len(p)-1) for i in range(seg))
    add(p, faces, color, key, smooth=True, slot=slot)


def rod(start, end, radius, top, color, key=None, sides=10, slot=0):
    p0, p1 = Vector(start), Vector(end)
    axis = (p1-p0).normalized()
    u = axis.cross(Vector((0,0,1) if abs(axis.z)<.9 else (0,1,0))).normalized()
    v = axis.cross(u)
    points = []
    for p, size in ((p0,radius),(p1,top)):
        points.extend(tuple(p+size*(u*math.cos(t*math.tau/sides)+v*math.sin(t*math.tau/sides))) for t in range(sides))
    faces = [tuple(reversed(range(sides))), tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    add(points, faces, color, key, smooth=True, slot=slot)


def solid(x,y,z,w,d,h):
    solids.append((x,y,z,w,d,h))


def palm(x,y,scale=1):
    end = (x+.9*scale,y+.3*scale,5.7*scale)
    low = (x+.18*scale,y,2.9*scale)
    rod((x,y,.1),low,.23*scale,.16*scale,"aa8359")
    rod(low,end,.16*scale,.13*scale,"b59265")
    ellipsoid(*end,.30*scale,.29*scale,.27*scale,"657546")
    for i in range(9):
        turn = i*math.tau/9 + randomness.uniform(-.12,.12)
        length = randomness.uniform(2.1,2.9)*scale
        droop = randomness.uniform(.3,1.05)*scale
        dx,dy=math.cos(turn),math.sin(turn)
        p=[]
        for j in range(6):
            f=j/5
            width=.49*scale*(math.sin(math.pi*f)**.7)
            rise=math.sin(math.pi*f)*.72*scale-droop*f*f
            cx,cy,cz=end[0]+dx*f*length,end[1]+dy*f*length,end[2]+rise
            p.extend(((cx+dy*width,cy-dx*width,cz-.13*scale),
                      (cx,cy,cz),(cx-dy*width,cy+dx*width,cz-.13*scale)))
        base = "67904a" if i%2 else "779d52"
        faces = []
        for j in range(5):
            k=j*3
            faces.extend(((k,k+3,k+4,k+1),(k+1,k+4,k+5,k+2)))
        add(p,faces,base,slot=3)
        rod(end,tuple(p[-2]),.027*scale,.006*scale,"9db06c",sides=6)


def bench(x,y):
    for r in (-.21,-.05,.11,.27):
        rounded(x,y+r,.58,1.95,.13,.10,.07,WOOD)
    for z in (.88,1.045):
        rounded(x,y+.30,z,1.97,.105,.11,.07,WOOD)
    for dx in (-.72,.72):
        box(x+dx,y,.3,.10,.48,.58,DARK)
        rod((x+dx,y+.29,.40),(x+dx,y+.31,1.09),.056,.045,DARK)


def planter(x,y,s=1):
    rod((x,y,.06),(x,y,.59*s),.32*s,.44*s,"c78564")
    rod((x,y,.60*s),(x,y,.66*s),.46*s,.46*s,"e5a180")
    ellipsoid(x,y,.73*s,.39*s,.37*s,.24*s,LIME)
    for i in range(5):
        a=i*math.tau/5
        ellipsoid(x+math.cos(a)*.18*s,y+math.sin(a)*.19*s,.86*s,.19*s,.23*s,.22*s,
                  "8d9f5b" if i%2 else "688d57")


def lamp(x,y):
    rod((x,y,.08),(x,y,4.58),.09,.055,DARK)
    rod((x,y,4.48),(x+.74,y,4.48),.055,.048,DARK)
    ellipsoid(x+.73,y,4.43,.21,.17,.10,"e9c986",slot=2)


def umbrella(x,y,color):
    rod((x,y,.14),(x,y,2.8),.057,.046,WOOD)
    steps=16
    points=[(x,y,2.89)]
    for j in range(steps):
        a=j*math.tau/steps
        points.append((x+1.68*math.cos(a),y+1.68*math.sin(a),2.44-(j%2)*.07))
    for j in range(steps):
        add(points,[(0,1+j,1+(j+1)%steps)],CREAM if (j//2)%2 else color,slot=3)
    rod((x,y,1.01),(x,y,1.09),.66,.66,WOOD)
    for i in (-.97,.97):
        rounded(x+i,y,.52,.50,.48,.11,.12,color)
        rod((x+i,y,.08),(x+i,y,.49),.08,.06,DARK)


def paving():
    box(0,9,-.55,284,208,1.1,"9cac70",key="Harbor_Base")
    solid(0,9,-.55,284,208,1.1)
    box(0,-90,.035,285,12,.07,SAND,key="Harbor_Base")
    box(0,-179,-.18,520,190,.20,"4bb6b0",key="Harbor_Sea",slot=4)
    for y in (-91,-95,-100,-108,-122,-139,-160,-190,-223):
        for i in range(16):
            x=-137+i*18+randomness.uniform(-2.8,2.8)
            box(x,y+math.sin(i*.66)*1.0,-.075,randomness.uniform(3.5,12),.11,.012,
                "9bd9c5" if y>-108 else "71c6bd",key="Harbor_Sea",yaw=randomness.uniform(-.03,.03))
    for y in (-34,25,81):
        box(0,y,.04,263,8.8,.10,ASPHALT)
        for i in range(-9,10):
            if i:
                box(i*13.7,y,.11,5.5,.10,.018,"e7d1a3")
    for x in (-112,-69,-26,26,69,112):
        box(x,18,.042,8.3,134,.11,ASPHALT)
        for y in range(-42,86,12):
            if min(abs(y-p) for p in (-34,25,81))>6:
                box(x,y,.117,.115,4.2,.018,"e6d3a5")
        for y in (-34,25):
            for j in range(-3,4):
                box(x+j*.87,y+5.6,.127,.53,1.75,.017,CREAM)
                box(x+5.7+j*0,y+j*.87,.127,1.7,.53,.017,CREAM)
    for x in (-91,-48,0,48,91):
        for y in (-4.5,53):
            rounded(x,y,.056,32 if x else 39,44,.12,1.43,CONCRETE)
    rounded(0,-64,.085,62,48,.17,8.3,CONCRETE)
    rounded(-45,-56,.07,31,32,.14,4,CONCRETE)
    rounded(51,-51,.055,29,20,.12,1.2,ASPHALT)
    for i in range(-4,5):
        box(51+i*2.9,-51,.128,.09,5.1,.018,CREAM)
    for i in range(59):
        y=-85+i*.75
        coarse=math.sin(i*.108)
        for side in (-1,1):
            box(5.8*side+coarse*3.8,y,.181,3.13,.76,.017,
                "7db8aa" if (i+side)%4 else "91c4b7",yaw=.22*math.cos(i*.108))
    for y in range(-83,-43,3):
        for x in range(-25,26,3):
            if abs(x) > 11:
                box(x+(y%2)*1.1,y,.174,2.88,.055,.012,"ccad87")
    for y in (-81,-49):
        for x in (-20,20):
            planter(x,y,1.2)
            bench(x,y+1.55)


def facade(x,y,story,w,d,palette):
    base, shade, canopy = palette
    floor = 3.15
    h = floor*story
    rounded(x,y,h/2,w,d,h,1.1,base)
    solid(x,y,h/2,w-.20,d-.20,h)
    rounded(x,y,h-.09,w+.32,d+.32,.25,1.21,shade)
    rounded(x,y,h+.17,w+.54,d+.54,.33,1.23,CREAM)
    rounded(x-.24*w,y,h+.65,2.5,2.1,.69,.29,shade)
    front=y-d/2
    for i in range(max(3,int(w/2.8))):
        count=max(3,int(w/2.8))
        xx=x+(i-(count-1)/2)*(w-2.2)/count
        rounded(xx,front-.045,1.55,1.66,.14,2.55,.066,shade)
        box(xx,front-.146,1.57,1.51,.067,2.32,GLASS,slot=1)
        box(xx,front-.187,1.57,.066,.069,2.32,CREAM)
        box(xx,front-.190,2.34,1.53,.047,.063,CREAM)
        if i%2==0:
            for j in range(6):
                xoff=(j-2.5)*.31
                rounded(xx+xoff,front-.56,2.93,.306,1.12,.09,.042,canopy if j%2 else CREAM)
                box(xx+xoff,front-1.10,2.85,.307,.05,.16,canopy if j%2 else CREAM)
            planter(xx+.99,front-.85,.62)
        for q in range(1,story):
            zz=q*floor+1.51
            rounded(xx,front-.09,zz,1.43,.22,1.79,.105,shade)
            rounded(xx,front-.138,zz,1.21,.14,1.55,.067,GLASS,slot=1)
            box(xx,front-.246,zz,.054,.041,1.53,CREAM)
            if (i+q)%3==1:
                rounded(xx,front-.52,zz-.90,1.73,1.02,.14,.08,shade)
                box(xx,front-.99,zz-.44,1.66,.055,.05,DARK)
                for dx in (-.71,-.37,0,.37,.71):
                    box(xx+dx,front-.992,zz-.64,.033,.035,.43,DARK)
            else:
                rounded(xx,front-.24,zz-.82,1.59,.44,.11,.052,CREAM)
    for side in (-1,1):
        for q in range(story):
            for dy in (-d*.27,0,d*.27):
                rounded(x+side*(w/2+.05),y+dy,q*floor+1.55,.14,1.33,1.62,.055,shade)
                box(x+side*(w/2+.143),y+dy,q*floor+1.56,.046,1.15,1.39,GLASS,slot=1)


def park():
    rounded(48,-3,.076,33,37,.13,4.3,GRASS)
    rounded(48,-3,.157,5.1,36,.046,.25,CONCRETE)
    rounded(48,-3,.161,31.5,4.4,.049,.52,CONCRETE)
    solid(48,-3,.42,5.8,5.8,.65)
    rod((48,-3,.16),(48,-3,.69),4.15,4.17,CREAM,sides=32)
    rod((48,-3,.69),(48,-3,.713),3.81,3.81,"69bbb5",sides=32)
    rod((48,-3,.70),(48,-3,1.74),.46,.24,"bba780")
    ellipsoid(48,-3,1.76,.57,.57,.16,"c5efe3",slot=1)
    for dx,dy in ((-11,-11),(-11,11),(11,-11),(11,11),(-6,-13),(8,14)):
        palm(48+dx,-3+dy,randomness.uniform(.77,1.11))
        bench(48+dx,-1.75+dy)
        planter(49.3+dx,-2+dy,.88)


def boats_and_coast():
    rounded(50,-108,.17,6.7,51,.34,.53,WOOD)
    solid(50,-108,.17,6.7,51,.34)
    rounded(57,-111,.13,18,3.2,.28,.39,WOOD)
    solid(57,-111,.13,18,3.2,.28)
    for y in range(-87,-133,-2):
        for side in (-1,1):
            rod((50+side*3.0,y,.26),(50+side*3.0,y,1.2),.094,.09,DARK)
        box(50,y,.347,6.44,.060,.015,"a1734e")
    for i,y in enumerate((-99,-113,-121)):
        x=61 if i!=1 else 41
        boat_color=(CORAL,TEAL,"efc776")[i]
        ellipsoid(x,y,.13,1.54,3.65,.53,boat_color)
        rounded(x,y,.41,2.22,5.54,.10,.87,CREAM)
        rounded(x,y-.39,.65,1.76,1.63,.36,.34,boat_color)
        rod((x,y,.69),(x,y,4.9),.064,.043,WOOD)
        add([(x,y,4.72),(x,y,.94),(x,y+2.12,.96),(x+.11,y+.5,3.48)],
            [(0,1,2,3)],CREAM,slot=3)
    for i in range(13):
        x=77+i*2.9
        ellipsoid(x,-89+math.sin(i*.37)*2.3,.28,2.2,1.7,randomness.uniform(.6,1.2),"b6a384")
    x,y=70,-86
    rod((x,y,0),(x,y,8.9),2.02,1.25,CREAM,sides=24)
    rod((x,y,6.2),(x,y,7.32),1.50,1.42,CORAL,sides=24)
    rod((x,y,8.65),(x,y,9.01),1.79,1.79,CORAL,sides=24)
    rod((x,y,9.00),(x,y,10.09),1.27,1.27,GLASS,sides=24,slot=1)
    rod((x,y,10.09),(x,y,11.48),1.70,.17,"477c81",sides=24)
    ellipsoid(x,y,11.55,.20,.20,.18,"f3c872",slot=2)
    solid(x,y,4.45,3.5,3.5,8.90)
    for i in range(-10,11):
        x=i*12.2
        palm(x,-82,randomness.uniform(.9,1.29))
        if i%2==0:
            bench(x+2.2,-82)
            lamp(x-1.8,-79.8)
    for i in range(-4,5):
        x=i*5.3
        if i:
            umbrella(x,-70+math.sin(i*.7)*2.3, (TEAL,CORAL,BLUE)[i%3])
    for j in range(12):
        lower = j * math.pi / 12
        upper = (j + 1) * math.pi / 12
        t = max(0, 1 - abs(j - 5) / 5)
        color = bytes(round(c0 + (c1-c0)*t) for c0,c1 in zip(rgb("75a9cd"),rgb("dce5de"))).hex()
        points = []
        for elevation in (lower, upper):
            for i in range(32):
                angle = i * math.tau / 32
                points.append((330 * math.sin(elevation) * math.cos(angle),
                               330 * math.sin(elevation) * math.sin(angle), 330 * math.cos(elevation)))
        faces = [(i,(i+1)%32,(i+1)%32+32,i+32) for i in range(32)]
        add(points,faces,color,key="Harbor_Sky",smooth=True,slot=5)
    for i in range(-7,8):
        ellipsoid(i*29,126,-7,randomness.uniform(21,35),randomness.uniform(23,44),
                  randomness.uniform(14,24),"80a57e" if i%2 else "729575",key="Harbor_Hills")


def arch(x, y, base, width, height, depth, color):
    radius = width / 2
    for segment in range(13):
        angle = (segment + .5) * math.pi / 13
        cx = x + math.cos(angle) * radius
        z = base + height + math.sin(angle) * radius
        shade = color if segment % 3 else tint(color, 1.04)
        points = []
        for side in (-1,1):
            for edge, offset in ((-1,-.15),(1,-.15),(1,.15),(-1,.15)):
                phi = angle + edge * math.pi / 26
                points.append((x + math.cos(phi) * (radius+offset), y+side*depth/2,
                               base + height + math.sin(phi) * (radius+offset)))
        add(points,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],shade)
    for side in (-1,1):
        rod((x+side*radius,y,base),(x+side*radius,y,base+height),.225,.175,color,sides=12)
        box(x+side*radius,y,base+.09,.52,.58,.18,CREAM)


def market_pavilion():
    for x in (-27,-19,-11):
        arch(x,-51,.15,6.9,2.5,.72,"e49b77")
        arch(x,-45.4,.15,6.9,2.5,.72,"e49b77")
        rounded(x,-48.2,6.27,7.92,7.7,.35,.41,"bd6758")
        rounded(x,-48.2,6.52,7.04,6.58,.27,.44,CORAL)
        for column in (-3.7,3.7):
            lamp(x+column,-52.1)
        umbrella(x,-55.45,TEAL if x%2 else CORAL)
    for group in range(23):
        angle = group * math.tau / 23
        x, y = 13.9+math.cos(angle)*3.95, -64.8+math.sin(angle)*3.95
        rod((x,y,.17),(x,y,.44),.223,.223,"e0c29d",sides=8)
    solid(13.9,-64.8,.34,5.6,5.6,.62)
    rod((13.9,-64.8,.15),(13.9,-64.8,.54),3.34,3.46,CREAM,sides=32)
    rod((13.9,-64.8,.545),(13.9,-64.8,.573),3.14,3.14,"65b7b1",sides=32,slot=4)
    for i in range(12):
        angle=i*math.tau/12
        points=[(13.9 + math.cos(angle)*f*2.2,-64.8 + math.sin(angle)*f*2.2,
                 .58 + math.sin(math.pi*f)*1.21) for f in [0,.2,.4,.6,.8,1]]
        for a,b in zip(points,points[1:]):
            rod(a,b,.023,.019,"b9eee1",sides=6,slot=1)
    for x in (-25.0,-4.8,23.5):
        for y in (-72.4,-62.9):
            planter(x,y,1.15)
            for angle in (0,1.9,3.6,5.1):
                ellipsoid(x+math.cos(angle)*.23,y+math.sin(angle)*.23,.99,
                          .115,.13,.09,"efae8e" if angle>2 else "f6d378")
    for i in range(5):
        x=-20+i*9
        rounded(x,-78,.16,5.4,2.12,.07,.33,"e2bf95")
        bench(x,-78)
        planter(x+1.7,-77.9,.79)


def district():
    paving()
    market_pavilion()
    park()
    palettes = [(CORAL,"ebaf92","427e8b"),("efd4a0","c8aa80",TEAL),
                ("91bab1","c5d7be",CORAL),("a9bdd4","d2dcea","db896c"),
                ("e7ae79","f4cea2","618f91")]
    for col,x in enumerate((-128,-93,-49,-10,10,49,93,128)):
        for row,y in enumerate((-4.5,53)):
            if row==0 and x==49:
                continue
            w=14 if abs(x) in (10,128) else 22
            facade(x,y,randomness.choice((2,3,3,4)),w,23 if row else 20,palettes[(col+2*row)%len(palettes)])
            if abs(x) < 129:
                for sign in (-1,1):
                    lamp(x+sign*9.7,y-15.2)
                    planter(x+sign*6.6,y-13.3)
    for i in range(12):
        x=-57+(i%4)*7.7
        y=-65+(i//4)*7.9
        umbrella(x,y,(CORAL,TEAL,BLUE)[i%3])
    for x in (-58,-32):
        palm(x,-63,1.06)
        palm(x,-51,.96)
    boats_and_coast()


def car(index, paint, accent):
    key="CarBody" + str(index)
    rounded(0,0,.02,4.25,1.89,.67,.46,paint,key,bevel=.18)
    rounded(0,0,.278,4.19,1.83,.11,.44,accent,key,bevel=.045)
    rounded(-.23,0,.53,2.31,1.64,.74,.42,GLASS,key,slot=1,bevel=.24)
    rounded(-.26,0,.87,2.16,1.53,.18,.39,CREAM if index != 3 else "7b94a8",key,bevel=.078)
    for s in (-1,1):
        rounded(1.99,s*.57,.10,.32,.48,.22,.14,"ffde98",key,slot=2)
        rounded(-2.01,s*.62,.095,.24,.35,.18,.11,"c6544b",key,slot=2)
        rounded(-.23,s*.83,.43,.13,.078,.58,.036,CREAM,key,yaw=.02)
        rounded(.62,s*.98,.60,.31,.20,.15,.08,paint,key)
        rounded(-.57,s*.968,.26,.16,.05,.048,.021,DARK,key)
    rounded(2.12,0,-.16,.18,1.49,.17,.08,"c4b4a2",key)
    rounded(-2.10,0,-.16,.18,1.55,.17,.08,"c4b4a2",key)
    rounded(2.13,0,.045,.17,.61,.26,.07,DARK,key)
    if index:
        return
    rod((0,-.132,0),(0,.132,0),.34,.34,"333a40","Wheel",sides=20)
    for s in (-1,1):
        rod((0,s*.13,0),(0,s*.145,0),.225,.225,"a7b5b6","Wheel",sides=14)
        rod((0,s*.145,0),(0,s*.157,0),.087,.087,"66777d","Wheel",sides=12)


def avatar(index, skin, shirt, trousers, hair):
    suffix = str(index)
    key="AvatarBody" + suffix
    ellipsoid(0,0,1.10,.145,.233,.295,shirt,key)
    ellipsoid(-.014,0,.87,.115,.185,.122,trousers,key)
    ellipsoid(.029,0,1.40,.073,.076,.11,skin,key)
    ellipsoid(.032,0,1.57,.143,.128,.172,skin,key)
    ellipsoid(-.011,0,1.67,.142,.134,.13,hair,key)
    ellipsoid(-.085,0,1.55 if index % 2 == 0 else 1.61,.094,.117,.153 if index % 2 == 0 else .112,hair,key)
    if index % 2 == 0:
        ellipsoid(-.151,0,1.46,.066,.069,.094,hair,key)
    for side in (-1,1):
        ellipsoid(.023,side*.121,1.575,.039,.035,.05,skin,key)
        ellipsoid(.154,side*.046,1.599,.022,.021,.015,"f7e3d2",key)
        ellipsoid(.17,side*.046,1.599,.011,.011,.010,"4c4140",key)
    ellipsoid(.176,0,1.555,.03,.023,.026,skin,key)
    if index in (0, 2):
        ellipsoid(-.131,0,1.16,.095,.134,.156,"d88e66" if index==0 else BLUE,key)
    for name,first,last,width,col in [("AvatarArm",.0,-.262,.057,shirt),
            ("AvatarForearm",.005,-.258,.043,skin),("AvatarLeg",.0,-.405,.085,trousers),
            ("AvatarShin",.0,-.394,.061,trousers)]:
        ellipsoid(0,0,(first+last)/2,width,width,abs(first-last)/2+.048,col,name+suffix)
    ellipsoid(.025,0,-.265,.042,.042,.061,skin,"AvatarForearm"+suffix)
    ellipsoid(.055,0,-.393,.114,.064,.064,CREAM,"AvatarShin"+suffix)


def srgb_mesh(key, slot, mesh_data):
    vertices, faces, styles = mesh_data
    mesh = bpy.data.meshes.new(key + str(slot))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    layer = mesh.color_attributes.new(name="HarborColor", type="FLOAT_COLOR", domain="CORNER")
    for face, (color, smooth) in zip(mesh.polygons, styles):
        face.use_smooth = smooth
        value = (*[linear(x) for x in color],1)
        for loop in face.loop_indices:
            layer.data[loop].color = value
    mesh.calc_loop_triangles()
    return mesh


def write_meshes(meshes):
    by_asset = defaultdict(list)
    for (key, slot), mesh in meshes.items():
        vertices = bytearray()
        indices = []
        seen = {}
        rgba = batches[(key,slot)][2]
        for tri in mesh.loop_triangles:
            color = rgba[tri.polygon_index][0]
            for loop in (tri.loops[0],tri.loops[2],tri.loops[1]):
                i = mesh.loops[loop].vertex_index
                p, n = mesh.vertices[i].co, mesh.corner_normals[loop].vector
                identity = (i,*(round(v,4) for v in n),color)
                if identity not in seen:
                    seen[identity]=len(seen)
                    vertices.extend(struct.pack("<6f4B",*(v*100 for v in p),*n,*color,255))
                indices.append(seen[identity])
        by_asset[key].append(struct.pack("<III",slot,len(seen),len(indices))+vertices+
                             struct.pack(f"<{len(indices)}I",*indices))
    MESHES.mkdir(parents=True,exist_ok=True)
    for key, sections in by_asset.items():
        (MESHES / (key+".scmesh")).write_bytes(b"SCM1"+struct.pack("<I",len(sections))+b"".join(sections))
    header = PROJECT / "Source/SwipeUpCity/SwipeUpCityHarborGeometry.inl"
    def ue_values(values):
        return ", ".join(f"{v*100:.3f}" for v in values)
    collision = "\n".join(f"    {{ FVector({ue_values(s[:3])}), FVector({ue_values(s[3:])}) }}," for s in solids)
    names = "\n".join(f'    TEXT("{key}"),' for key in sorted(by_asset) if key.startswith("Harbor_"))
    header.write_text("// Generated by Scripts/build_harbor_art.py.\nstatic const FHarborSolid HarborSolids[] = {\n"+
                      collision+"\n};\nstatic const TCHAR* HarborMeshNames[] = {\n"+names+"\n};\n")
    print(f"Exported {len(by_asset)} native meshes and {len(solids)} collision volumes.")


def render(meshes, output, view):
    options = [(0.86,0.0),(0.31,0.16),(0.4,0.0),(0.73,0.0),(0.26,0.08)]
    mats=[]
    for slot,(roughness,metal) in enumerate(options):
        mat=bpy.data.materials.new(f"Harbor {slot}")
        mat.use_nodes=True
        nodes=mat.node_tree.nodes
        shader=nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value=roughness
        shader.inputs["Metallic"].default_value=metal
        vertex=nodes.new("ShaderNodeVertexColor")
        vertex.layer_name="HarborColor"
        mat.node_tree.links.new(vertex.outputs["Color"],shader.inputs["Base Color"])
        if slot==2:
            mat.node_tree.links.new(vertex.outputs["Color"],shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value=.27
        mats.append(mat)
    def instance(key, position, angles=(0,0,0), scale=1):
        for (kind,slot),mesh in meshes.items():
            if kind!=key: continue
            obj=bpy.data.objects.new(key,mesh)
            bpy.context.collection.objects.link(obj)
            obj.location=position
            obj.rotation_euler=angles
            obj.scale=(scale,)*3
            if not mesh.materials: mesh.materials.append(mats[slot])
    for key in sorted({name for name,_ in meshes if name.startswith("Harbor_") and name != "Harbor_Sky"}):
        instance(key,(0,0,0))
    for index,(x,y,yaw) in enumerate([(-5,-31.9,.05),(11,-36,math.pi),(51,-49,math.pi/2),(-49,-34,.12),(25,-71,-.45)]):
        instance("CarBody"+str(index%4),(x,y,.68),(0,0,yaw))
        for dx in (-1.28,1.29):
            for dy in (-.97,.97):
                instance("Wheel",(x+dx*math.cos(yaw)-dy*math.sin(yaw),y+dx*math.sin(yaw)+dy*math.cos(yaw),.34),(0,0,yaw))
    def person(x,y,angle,step,scale,index):
        suffix = str(index % 4)
        instance("AvatarBody"+suffix,(x,y,.18),(0,0,angle),scale)
        for side in (-1,1):
            def pos(a,b,c):
                return (x+(a*math.cos(angle)-b*math.sin(angle))*scale,
                        y+(a*math.sin(angle)+b*math.cos(angle))*scale,.18+c*scale)
            swing=step*side
            instance("AvatarArm"+suffix,pos(0,.23*side,1.30),(side*.12,swing*.7,angle),scale)
            instance("AvatarForearm"+suffix,pos(-math.sin(swing*.7)*.25,.257*side,1.04),
                     (side*.1,swing*.7-.20,angle),scale)
            instance("AvatarLeg"+suffix,pos(0,.105*side,.88),(0,-swing,angle),scale)
            instance("AvatarShin"+suffix,pos(.37*math.sin(swing),.105*side,.51),(0,-swing+.18,angle),scale)
    for idx,(x,y,a,s,d) in enumerate([(29.1,-75.6,2.54,.37,1.06),(24,-68,.8,.59,.94),
                       (15,-70,2.1,.14,.98),(18,-62,1.1,.29,1.01),(6,-58,1.3,.28,.93),
                       (17,-52,-1,.48,1.04),(20,-79,2.4,.10,.97),(1,-70,.5,.41,1.02),
                       (-12,-63,2.4,.23,1.06),(16,-72,1.4,.3,1.02),(17.6,-73,2.4,.4,1.11)]):
        person(x,y,a,s,d,idx)
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=44
    scene.cycles.use_denoising=False
    scene.world.use_nodes=True
    world=scene.world.node_tree
    sky=world.nodes.new("ShaderNodeTexSky")
    sky.sky_type="NISHITA"
    sky.sun_elevation=math.radians(42)
    sky.sun_rotation=math.radians(230)
    sky.sun_disc=False
    world.links.new(sky.outputs["Color"],world.nodes["Background"].inputs[0])
    world.nodes["Background"].inputs[1].default_value=.28
    bpy.ops.object.light_add(type="SUN")
    sun=bpy.context.object
    sun.rotation_euler=(math.radians(31),math.radians(-27),math.radians(-27))
    sun.data.energy=2.5
    sun.data.angle=math.radians(5)
    sun.data.color=(1.0,.83,.63)
    camera, focus, lens = ((33.2,-81.9,4.35), (13,-61,2.25), 27) if view == "plaza" else (
        (79.5,-130.3,8.6), (58.0,-92.6,3.2), 30)
    bpy.ops.object.camera_add(location=camera)
    cam=bpy.context.object
    cam.rotation_euler=(Vector(focus)-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.lens=lens
    scene.camera=cam
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    scene.view_settings.exposure=-.31
    scene.render.resolution_x=1200
    scene.render.resolution_y=760
    scene.render.resolution_percentage=100
    scene.render.filepath=str(output)
    bpy.ops.render.render(write_still=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--render",type=Path)
    parser.add_argument("--view", choices=["plaza", "marina"], default="plaza")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    district()
    for index, (paint, accent) in enumerate([(CORAL,"f09f78"),(TEAL,"82c0bd"),
            ("d9a34f","eac37c"),("647fa0","8ba0ba")]):
        car(index, paint, accent)
    for index, (skin, shirt, trousers, hair) in enumerate([
            ("c88e63","428d90","61738d","483833"),("e1ae88","d98074","516380","8f6745"),
            ("995d43","7d72a0","cfab86","342d32"),("c98869","d3a25d","466e75","51382f")]):
        avatar(index, skin, shirt, trousers, hair)
    meshes={key:srgb_mesh(*key,data) for key,data in batches.items()}
    write_meshes(meshes)
    if args.render:
        render(meshes,args.render,args.view)
