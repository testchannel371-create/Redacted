# REDACTED - Blender asset generator (v2, detailed models)
# Builds all 50 weapons (from client/shared/guns.json) and the customisable operator (soldier),
# exports them as GLB files and renders the shop / HUD weapon pictures.
#
# Run (Windows):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python blender/make_assets.py
# Options (after --):
#   --preview     also render contact sheets into client/assets/preview_*.png
#   --no-icons    skip rendering the 50 weapon pictures (faster)
#   --only 0,4,5  only build these guns (for quick iteration)
#
# Output:
#   client/assets/guns/gun_XX.glb   one small file per weapon (the game loads them on demand)
#   client/assets/icons.webp        weapon pictures for the shop and HUD, all 50 in one sheet (10 x 5)
#   client/assets/operator.glb      the soldier: separate body parts + all clothing options + first-person arms
#
# Conventions: Blender Z is up, +Y is forward (barrel / face direction), +X is right.
# glTF export turns this into three.js Y-up with forward = -Z.

import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUNS = json.load(open(os.path.join(ROOT, 'client', 'shared', 'guns.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'client', 'assets')
GUN_DIR = os.path.join(OUT, 'guns')
ICON_DIR = os.path.join(OUT, 'icons')
for d in (OUT, GUN_DIR, ICON_DIR):
    os.makedirs(d, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
ICONS = '--no-icons' not in ARGS
ONLY = [int(a) for a in ARGS[ARGS.index('--only') + 1].split(',')] if '--only' in ARGS else None
PI = math.pi


# ---------------------------------------------------------------- materials
def srgb2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h):
    h = h.lstrip('#')
    return tuple(srgb2lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


_mats = {}


def get_mat(name, color, metal=0.0, rough=0.55, emit=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    col = hexcol(color)
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit > 0:
        bsdf.inputs['Emission Color'].default_value = (*col, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*col, 1)
    _mats[name] = m
    return m


# ---------------------------------------------------------------- mesh builder
def arc(cy, cz, ry, rz, a0, a1, n):
    """Points on an (elliptical) arc in the YZ plane, angles in radians."""
    return [(cy + ry * math.cos(a0 + (a1 - a0) * i / (n - 1)), cz + rz * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


class MB:
    """Accumulates primitives into one bmesh with per-face materials.

    legacy=True reproduces the original (v1) flat-shaded style used by the operator:
    boxes are flat shaded, cylinders with 8+ sides are smooth with sharp caps, no auto-smoothing.
    """

    def __init__(self, legacy=False):
        self.bm = bmesh.new()
        self.mats = []
        self.legacy = legacy

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _merge(self, t, m):
        idx = self.mi(m)
        vmap = {v: self.bm.verts.new(v.co) for v in t.verts}
        for f in t.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = idx
            if self.legacy:
                nf.smooth = f.smooth
        if self.legacy:
            for e in t.edges:
                if not e.smooth:
                    ne = self.bm.edges.get([vmap[v] for v in e.verts])
                    if ne:
                        ne.smooth = False
        t.free()

    def _finish(self, t, m, M, bev, segs, cyl_segs=None):
        if bev > 0:
            edges = [e for e in t.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.45]
            if edges:
                bmesh.ops.bevel(t, geom=edges, offset=bev, segments=segs, affect='EDGES', profile=0.5, clamp_overlap=True)
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
        if self.legacy:
            if cyl_segs is None:
                for f in t.faces:
                    f.smooth = False
            else:
                smooth = cyl_segs >= 8
                for f in t.faces:
                    f.smooth = smooth and len(f.verts) == 4
                for e in t.edges:
                    if any(len(f.verts) > 4 for f in e.link_faces) or not smooth:
                        e.smooth = False
        self._merge(t, m)

    def box(self, c, s, m, rot=(0, 0, 0), bev=0.0, segs=1, taper=None, mat=None):
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        for v in t.verts:
            x, y, z = v.co
            if taper and z > 0:
                x *= taper[0]
                y *= taper[1]
            v.co = Vector((x * s[0], y * s[1], z * s[2]))
        R = mat if mat is not None else Euler(rot).to_matrix().to_4x4()
        self._finish(t, m, Matrix.Translation(Vector(c)) @ R, bev, segs)

    def cyl(self, c, r, d, m, axis='y', segs=12, r2=None, rot=None, spin=0.0, bev=0.0, bsegs=1, scale=None):
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, cap_tris=False, segments=segs,
                              radius1=r, radius2=r if r2 is None else r2, depth=d)
        if scale:
            for v in t.verts:
                v.co.x *= scale[0]
                v.co.y *= scale[1]
        S = Matrix.Rotation(spin, 4, 'Z')
        if rot is not None:
            R = Euler(rot).to_matrix().to_4x4()
        elif axis == 'y':
            R = Matrix.Rotation(-PI / 2, 4, 'X')
        elif axis == 'x':
            R = Matrix.Rotation(PI / 2, 4, 'Y')
        else:
            R = Matrix.Identity(4)
        self._finish(t, m, Matrix.Translation(Vector(c)) @ R @ S, bev, bsegs, cyl_segs=segs)

    def ball(self, c, r, m, sub=1, scale=(1, 1, 1)):
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=sub, radius=r)
        for v in t.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        self._finish(t, m, Matrix.Translation(Vector(c)), 0, 1)

    def dome(self, c, r, m, scale=(1, 1, 1), cut=0.0, useg=16, vseg=10, rot=(0, 0, 0)):
        """Upper part of a sphere (z >= cut*r), bottom closed. Used for helmets and caps."""
        t = bmesh.new()
        bmesh.ops.create_uvsphere(t, u_segments=useg, v_segments=vseg, radius=1.0)
        kill = [v for v in t.verts if v.co.z < cut - 1e-4]
        bmesh.ops.delete(t, geom=kill, context='VERTS')
        for v in t.verts:
            if v.co.z < cut + 0.08:
                v.co.z = max(v.co.z, cut)
        boundary = [e for e in t.edges if e.is_boundary]
        if boundary:
            bmesh.ops.holes_fill(t, edges=boundary, sides=0)
        for v in t.verts:
            v.co = Vector((v.co.x * r * scale[0], v.co.y * r * scale[1], v.co.z * r * scale[2]))
        bmesh.ops.recalc_face_normals(t, faces=list(t.faces))
        self._finish(t, m, Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4(), 0, 1)

    def prism(self, pts, w, m, x=0.0, bev=0.0, segs=1, rot=None, c=(0, 0, 0)):
        """Extrude a side-profile polygon (list of (y, z)) along X, centred on x, width w."""
        t = bmesh.new()
        a = [t.verts.new((-w / 2, y, z)) for y, z in pts]
        b = [t.verts.new((w / 2, y, z)) for y, z in pts]
        n = len(pts)
        t.faces.new(list(reversed(a)))
        t.faces.new(b)
        for i in range(n):
            j = (i + 1) % n
            t.faces.new([a[i], a[j], b[j], b[i]])
        bmesh.ops.recalc_face_normals(t, faces=list(t.faces))
        R = Euler(rot).to_matrix().to_4x4() if rot else Matrix.Identity(4)
        self._finish(t, m, Matrix.Translation(Vector(c) + Vector((x, 0, 0))) @ R, bev, segs)

    def to_object(self, name, origin=(0, 0, 0), parent=None, parent_origin=(0, 0, 0)):
        o = Vector(origin)
        bmesh.ops.translate(self.bm, vec=-o, verts=self.bm.verts)
        if not self.legacy:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        if not self.legacy:
            # smooth shading with crisp edges above ~38 degrees
            try:
                me.shade_smooth()
            except Exception:
                for p in me.polygons:
                    p.use_smooth = True
            try:
                me.set_sharp_from_angle(angle=math.radians(38))
            except Exception:
                pass
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
            ob.location = o - Vector(parent_origin)
        else:
            ob.location = o
        return ob


def empty(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.02
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    e.location = Vector(loc)
    return e


# ================================================================ GUNS
DIMS = {
    #           recvLen recvH  recvW  barrel bR     hg    stock
    'ar':       (0.30, 0.074, 0.044, 0.22, 0.0105, 0.23, 0.25),
    'smg':      (0.22, 0.072, 0.044, 0.07, 0.0100, 0.11, 0.21),
    'lmg':      (0.36, 0.094, 0.060, 0.30, 0.0140, 0.26, 0.25),
    'marksman': (0.32, 0.074, 0.046, 0.30, 0.0110, 0.27, 0.26),
    'sniper':   (0.32, 0.068, 0.050, 0.44, 0.0135, 0.22, 0.29),
    'shotgun':  (0.30, 0.078, 0.052, 0.32, 0.0160, 0.20, 0.27),
}
STYLE_SCALE = [1.0, 1.06, 0.95, 1.10]
WOOD = '#6e4524'


def gun_mats(g):
    v = g['vis']
    metal = v.get('metal', 0)
    glow = v.get('glow', False)
    M = {}
    M['body'] = get_mat('body_' + v['body'], v['body'], metal=0.95 if metal else 0.45, rough=0.2 if metal else 0.45, emit=0.2 if glow else 0)
    shiny_furn = v['furn'] in ('#c9ced6', '#d6a63c')
    M['furn'] = get_mat('furn_' + v['furn'], v['furn'], metal=0.9 if shiny_furn else 0.05, rough=0.55 if v['furn'] == WOOD else 0.7)
    M['acc'] = get_mat(('glow_' if glow else 'acc_') + v['accent'], v['accent'], metal=0.6 if metal else 0.25, rough=0.4, emit=3.0 if glow else 0)
    M['dark'] = get_mat('polymer', '#17181a', metal=0.05, rough=0.78)
    M['black'] = get_mat('blackmetal', '#0f1011', metal=0.6, rough=0.45)
    M['steel'] = get_mat('steel', '#2c2e33', metal=0.9, rough=0.3)
    M['bright'] = get_mat('brightsteel', '#7b7f86', metal=1.0, rough=0.25)
    M['rubber'] = get_mat('rubber', '#121212', rough=0.95)
    M['brass'] = get_mat('brass', '#c9a24a', metal=0.95, rough=0.28)
    M['glass'] = get_mat('glass', '#1f4252', metal=0.4, rough=0.05)
    M['red'] = get_mat('reddot', '#ff2a1a', emit=6.0)
    M['green'] = get_mat('fiber', '#6dff5a', emit=4.0)
    return M


def rail(b, M, y0, y1, z, w=0.021):
    """Picatinny rail along Y from y0 to y1 with its base at height z."""
    L = y1 - y0
    b.box((0, (y0 + y1) / 2, z + 0.004), (w, L, 0.008), M['black'], bev=0.0015)
    n = int(L / 0.0105)
    for i in range(n):
        y = y0 + 0.006 + i * 0.0105
        b.box((0, y, z + 0.0095), (w + 0.003, 0.0052, 0.004), M['black'])


def build_optic(b, M, kind, y, z):
    """Adds an optic whose mount sits at height z. Returns the sight-line height."""
    if kind == 'dot':  # tube red dot
        b.box((0, y, z + 0.006), (0.028, 0.045, 0.012), M['black'], bev=0.002, segs=2)
        b.box((0.016, y - 0.008, z + 0.008), (0.008, 0.02, 0.006), M['black'], bev=0.002)
        b.box((0, y, z + 0.018), (0.016, 0.03, 0.016), M['black'], bev=0.003)
        b.cyl((0, y, z + 0.036), 0.0175, 0.062, M['black'], segs=16, bev=0.002)
        b.cyl((0, y + 0.034, z + 0.036), 0.019, 0.008, M['black'], segs=16)
        b.cyl((0, y + 0.03, z + 0.036), 0.0155, 0.002, M['glass'], segs=16)
        b.cyl((0.02, y, z + 0.036), 0.007, 0.01, M['steel'], axis='x', segs=10)
        b.cyl((0, y, z + 0.056), 0.007, 0.008, M['steel'], axis='z', segs=10)
        b.box((0, y + 0.01, z + 0.036), (0.003, 0.002, 0.003), M['red'])
        return z + 0.036
    if kind == 'holo':  # holographic sight with a hood
        b.box((0, y - 0.005, z + 0.008), (0.034, 0.085, 0.016), M['black'], bev=0.003, segs=2)
        b.box((0, y - 0.03, z + 0.022), (0.03, 0.03, 0.014), M['black'], bev=0.003)
        for dx in (-0.007, 0.007):
            b.cyl((dx, y - 0.044, z + 0.024), 0.003, 0.004, M['steel'], segs=8)
        hood = [(-0.03, 0.0), (0.03, 0.0), (0.028, 0.05), (0.015, 0.058), (-0.015, 0.058), (-0.028, 0.05)]
        for sx in (-1, 1):
            b.box((sx * 0.0175, y + 0.015, z + 0.038), (0.005, 0.04, 0.042), M['black'], bev=0.0015)
        b.box((0, y + 0.015, z + 0.062), (0.04, 0.04, 0.006), M['black'], bev=0.002)
        b.box((0, y + 0.03, z + 0.038), (0.03, 0.002, 0.036), M['glass'])
        b.box((0, y + 0.029, z + 0.038), (0.003, 0.001, 0.003), M['red'])
        for a in range(8):
            ang = a * PI / 4
            b.box((math.cos(ang) * 0.007, y + 0.029, z + 0.038 + math.sin(ang) * 0.007), (0.0015, 0.001, 0.0015), M['red'])
        return z + 0.038
    if kind == 'acog':  # prism scope
        b.box((0, y, z + 0.008), (0.03, 0.08, 0.016), M['black'], bev=0.003, segs=2)
        body = [(-0.05, 0.016), (0.05, 0.016), (0.055, 0.058), (-0.035, 0.056), (-0.05, 0.048)]
        b.prism(body, 0.034, M['black'], bev=0.004, segs=2, c=(0, y, z))
        b.cyl((0, y + 0.062, z + 0.04), 0.025, 0.035, M['black'], segs=16, r2=0.021, bev=0.002)
        b.cyl((0, y + 0.08, z + 0.04), 0.021, 0.002, M['glass'], segs=16)
        b.cyl((0, y - 0.06, z + 0.04), 0.017, 0.03, M['black'], segs=16)
        b.cyl((0, y - 0.075, z + 0.04), 0.014, 0.002, M['glass'], segs=16)
        b.cyl((0, y, z + 0.066), 0.004, 0.08, M['green'], segs=8)
        b.box((0.018, y + 0.01, z + 0.04), (0.006, 0.02, 0.014), M['black'], bev=0.002)
        return z + 0.04
    if kind == 'sniper':
        for dy in (-0.055, 0.055):
            b.box((0, y + dy, z + 0.01), (0.03, 0.022, 0.02), M['black'], bev=0.003)
            b.cyl((0, y + dy, z + 0.05), 0.025, 0.02, M['black'], segs=16)
            b.box((0, y + dy, z + 0.074), (0.012, 0.02, 0.006), M['black'], bev=0.002)
        b.cyl((0, y, z + 0.05), 0.0205, 0.30, M['black'], segs=18, bev=0.002)
        b.cyl((0, y + 0.18, z + 0.05), 0.034, 0.075, M['black'], segs=18, r2=0.021, bev=0.002)
        b.cyl((0, y + 0.222, z + 0.05), 0.0345, 0.012, M['black'], segs=18)
        b.cyl((0, y + 0.226, z + 0.05), 0.031, 0.002, M['glass'], segs=18)
        b.cyl((0, y - 0.165, z + 0.05), 0.026, 0.05, M['black'], segs=18, r2=0.0205)
        b.cyl((0, y - 0.195, z + 0.05), 0.027, 0.022, M['rubber'], segs=18)
        b.cyl((0, y - 0.206, z + 0.05), 0.022, 0.002, M['glass'], segs=18)
        b.cyl((0, y, z + 0.081), 0.012, 0.024, M['black'], axis='z', segs=16, bev=0.002)
        b.cyl((0, y, z + 0.095), 0.0125, 0.006, M['acc'], axis='z', segs=16)
        b.cyl((0.032, y, z + 0.05), 0.012, 0.024, M['black'], axis='x', segs=16, bev=0.002)
        b.cyl((-0.03, y + 0.02, z + 0.05), 0.014, 0.018, M['black'], axis='x', segs=16)
        return z + 0.05
    return None


def build_mag(b, M, kind, cat, my, w, st, magm):
    if kind == 'straight':
        L = 0.14 if cat in ('sniper', 'shotgun', 'marksman') else (0.15 if cat == 'smg' else 0.175)
        d = 0.072 if cat == 'shotgun' else (0.046 if cat == 'smg' else 0.062)
        cv = 0.025 if cat in ('ar', 'lmg') else 0.008
        pts = [(my - d / 2, 0.012), (my + d / 2, 0.012), (my + d / 2 + cv, -L), (my - d / 2 + cv, -L)]
        b.prism(pts, w * 0.74, magm, bev=0.003, segs=2)
        b.prism([(my - d / 2 + cv - 0.004, -L), (my + d / 2 + cv + 0.004, -L), (my + d / 2 + cv + 0.004, -L - 0.012), (my - d / 2 + cv - 0.004, -L - 0.012)],
                w * 0.86, M['dark'], bev=0.003, segs=2)
        for sx in (-1, 1):
            b.prism([(my - d / 2 + 0.008, -0.03), (my + d / 2 - 0.008, -0.03), (my + d / 2 - 0.008 + cv * 0.8, -L * 0.85), (my - d / 2 + 0.008 + cv * 0.8, -L * 0.85)],
                    0.002, M['dark'], x=sx * w * 0.37)
    elif kind == 'curved':  # banana magazine (arc)
        # centre of curvature sits in front of the magazine, so it hangs down and curves forward
        R, d, L = 0.33, 0.066, 0.2
        cy, cz = my + R, 0.012
        th = [PI + (L / R) * i / 7 for i in range(8)]
        outer = [(cy + (R + d / 2) * math.cos(a), cz + (R + d / 2) * math.sin(a)) for a in th]
        inner = [(cy + (R - d / 2) * math.cos(a), cz + (R - d / 2) * math.sin(a)) for a in th]
        b.prism(outer + list(reversed(inner)), w * 0.74, magm, bev=0.003, segs=2)
        for a in th[2:7:2]:
            b.box((0, cy + R * math.cos(a), cz + R * math.sin(a)), (w * 0.78, d * 1.04, 0.006), M['dark'], rot=(a, 0, 0))
    elif kind == 'drum':
        b.box((0, my, -0.01), (w * 0.7, 0.052, 0.05), M['dark'], bev=0.004, segs=2)
        b.cyl((0, my + 0.005, -0.082), 0.074, w * 1.55, magm, axis='x', segs=22, bev=0.004, bsegs=2)
        b.cyl((0, my + 0.005, -0.082), 0.064, w * 1.62, M['dark'], axis='x', segs=22)
        b.cyl((w * 0.85, my + 0.005, -0.082), 0.018, 0.012, M['steel'], axis='x', segs=12)
        b.box((w * 0.92, my + 0.005, -0.082), (0.006, 0.03, 0.006), M['steel'], bev=0.002)
    elif kind == 'box':  # LMG ammo box with a belt of brass
        b.box((-0.005, my, -0.055), (0.09, 0.125, 0.11), magm, bev=0.006, segs=2)
        b.box((-0.005, my, 0.0), (0.094, 0.128, 0.012), M['dark'], bev=0.003)
        b.box((-0.052, my, -0.05), (0.006, 0.06, 0.03), M['steel'], bev=0.002)
        for i in range(6):
            t = i / 5
            yy, zz = my - 0.03 + t * 0.03, 0.006 + t * 0.03
            b.cyl((w / 2 + 0.012 - t * 0.01, yy, zz), 0.0055, 0.034, M['brass'], axis='x', segs=8)
            b.cyl((w / 2 + 0.03 - t * 0.01, yy, zz), 0.0035, 0.008, M['bright'], axis='x', segs=8, r2=0.001)
    elif kind == 'tube':
        pass


def build_stock(b, M, kind, rear, rh, w, sl):
    if kind == 'fixed':  # modern collapsible stock on a buffer tube
        b.cyl((0, rear - sl * 0.35, rh * 0.66), 0.0165, sl * 0.72, M['black'], segs=14)
        b.cyl((0, rear - 0.006, rh * 0.66), 0.02, 0.012, M['black'], segs=14)
        pts = [(rear - sl * 0.38, rh * 1.02), (rear - sl, rh * 1.02), (rear - sl - 0.004, rh * 1.0 - 0.14),
               (rear - sl * 0.82, rh * 1.0 - 0.13), (rear - sl * 0.5, rh * 0.3), (rear - sl * 0.38, rh * 0.36)]
        b.prism(pts, w * 0.9, M['furn'], bev=0.006, segs=2)
        b.box((0, rear - sl * 0.7, rh * 0.62), (w * 0.95, 0.04, 0.012), M['dark'], bev=0.002)
        b.prism([(rear - sl - 0.002, rh * 1.03), (rear - sl - 0.016, rh * 1.03), (rear - sl - 0.02, rh - 0.145), (rear - sl - 0.002, rh - 0.145)],
                w * 0.96, M['rubber'], bev=0.004, segs=2)
        b.cyl((w * 0.5, rear - sl * 0.85, rh * 0.5), 0.006, 0.006, M['steel'], axis='x', segs=10)
    elif kind == 'skeleton':
        b.prism([(rear, rh * 0.98), (rear - sl, rh * 0.98), (rear - sl, rh * 0.84), (rear, rh * 0.84)], 0.016, M['furn'], bev=0.003, segs=2)
        b.prism([(rear, rh * 0.25), (rear - 0.02, rh * 0.25), (rear - sl, rh - 0.12), (rear - sl, rh - 0.1), (rear - 0.01, rh * 0.42), (rear, rh * 0.42)],
                0.014, M['furn'], bev=0.003, segs=2)
        b.prism([(rear - sl + 0.025, rh * 1.05), (rear - sl - 0.012, rh * 1.05), (rear - sl - 0.012, rh - 0.145), (rear - sl + 0.012, rh - 0.145)],
                w * 0.92, M['furn'], bev=0.004, segs=2)
        b.box((0, rear - sl - 0.016, rh * 0.98 - 0.065), (w * 0.95, 0.008, 0.15), M['rubber'], bev=0.002)
        b.box((0, rear - sl * 0.55, rh * 1.0), (w * 0.6, sl * 0.4, 0.014), M['dark'], bev=0.004, segs=2)
    elif kind == 'wood':  # classic rifle stock: thin wrist, wide butt with drop
        pts = [(rear + 0.004, rh * 0.82), (rear - sl * 0.35, rh * 0.62), (rear - sl, rh * 0.5), (rear - sl - 0.004, rh * 0.5 - 0.145),
               (rear - sl * 0.75, rh * 0.5 - 0.14), (rear - sl * 0.4, rh * 0.05 - 0.04), (rear - 0.03, rh * 0.06), (rear + 0.004, rh * 0.12)]
        b.prism(pts, w * 0.92, M['furn'], bev=0.01, segs=2)
        b.prism([(rear - sl - 0.002, rh * 0.52), (rear - sl - 0.012, rh * 0.52), (rear - sl - 0.016, rh * 0.5 - 0.148), (rear - sl - 0.002, rh * 0.5 - 0.148)],
                w * 0.95, M['steel'], bev=0.003)
        b.cyl((0, rear - sl * 0.8, rh * 0.5 - 0.12), 0.006, w * 1.0, M['steel'], axis='x', segs=10)
    elif kind == 'folded':  # side-folding stock folded along the left side
        b.box((0, rear - 0.008, rh * 0.55), (w * 0.85, 0.016, rh * 0.75), M['black'], bev=0.003, segs=2)
        xs = -(w / 2 + 0.009)
        b.prism([(rear - 0.004, rh * 0.85), (rear + 0.19, rh * 0.85), (rear + 0.19, rh * 0.74), (rear - 0.004, rh * 0.74)], 0.009, M['furn'], x=xs, bev=0.002)
        b.prism([(rear - 0.004, rh * 0.28), (rear + 0.19, rh * 0.36), (rear + 0.19, rh * 0.26), (rear - 0.004, rh * 0.18)], 0.009, M['furn'], x=xs, bev=0.002)
        b.prism([(rear + 0.18, rh * 0.9), (rear + 0.2, rh * 0.9), (rear + 0.2, rh * 0.2), (rear + 0.18, rh * 0.2)], 0.012, M['furn'], x=xs, bev=0.002)
        b.box((xs - 0.004, rear + 0.19, rh * 0.55), (0.004, 0.022, rh * 0.68), M['rubber'], bev=0.001)


GRIP = [(0.012, 0.002), (0.006, -0.03), (0.011, -0.046), (0.002, -0.064), (0.006, -0.082), (-0.006, -0.106),
        (-0.016, -0.12), (-0.05, -0.116), (-0.046, -0.08), (-0.038, -0.042), (-0.034, -0.014), (-0.046, 0.002)]


def trigger_group(b, M, gl):
    """U-shaped trigger guard from y=0 to y=gl below the receiver, plus a curved trigger."""
    u = [(0.0, 0.002), (0.0, -0.022), (0.007, -0.031), (gl, -0.031), (gl + 0.004, -0.024), (gl + 0.004, 0.002),
         (gl - 0.002, 0.002), (gl - 0.002, -0.021), (gl - 0.005, -0.025), (0.009, -0.025), (0.006, -0.02), (0.006, 0.002)]
    b.prism(u, 0.009, M['black'], bev=0.0015, segs=1)
    trig = [(0.03, 0.002), (0.037, -0.008), (0.037, -0.017), (0.031, -0.023), (0.027, -0.021), (0.031, -0.013), (0.029, -0.004), (0.025, 0.002)]
    b.prism(trig, 0.0055, M['steel'], bev=0.001)


def build_rifle(g, M):
    v, cat = g['vis'], g['cat']
    st = v.get('style', 0)
    rl, rh, w, bl, br, hg, sl = DIMS[cat]
    k = STYLE_SCALE[st]
    rl *= k
    hg *= (2 - k)
    b = MB()
    rear = -0.085
    front = rear + rl
    my = max(front - 0.075, 0.12) if cat != 'lmg' else front - 0.12
    front = max(front, my + 0.065)
    mid = (rear + front) / 2
    bz = rh * 0.66
    wood = v['furn'] == WOOD
    pump = cat == 'shotgun' and v['mag'] == 'tube'
    classic = wood or pump
    body, furn = M['body'], M['furn']

    # ---- upper receiver (side profile)
    if classic:
        # dust cover with a rounded rear end
        top = [(rear + 0.045 - 0.045 * math.sin(t * PI / 2), rh * 0.68 + rh * 0.3 * math.cos(t * PI / 2)) for t in [i / 5 for i in range(6)]]
        pts = [(rear, rh * 0.4), (front, rh * 0.4), (front, rh * 0.86), (front - 0.012, rh * 0.95)] + top
    else:
        pts = [(rear, rh * 0.42), (front, rh * 0.42), (front, rh * 0.94), (front - 0.01, rh), (rear + 0.014, rh), (rear, rh * 0.9)]
    b.prism(pts, w, body, bev=0.004, segs=2)
    # ---- lower receiver with flared magwell
    lower = [(rear + 0.004, rh * 0.46), (front - 0.012, rh * 0.46), (front - 0.012, rh * 0.2), (my + 0.048, rh * 0.03), (my + 0.048, -0.024),
             (my - 0.044, -0.024), (my - 0.044, 0.0), (rear + 0.03, 0.0), (rear + 0.004, rh * 0.18)]
    b.prism(lower, w * 0.92, body, bev=0.004, segs=2)
    if cat != 'lmg' and not pump:
        b.prism([(my + 0.052, -0.012), (my + 0.052, -0.026), (my - 0.048, -0.026), (my - 0.048, -0.012)], w * 0.98, body, bev=0.002)
    # receiver details
    b.box((w / 2 + 0.0006, mid + 0.03, rh * 0.72), (0.002, 0.072, 0.024), M['black'], bev=0.0008)
    b.box((w / 2 + 0.0012, mid + 0.03, rh * 0.72), (0.0016, 0.064, 0.018), M['steel'])
    for sx in (-1, 1):
        b.box((sx * (w * 0.46 + 0.0012), my - 0.06, rh * 0.25), (0.002, 0.035, 0.01), M['acc'], bev=0.0008)
    if classic:
        b.cyl((w / 2 + 0.016, front - 0.05, rh * 0.74), 0.0055, 0.032, M['steel'], axis='x', segs=10)
        b.ball((w / 2 + 0.032, front - 0.05, rh * 0.74), 0.008, M['steel'])
        for i in range(4):
            for sx in (-1, 1):
                b.cyl((sx * (w * 0.46 + 0.001), rear + 0.03 + i * rl * 0.25, rh * 0.3), 0.003, 0.003, M['steel'], axis='x', segs=8)
        b.box((w / 2 + 0.003, mid - 0.02, rh * 0.5), (0.003, 0.06, 0.008), M['steel'], rot=(-0.15, 0, 0), bev=0.001)
    else:
        b.box((0, rear - 0.006, rh * 0.86), (0.022, 0.03, 0.012), M['black'], bev=0.002)
        b.box((0, rear - 0.018, rh * 0.86), (0.05, 0.012, 0.012), M['black'], bev=0.003, segs=2)
        b.cyl((w / 2 + 0.006, rear + 0.035, rh * 0.74), 0.0075, 0.03, M['black'], axis='y', segs=12, bev=0.001)
        b.box((w / 2 + 0.006, rear + 0.058, rh * 0.86), (0.01, 0.012, 0.01), M['black'], bev=0.002)
        b.cyl((-(w * 0.46 + 0.004), 0.002, rh * 0.32), 0.006, 0.006, M['black'], axis='x', segs=10)
        b.box((-(w * 0.46 + 0.006), 0.008, rh * 0.32), (0.003, 0.02, 0.005), M['black'], rot=(0.4, 0, 0))
        b.cyl((w * 0.46 + 0.003, my - 0.05, rh * 0.25), 0.005, 0.005, M['black'], axis='x', segs=10)

    # ---- grip + trigger
    b.prism(GRIP, 0.031, M['rubber'] if not wood else furn, bev=0.006, segs=2)
    if not wood:
        for sx in (-1, 1):
            b.prism([(0.0, -0.02), (0.002, -0.08), (-0.036, -0.09), (-0.03, -0.02)], 0.002, furn, x=sx * 0.0155)
    gl = min(0.08, my - 0.05)
    trigger_group(b, M, gl)

    # ---- handguard / forend
    hz = bz - 0.002
    hr = rh * 0.56
    gun_front = front + hg
    if pump:
        b.cyl((0, front + 0.11, rh * 0.26), 0.029, 0.17, furn, segs=16, bev=0.004, bsegs=2)
        for i in range(7):
            b.cyl((0, front + 0.04 + i * 0.023, rh * 0.26), 0.0305, 0.006, M['dark'], segs=16)
        b.cyl((0, front + (bl + hg) * 0.45, rh * 0.26), 0.0145, (bl + hg) * 0.85, M['steel'], segs=12)
        b.cyl((0, front + (bl + hg) * 0.86, rh * 0.26), 0.017, 0.02, M['black'], segs=12)
        b.box((0, front + (bl + hg) * 0.86, rh * 0.45), (0.012, 0.014, 0.03), M['black'], bev=0.002)
    elif wood:
        lowpts = [(front, hz + 0.004), (front + hg, hz + 0.004), (front + hg, hz - hr * 0.55), (front + hg - 0.02, hz - hr * 0.95),
                  (front + 0.02, hz - hr), (front, hz - hr * 0.85)]
        b.prism(lowpts, w * 1.12, furn, bev=0.01, segs=2)
        for i in range(3):
            b.box((0, front + 0.04 + i * 0.04, hz - hr * 0.5), (w * 1.14, 0.006, hr * 0.6), M['dark'])
        b.cyl((0, front + hg * 0.55, hz + 0.024), 0.016, hg * 0.85, furn, segs=12, bev=0.004)
        b.box((0, front + hg * 0.06, hz), (w * 1.18, 0.012, hr * 1.3), M['steel'], bev=0.002)
        b.box((0, gun_front + 0.012, hz + 0.012), (0.03, 0.024, 0.046), M['steel'], bev=0.003, segs=2)
    elif v.get('rail') or st in (0, 2):  # modern free-float rail
        b.cyl((0, front + hg / 2, hz), hr, hg, furn, segs=8, spin=PI / 8, bev=0.003, bsegs=2)
        ang = PI / 8
        for i in range(max(2, int(hg / 0.045))):
            y = front + 0.03 + i * 0.045
            for sx in (-1, 1):
                b.box((sx * hr * math.cos(ang) * 1.0, y, hz), (0.002, 0.026, 0.009), M['black'], bev=0.0008)
            b.box((0, y, hz - hr * math.cos(ang)), (0.009, 0.026, 0.002), M['black'], bev=0.0008)
        b.cyl((0, gun_front - 0.005, hz), hr * 1.02, 0.01, M['black'], segs=8, spin=PI / 8)
        rail(b, M, front - 0.01, gun_front - 0.01, hz + hr * math.cos(ang) - 0.002)
        if v.get('glow'):
            for sx in (-1, 1):
                b.box((sx * (hr * 0.93 + 0.001), front + hg / 2, hz - hr * 0.3), (0.003, hg * 0.85, 0.005), M['acc'])
    else:  # classic round handguard with ribs
        b.cyl((0, front + hg / 2, hz), hr * 1.02, hg, furn, segs=16, bev=0.004, bsegs=2)
        for i in range(int(hg / 0.022)):
            b.cyl((0, front + 0.016 + i * 0.022, hz), hr * 1.045, 0.007, furn, segs=16)
        b.cyl((0, front + 0.006, hz), hr * 1.1, 0.012, M['black'], segs=16)

    # ---- barrel
    blen = hg + bl
    b.cyl((0, front + blen * 0.25, bz), br * 1.25, blen * 0.5, M['steel'], segs=14)
    b.cyl((0, front + blen / 2, bz), br, blen, M['steel'], segs=14)
    tip = front + blen
    if cat == 'sniper':
        for a in range(6):
            ang = a * PI / 3
            b.box((math.cos(ang) * br * 0.98, gun_front + bl * 0.45, bz + math.sin(ang) * br * 0.98), (0.0025, bl * 0.6, 0.0025), M['black'])
    if not classic and cat in ('ar', 'marksman', 'smg') and v['scope'] == 'none':
        # A-frame front sight on the gas block
        b.box((0, gun_front + 0.016, bz), (0.022, 0.026, 0.026), M['black'], bev=0.003)
        b.prism([(-0.014, 0.0), (0.014, 0.0), (0.003, 0.052), (-0.003, 0.052)], 0.012, M['black'], bev=0.002, c=(0, gun_front + 0.016, bz + 0.008))
        b.box((0, gun_front + 0.016, bz + 0.055), (0.003, 0.003, 0.018), M['steel'])
    elif not classic and cat != 'shotgun':
        b.box((0, gun_front + 0.016, bz), (0.024, 0.026, 0.026), M['black'], bev=0.003)
    if cat == 'lmg':
        b.cyl((0, gun_front + bl * 0.4, bz + 0.004), br * 2.0, bl * 0.75, M['black'], segs=14)
        for i in range(int(bl * 0.75 / 0.03)):
            b.cyl((0, gun_front + 0.02 + i * 0.03, bz + 0.004), br * 2.1, 0.008, M['dark'], segs=14)
        b.box((0, mid + 0.02, rh + 0.012), (w * 1.05, rl * 0.55, 0.024), body, bev=0.005, segs=2)
        b.box((0, mid + 0.03, rh + 0.074), (0.018, 0.13, 0.014), furn, bev=0.004, segs=2)
        for dy in (-0.055, 0.055):
            b.box((0, mid + 0.03 + dy, rh + 0.048), (0.014, 0.014, 0.05), furn, bev=0.003)

    # ---- muzzle device
    if v.get('supp'):
        b.cyl((0, tip + 0.085, bz), 0.0215, 0.17, M['black'], segs=18, bev=0.003, bsegs=2)
        for dy in (0.02, 0.15):
            b.cyl((0, tip + dy, bz), 0.0222, 0.008, M['steel'], segs=18)
        b.cyl((0, tip + 0.172, bz), 0.008, 0.002, M['rubber'], segs=12)
        muzzle = tip + 0.175
    elif cat == 'sniper' or st == 2:
        b.box((0, tip + 0.035, bz), (0.032, 0.07, 0.028), M['black'], bev=0.004, segs=2)
        for i in range(3):
            for sx in (-1, 1):
                b.box((sx * 0.0162, tip + 0.015 + i * 0.02, bz), (0.002, 0.01, 0.018), M['rubber'])
        muzzle = tip + 0.07
    elif pump:
        b.box((0, (front + tip) / 2 + 0.02, bz + br + 0.003), (0.006, blen * 0.85, 0.004), M['black'])
        b.ball((0, tip - 0.01, bz + br + 0.008), 0.003, M['brass'])
        muzzle = tip
    else:
        b.cyl((0, tip + 0.027, bz), br * 1.65, 0.054, M['black'], segs=12, bev=0.002)
        for a in range(4):
            ang = a * PI / 2 + PI / 4
            b.box((math.cos(ang) * br * 1.62, tip + 0.035, bz + math.sin(ang) * br * 1.62), (0.004, 0.028, 0.004), M['rubber'])
        muzzle = tip + 0.054

    # ---- top rail, sights, optics
    top = rh
    if v.get('rail') or v['scope'] != 'none':
        rail(b, M, rear + 0.004, front - 0.004, top - 0.001)
        top += 0.0115
    sight = build_optic(b, M, v['scope'], mid + 0.015, top)
    if sight is None:
        if classic and not pump:
            b.box((0, mid, rh + 0.006), (0.016, 0.03, 0.012), M['steel'], bev=0.002)
            b.box((0, gun_front + 0.015, bz + 0.04), (0.004, 0.004, 0.03), M['steel'])
            for sx in (-1, 1):
                b.box((sx * 0.009, gun_front + 0.015, bz + 0.04), (0.003, 0.012, 0.034), M['steel'], bev=0.001)
            sight = bz + 0.055
        elif pump:
            sight = bz + br + 0.011
        else:
            b.box((0, rear + 0.03, top + 0.012), (0.03, 0.022, 0.024), M['black'], bev=0.003)
            b.box((0, rear + 0.03, top + 0.026), (0.012, 0.004, 0.012), M['black'])
            sight = bz + 0.062
    elif cat in ('ar', 'marksman') and not classic:
        b.box((0, rear + 0.03, top + 0.01), (0.026, 0.02, 0.016), M['black'], bev=0.003)

    # ---- magazine
    magm = M['acc'] if st == 2 and not v.get('glow') else M['dark']
    if cat == 'lmg':
        build_mag(b, M, 'box' if v['mag'] == 'box' else v['mag'], cat, my, w, st, magm)
    else:
        build_mag(b, M, 'straight' if v['mag'] == 'box' else v['mag'], cat, my, w, st, magm)

    # ---- stock
    build_stock(b, M, v['stock'], rear, rh, w, sl)

    # ---- grips, bipod, bolt, sling swivel
    lh = (0, front + hg * 0.42, hz - hr * 0.9)
    if v.get('grip') == 'vert':
        b.cyl((0, front + hg * 0.55, hz - hr - 0.04), 0.014, 0.08, furn, axis='z', segs=12, bev=0.003, bsegs=2)
        b.cyl((0, front + hg * 0.55, hz - hr - 0.082), 0.016, 0.008, M['dark'], axis='z', segs=12)
        lh = (0, front + hg * 0.55, hz - hr - 0.045)
    elif v.get('grip') == 'angled':
        b.prism([(0.0, 0.0), (0.075, 0.0), (0.06, -0.03), (0.02, -0.028)], 0.024, furn, bev=0.004, segs=2, c=(0, front + hg * 0.3, hz - hr + 0.002))
    if pump:
        lh = (0, front + 0.11, rh * 0.26 - 0.03)
    if v.get('bipod'):
        b.box((0, gun_front - 0.02, bz - 0.018), (0.034, 0.024, 0.016), M['black'], bev=0.003)
        for sx in (-1, 1):
            b.cyl((sx * 0.012, gun_front + 0.07, bz - 0.022), 0.0045, 0.17, M['black'], segs=8)
            b.ball((sx * 0.012, gun_front + 0.156, bz - 0.022), 0.007, M['rubber'])
    if cat == 'sniper':
        b.cyl((w / 2 + 0.024, 0.01, rh * 0.72), 0.0055, 0.048, M['bright'], axis='x', segs=10)
        b.ball((w / 2 + 0.05, 0.01, rh * 0.72), 0.012, M['black'], sub=2)
        b.box((0, rear - 0.04, rh * 1.0 + 0.012), (w * 0.7, 0.12, 0.016), M['dark'], bev=0.004, segs=2)
    if pump:
        b.box((0, 0.02, rh * 0.42), (w * 1.01, 0.06, rh * 0.25), M['black'], bev=0.002)
        b.box((0, 0.0, rh * 0.72), (0.012, 0.03, 0.006), M['acc'])
    return b, muzzle, bz, lh, sight


def build_pistol(g, M):
    v = g['vis']
    st = v.get('style', 0)
    s = [1.0, 1.05, 1.0, 1.28][st]
    b = MB()
    body, furn = M['body'], M['furn']
    S = lambda pts: [(y * s, z * s) for y, z in pts]
    # slide
    slide = S([(-0.032, 0.019), (0.162, 0.019), (0.166, 0.03), (0.162, 0.044), (0.152, 0.05), (-0.024, 0.05), (-0.032, 0.044)])
    b.prism(slide, 0.028 * s, body, bev=0.003, segs=2)
    for i in range(6):
        for sx in (-1, 1):
            b.box((sx * 0.0142 * s, (-0.026 + i * 0.007) * s, 0.034 * s), (0.0016, 0.0032 * s, 0.024 * s), M['black'], rot=(0.15, 0, 0))
    if st in (0, 2, 3):
        for i in range(4):
            for sx in (-1, 1):
                b.box((sx * 0.0142 * s, (0.118 + i * 0.007) * s, 0.034 * s), (0.0016, 0.0032 * s, 0.022 * s), M['black'], rot=(0.15, 0, 0))
    b.box((0.0105 * s, 0.055 * s, 0.048 * s), (0.008 * s, 0.05 * s, 0.006 * s), M['black'])
    b.box((0.006 * s, 0.055 * s, 0.047 * s), (0.012 * s, 0.045 * s, 0.006 * s), M['bright'])
    b.cyl((0, 0.163 * s, 0.035 * s), 0.0085 * s, 0.01, M['bright'], segs=12)
    b.cyl((0, 0.166 * s, 0.035 * s), 0.0045 * s, 0.006, M['rubber'], segs=10)
    for sx in (-1, 1):
        b.box((sx * (0.0145 * s), 0.07 * s, 0.02 * s), (0.002, 0.12 * s, 0.0035), M['acc'])
    # frame with accessory rail
    frame = S([(-0.036, 0.0), (-0.03, 0.021), (0.14, 0.021), (0.14, 0.004), (0.09, 0.0), (0.07, -0.003), (0.0, -0.002)])
    b.prism(frame, 0.026 * s, furn if st != 1 else body, bev=0.003, segs=2)
    if st != 1:
        for i in range(3):
            b.box((0, (0.1 + i * 0.012) * s, 0.002 * s), (0.02 * s, 0.005 * s, 0.004 * s), M['black'])
    # grip
    grip = S([(0.012, 0.002), (0.005, -0.03), (0.009, -0.048), (0.001, -0.07), (-0.006, -0.1), (-0.046, -0.1), (-0.043, -0.06), (-0.036, -0.022), (-0.05, 0.004), (-0.042, 0.012)])
    b.prism(grip, 0.03 * s, furn, bev=0.004, segs=2)
    if st == 1:
        wood = get_mat('furn_' + WOOD, WOOD, rough=0.55)
        for sx in (-1, 1):
            b.prism(S([(0.004, -0.01), (0.0, -0.075), (-0.038, -0.075), (-0.032, -0.012)]), 0.003, wood, x=sx * 0.0158 * s, bev=0.001)
            b.cyl((sx * 0.0175 * s, -0.016 * s, -0.022 * s), 0.0035 * s, 0.002, M['bright'], axis='x', segs=8)
            b.cyl((sx * 0.0175 * s, -0.022 * s, -0.064 * s), 0.0035 * s, 0.002, M['bright'], axis='x', segs=8)
    else:
        for sx in (-1, 1):
            b.prism(S([(0.003, -0.015), (-0.003, -0.075), (-0.036, -0.075), (-0.03, -0.018)]), 0.002, M['rubber'], x=sx * 0.0153 * s)
    # trigger guard + trigger
    u = S([(0.0, 0.0), (0.0, -0.02), (0.006, -0.028), (0.068, -0.028), (0.072, -0.02), (0.072, 0.0), (0.066, 0.0), (0.066, -0.019),
           (0.062, -0.022), (0.009, -0.022), (0.006, -0.018), (0.006, 0.0)])
    b.prism(u, 0.009 * s, furn if st != 1 else body, bev=0.0015)
    b.prism(S([(0.03, 0.0), (0.036, -0.008), (0.035, -0.016), (0.03, -0.02), (0.027, -0.018), (0.03, -0.01), (0.027, 0.0)]), 0.0055 * s, M['steel'], bev=0.001)
    # hammer / controls
    if st in (1, 3):
        b.prism(S([(-0.03, 0.03), (-0.04, 0.05), (-0.046, 0.048), (-0.04, 0.028)]), 0.008 * s, M['steel'], bev=0.001)
    b.box((-0.0155 * s, 0.02 * s, 0.022 * s), (0.003, 0.03 * s, 0.006 * s), M['black'], bev=0.001)
    b.cyl((-0.0155 * s, 0.07 * s, 0.014 * s), 0.0035 * s, 0.003, M['black'], axis='x', segs=8)
    # magazine
    if st == 2:
        b.prism(S([(0.002, -0.09), (-0.034, -0.09), (-0.05, -0.17), (-0.014, -0.17)]), 0.024 * s, M['dark'], bev=0.003, segs=2)
        b.box((0, -0.032 * s, -0.172 * s), (0.028 * s, 0.044 * s, 0.008 * s), M['black'], bev=0.002)
        b.box((0, 0.178 * s, 0.033 * s), (0.032 * s, 0.03 * s, 0.034 * s), M['black'], bev=0.004, segs=2)
        for sx in (-1, 1):
            b.box((sx * 0.0162 * s, 0.178 * s, 0.038 * s), (0.002, 0.016 * s, 0.01 * s), M['rubber'])
        muzzle = 0.195 * s
    else:
        b.prism(S([(0.006, -0.094), (-0.044, -0.094), (-0.046, -0.104), (0.0, -0.104)]), 0.031 * s, M['black'], bev=0.002)
        muzzle = 0.17 * s
    # sights
    top = 0.05 * s
    b.box((0, 0.148 * s, top + 0.004), (0.004, 0.008, 0.008), M['black'], bev=0.001)
    b.ball((0, 0.149 * s, top + 0.006), 0.0015, M['green'])
    for sx in (-1, 1):
        b.box((sx * 0.006, -0.018 * s, top + 0.004), (0.006, 0.008, 0.009), M['black'], bev=0.001)
    sight = top + 0.006
    if v['scope'] == 'dot':
        b.box((0, 0.0, top + 0.006), (0.024, 0.034, 0.012), M['black'], bev=0.002, segs=2)
        b.prism([(-0.016, 0.0), (0.016, 0.0), (0.012, 0.024), (-0.012, 0.024)], 0.024, M['black'], bev=0.002, c=(0, 0.0, top + 0.01))
        b.box((0, 0.006, top + 0.024), (0.018, 0.002, 0.018), M['glass'])
        b.box((0, 0.005, top + 0.024), (0.002, 0.001, 0.002), M['red'])
        sight = top + 0.024
    return b, muzzle, 0.035 * s, (0, -0.005, -0.05 * s), sight


def build_guns():
    objs = {}
    for g in GUNS:
        if ONLY is not None and g['id'] not in ONLY:
            continue
        M = gun_mats(g)
        if g['cat'] == 'pistol':
            b, muzzle, bz, lh, sight = build_pistol(g, M)
        else:
            b, muzzle, bz, lh, sight = build_rifle(g, M)
        name = 'gun_%02d' % g['id']
        ob = b.to_object(name)
        empty(name + '_mz', (0, muzzle, bz), ob)
        empty(name + '_lh', lh, ob)
        empty(name + '_sight', (0, 0, sight), ob)
        objs[g['id']] = ob
    return objs


# ================================================================ OPERATOR
# The original (v1) soldier model: blocky, flat-shaded parts. Built with MB(legacy=True).
def op_mats():
    return {
        'skin': get_mat('skin', '#c68a63', rough=0.7),
        'shirt': get_mat('shirt', '#3d4a35', rough=0.85),
        'pants': get_mat('pants', '#3b3f33', rough=0.85),
        'gear': get_mat('gear', '#2b2e26', rough=0.8),
        'hat': get_mat('hat', '#3a3d33', rough=0.8),
        'boots': get_mat('boots', '#201b16', rough=0.7),
        'dark': get_mat('opdark', '#131415', rough=0.6),
        'hair': get_mat('hair', '#1f1812', rough=0.9),
        'lens': get_mat('lens', '#3a5562', metal=0.6, rough=0.1),
        'eye': get_mat('eye', '#0c0c0c', rough=0.3),
        'brass': get_mat('brass', '#b58a3a', metal=0.9, rough=0.35),
    }


def build_operator():
    M = op_mats()
    root = bpy.data.objects.new('op_root', None)
    bpy.context.scene.collection.objects.link(root)
    made = [root]

    def part(name, fn, origin, parent=None, porigin=(0, 0, 0)):
        b = MB(legacy=True)
        fn(b)
        ob = b.to_object(name, origin, parent or root, porigin)
        made.append(ob)
        return ob

    # pelvis
    PEL = (0, 0, 0.98)
    def pelvis(b):
        b.box((0, 0, 0.965), (0.34, 0.21, 0.17), M['pants'], bev=0.02)
        b.box((0, 0, 1.035), (0.355, 0.225, 0.045), M['gear'], bev=0.008)
        b.box((0, 0.114, 1.035), (0.05, 0.01, 0.035), M['brass'])
    pel = part('pelvis', pelvis, PEL)

    # legs
    for side, sx in (('R', 1), ('L', -1)):
        x = 0.1 * sx
        def leg(b, x=x):
            b.box((x, 0.0, 0.71), (0.16, 0.18, 0.44), M['pants'], bev=0.025, taper=(1.08, 1.05))
            b.box((x, 0.0, 0.31), (0.14, 0.16, 0.4), M['pants'], bev=0.02, taper=(1.1, 1.08))
            b.box((x, 0.035, 0.065), (0.15, 0.27, 0.13), M['boots'], bev=0.025)
            b.box((x, 0.035, 0.008), (0.155, 0.275, 0.018), M['dark'])
            b.box((x, 0.0, 0.15), (0.152, 0.172, 0.07), M['boots'], bev=0.01)
        lg = part('leg_' + side, leg, (x, 0, 0.93))
        def pad(b, x=x):
            b.box((x, 0.088, 0.5), (0.13, 0.04, 0.12), M['gear'], bev=0.015)
            b.box((x, 0.11, 0.5), (0.08, 0.01, 0.07), M['dark'])
        part('knee_pads_' + side, pad, (x, 0, 0.93), lg, (x, 0, 0.93))
        if side == 'R':
            def holster(b, x=x):
                b.box((x + 0.09, 0.0, 0.72), (0.04, 0.15, 0.22), M['gear'], bev=0.01)
                b.box((x + 0.1, 0.0, 0.8), (0.04, 0.08, 0.06), M['dark'])
                b.box((x, 0.0, 0.84), (0.17, 0.19, 0.03), M['gear'])
            part('thigh_rig', holster, (x, 0, 0.93), lg, (x, 0, 0.93))

    # torso
    TOR = (0, 0, 1.04)
    def torso(b):
        b.box((0, 0, 1.28), (0.36, 0.215, 0.47), M['shirt'], bev=0.03, taper=(1.18, 1.1))
        b.cyl((0, 0, 1.535), 0.055, 0.09, M['skin'], axis='z', segs=8)
        for sx in (-1, 1):
            b.box((sx * 0.235, 0, 1.45), (0.14, 0.2, 0.13), M['shirt'], bev=0.035)
        b.box((0, 0.105, 1.49), (0.14, 0.03, 0.06), M['shirt'], bev=0.01)
    tor = part('torso', torso, TOR, pel, PEL)

    # head
    HEAD = (0, 0, 1.56)
    def head(b):
        b.box((0, 0.005, 1.705), (0.21, 0.235, 0.26), M['skin'], bev=0.05)
        b.box((0, 0.03, 1.61), (0.175, 0.19, 0.08), M['skin'], bev=0.035)
        b.box((0, 0.128, 1.685), (0.032, 0.04, 0.055), M['skin'], bev=0.01, taper=(0.8, 0.6))
        for sx in (-1, 1):
            b.box((sx * 0.05, 0.121, 1.722), (0.036, 0.01, 0.018), M['eye'])
            b.box((sx * 0.05, 0.124, 1.748), (0.05, 0.012, 0.012), M['hair'])
            b.box((sx * 0.108, -0.005, 1.7), (0.02, 0.05, 0.07), M['skin'], bev=0.006)
        b.box((0, 0.122, 1.635), (0.06, 0.008, 0.008), M['dark'])
    hd = part('head', head, HEAD, tor, TOR)

    def acc(name, fn, parent, porigin):
        part(name, fn, porigin, parent, porigin)

    def hair(b):
        b.box((0, -0.012, 1.82), (0.218, 0.24, 0.05), M['hair'], bev=0.02)
        b.box((0, -0.11, 1.74), (0.2, 0.03, 0.14), M['hair'], bev=0.01)
        for sx in (-1, 1):
            b.box((sx * 0.105, -0.02, 1.77), (0.012, 0.16, 0.08), M['hair'])
    acc('hair', hair, hd, HEAD)

    # headgear
    def helmet(b):
        b.box((0, -0.005, 1.795), (0.265, 0.29, 0.14), M['hat'], bev=0.055, taper=(0.92, 0.92))
        b.box((0, -0.005, 1.735), (0.272, 0.298, 0.035), M['hat'], bev=0.01)
        b.box((0, 0.15, 1.79), (0.06, 0.02, 0.04), M['dark'], bev=0.004)
        for sx in (-1, 1):
            b.box((sx * 0.135, 0.0, 1.765), (0.012, 0.13, 0.025), M['dark'])
        b.box((0, -0.1, 1.86), (0.12, 0.08, 0.02), M['gear'])
    acc('hat_helmet', helmet, hd, HEAD)

    def cap(b):
        b.box((0, -0.005, 1.81), (0.226, 0.252, 0.085), M['hat'], bev=0.03)
        b.box((0, 0.17, 1.776), (0.19, 0.12, 0.014), M['hat'], rot=(0.12, 0, 0), bev=0.004)
        b.box((0, -0.005, 1.858), (0.03, 0.03, 0.01), M['hat'])
    acc('hat_cap', cap, hd, HEAD)

    def beanie(b):
        b.box((0, -0.005, 1.805), (0.232, 0.26, 0.12), M['hat'], bev=0.05)
        b.box((0, -0.005, 1.755), (0.238, 0.266, 0.045), M['hat'], bev=0.012)
    acc('hat_beanie', beanie, hd, HEAD)

    def boonie(b):
        b.box((0, -0.005, 1.815), (0.228, 0.255, 0.09), M['hat'], bev=0.03)
        b.box((0, -0.005, 1.775), (0.38, 0.4, 0.014), M['hat'], bev=0.004)
        b.box((0, -0.005, 1.79), (0.232, 0.259, 0.022), M['gear'])
    acc('hat_boonie', boonie, hd, HEAD)

    def beret(b):
        b.box((0.03, 0.0, 1.82), (0.25, 0.26, 0.05), M['hat'], rot=(0, -0.22, 0), bev=0.022)
        b.box((-0.06, 0.1, 1.82), (0.03, 0.01, 0.035), M['brass'])
    acc('hat_beret', beret, hd, HEAD)

    def headset(b):
        b.box((0, -0.005, 1.845), (0.24, 0.04, 0.02), M['dark'])
        for sx in (-1, 1):
            b.box((sx * 0.118, -0.005, 1.8), (0.015, 0.03, 0.08), M['dark'])
            b.cyl((sx * 0.125, 0.0, 1.71), 0.04, 0.04, M['dark'], axis='x', segs=10)
        b.box((0.11, 0.08, 1.66), (0.008, 0.12, 0.008), M['dark'], rot=(0, 0, 0.6))
    acc('hat_headset', headset, hd, HEAD)

    # face
    def goggles(b):
        b.box((0, -0.005, 1.725), (0.225, 0.255, 0.03), M['dark'])
        for sx in (-1, 1):
            b.box((sx * 0.05, 0.128, 1.724), (0.075, 0.022, 0.048), M['gear'], bev=0.008)
            b.box((sx * 0.05, 0.138, 1.724), (0.06, 0.006, 0.036), M['lens'])
    acc('face_goggles', goggles, hd, HEAD)

    def gasmask(b):
        b.box((0, 0.1, 1.66), (0.19, 0.07, 0.17), M['dark'], bev=0.03)
        b.cyl((0, 0.145, 1.615), 0.035, 0.05, M['dark'], segs=10)
        b.cyl((0.055, 0.14, 1.6), 0.04, 0.05, M['gear'], rot=(-math.pi / 2, 0, -0.5), segs=10)
        for sx in (-1, 1):
            b.cyl((sx * 0.048, 0.138, 1.718), 0.032, 0.012, M['lens'], segs=12)
            b.cyl((sx * 0.048, 0.132, 1.718), 0.037, 0.008, M['gear'], segs=12)
        b.box((0, -0.005, 1.7), (0.222, 0.25, 0.025), M['dark'])
    acc('face_gasmask', gasmask, hd, HEAD)

    def bandana(b):
        b.box((0, 0.012, 1.62), (0.222, 0.24, 0.1), M['gear'], bev=0.02)
        b.box((0, 0.11, 1.585), (0.15, 0.03, 0.08), M['gear'], rot=(0.25, 0, 0), bev=0.01)
    acc('face_bandana', bandana, hd, HEAD)

    def balaclava(b):
        b.box((0, -0.002, 1.79), (0.224, 0.25, 0.12), M['hat'], bev=0.045)
        b.box((0, 0.008, 1.63), (0.215, 0.245, 0.15), M['hat'], bev=0.04)
        for sx in (-1, 1):
            b.box((sx * 0.1, -0.005, 1.722), (0.026, 0.24, 0.05), M['hat'])
        b.box((0, -0.06, 1.722), (0.222, 0.13, 0.05), M['hat'])
        b.box((0, 0.124, 1.722), (0.018, 0.012, 0.05), M['hat'])
        b.cyl((0, -0.01, 1.53), 0.07, 0.08, M['hat'], axis='z', segs=8)
    acc('face_balaclava', balaclava, hd, HEAD)

    def facepaint(b):
        b.box((0, 0.124, 1.722), (0.16, 0.006, 0.05), M['dark'])
        for sx in (-1, 1):
            b.box((sx * 0.07, 0.1, 1.64), (0.02, 0.04, 0.05), M['dark'])
    acc('face_paint', facepaint, hd, HEAD)

    # vests / jackets
    def plate(b):
        b.box((0, 0.125, 1.29), (0.38, 0.06, 0.34), M['gear'], bev=0.015)
        b.box((0, -0.125, 1.31), (0.38, 0.06, 0.36), M['gear'], bev=0.015)
        for sx in (-1, 1):
            b.box((sx * 0.2, 0, 1.24), (0.05, 0.22, 0.2), M['gear'], bev=0.01)
            b.box((sx * 0.1, 0, 1.495), (0.07, 0.29, 0.03), M['gear'], bev=0.006)
        for i, px in enumerate((-0.11, 0.0, 0.11)):
            b.box((px, 0.172, 1.2), (0.095, 0.05, 0.11), M['gear'], bev=0.012)
            b.box((px, 0.198, 1.245), (0.08, 0.006, 0.02), M['dark'])
        b.box((0.11, 0.165, 1.38), (0.06, 0.04, 0.09), M['dark'], bev=0.008)
        b.box((0.13, 0.175, 1.45), (0.008, 0.008, 0.08), M['dark'])
    acc('vest_plate', plate, tor, TOR)

    def jacket(b):
        b.box((0, 0, 1.26), (0.39, 0.245, 0.5), M['gear'], bev=0.03, taper=(1.12, 1.08))
        b.box((0, 0.0, 1.5), (0.26, 0.25, 0.07), M['gear'], bev=0.02)
        b.box((0, 0.13, 1.26), (0.012, 0.006, 0.44), M['dark'])
        for sx in (-1, 1):
            b.box((sx * 0.1, 0.13, 1.12), (0.1, 0.02, 0.09), M['gear'], bev=0.008)
            b.box((sx * 0.1, 0.13, 1.37), (0.09, 0.02, 0.07), M['gear'], bev=0.008)
            b.box((sx * 0.245, 0, 1.45), (0.155, 0.215, 0.145), M['gear'], bev=0.035)
    acc('vest_jacket', jacket, tor, TOR)

    def hoodie(b):
        b.box((0, 0, 1.26), (0.385, 0.24, 0.49), M['gear'], bev=0.035, taper=(1.12, 1.08))
        b.box((0, -0.1, 1.53), (0.26, 0.12, 0.14), M['gear'], bev=0.04)
        b.box((0, 0.13, 1.12), (0.22, 0.03, 0.11), M['gear'], bev=0.012)
        for sx in (-1, 1):
            b.box((sx * 0.04, 0.125, 1.43), (0.008, 0.008, 0.1), M['dark'])
            b.box((sx * 0.245, 0, 1.45), (0.15, 0.21, 0.14), M['gear'], bev=0.035)
    acc('vest_hoodie', hoodie, tor, TOR)

    def bandolier(b):
        b.box((0, 0.122, 1.3), (0.07, 0.02, 0.58), M['dark'], rot=(0, 0.75, 0))
        b.box((0, -0.122, 1.3), (0.07, 0.02, 0.58), M['dark'], rot=(0, -0.75, 0))
        for i in range(6):
            t = -0.2 + i * 0.08
            b.box((t * math.sin(0.75), 0.136, 1.3 + t * math.cos(0.75)), (0.016, 0.012, 0.035), M['brass'], rot=(0, 0.75, 0))
    acc('vest_bandolier', bandolier, tor, TOR)

    # back
    def backpack(b):
        b.box((0, -0.195, 1.24), (0.3, 0.15, 0.36), M['gear'], bev=0.03)
        b.box((0, -0.2, 1.43), (0.29, 0.16, 0.05), M['gear'], bev=0.015)
        for sx in (-1, 1):
            b.box((sx * 0.165, -0.19, 1.2), (0.04, 0.1, 0.18), M['gear'], bev=0.012)
            b.box((sx * 0.1, 0.0, 1.38), (0.04, 0.27, 0.025), M['dark'])
        b.box((0, -0.274, 1.2), (0.18, 0.012, 0.14), M['dark'])
    acc('back_pack', backpack, tor, TOR)

    def radio(b):
        b.box((0, -0.18, 1.28), (0.2, 0.1, 0.3), M['dark'], bev=0.015)
        b.box((0, -0.232, 1.3), (0.14, 0.006, 0.08), M['gear'])
        b.cyl((0.07, -0.18, 1.62), 0.006, 0.42, M['dark'], axis='z', segs=6)
        b.cyl((0.03, -0.18, 1.45), 0.012, 0.04, M['gear'], axis='z', segs=8)
    acc('back_radio', radio, tor, TOR)

    # arms
    for side, sx in (('R', 1), ('L', -1)):
        SH = (0.25 * sx, 0, 1.43)
        EL = (0.27 * sx, 0, 1.14)
        def upper(b, sx=sx):
            b.box((0.27 * sx, 0, 1.29), (0.12, 0.13, 0.3), M['shirt'], bev=0.025)
        ua = part('arm_' + side, upper, SH, tor, TOR)
        def fore(b, sx=sx):
            b.box((0.27 * sx, 0, 1.03), (0.108, 0.115, 0.22), M['shirt'], bev=0.022)
            b.box((0.27 * sx, 0, 0.915), (0.1, 0.105, 0.05), M['skin'], bev=0.01)
            b.box((0.27 * sx, 0.005, 0.85), (0.08, 0.1, 0.1), M['skin'], bev=0.02)
            b.box((0.27 * sx - 0.045 * sx, 0.03, 0.87), (0.025, 0.04, 0.05), M['skin'], bev=0.008)
        fa = part('forearm_' + side, fore, EL, ua, SH)
        def glove(b, sx=sx):
            b.box((0.27 * sx, 0.005, 0.86), (0.09, 0.11, 0.12), M['gear'], bev=0.02)
            b.box((0.27 * sx, 0.0, 0.925), (0.112, 0.118, 0.04), M['dark'], bev=0.008)
        part('gloves_' + side, glove, EL, fa, EL)

    # first-person viewmodel arms (origin = palm; arm runs back toward the camera)
    for side, sx, d in (('R', 1, Vector((0.28, -1.0, -0.42))), ('L', -1, Vector((-0.42, -1.0, -0.38)))):
        d.normalize()
        R = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
        def vm(b, d=d, R=R):
            b.box((0, 0, 0), (0.08, 0.1, 0.095), M['skin'], bev=0.02)
            b.box((d.x * 0.07, d.y * 0.07, d.z * 0.07), (0.09, 0.06, 0.09), M['skin'], mat=R, bev=0.012)
            c = d * 0.24
            b.box(tuple(c), (0.1, 0.3, 0.1), M['shirt'], mat=R, bev=0.022)
            c2 = d * 0.52
            b.box(tuple(c2), (0.12, 0.3, 0.12), M['shirt'], mat=R, bev=0.025)
        b = MB(legacy=True); vm(b)
        made.append(b.to_object('vm_arm_' + side))
        def vmg(b, d=d, R=R):
            b.box((0, 0, 0), (0.09, 0.11, 0.105), M['gear'], bev=0.02)
            b.box((d.x * 0.08, d.y * 0.08, d.z * 0.08), (0.105, 0.04, 0.105), M['dark'], mat=R, bev=0.01)
        b = MB(legacy=True); vmg(b)
        made.append(b.to_object('vm_glove_' + side))
    return made


# ================================================================ export + rendering
def select_only(objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def with_children(o):
    out = [o]
    for c in o.children:
        out.extend(with_children(c))
    return out


def export(objs, path):
    select_only(objs)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=False, export_normals=True, export_animations=False, export_cameras=False,
              export_lights=False, export_extras=False,
              # Draco compression: ~5-10x smaller files (decoded in the browser by three.js DRACOLoader)
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        for k in ('export_texcoords', 'export_extras', 'export_cameras', 'export_lights'):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def setup_render(w, h):
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            continue
    try:
        scene.eevee.taa_render_samples = 24
    except Exception:
        pass
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.exposure = 0.35
    except Exception:
        pass
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.color = (0.22, 0.23, 0.25)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    scene.camera = cam
    for rot, en, col in (((0.9, 0.0, 0.9), 3.2, (1.0, 0.95, 0.88)), ((1.2, 0.0, -2.4), 2.0, (0.6, 0.75, 1.0)), ((2.6, 0.0, 0.3), 1.0, (1, 1, 1))):
        l = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        l.data.energy = en
        l.data.color = col
        l.rotation_euler = rot
        scene.collection.objects.link(l)
    return cam


def frame_camera(cam, objs, aspect, direction=Vector((1.0, -0.32, 0.22)), pad=1.06):
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    centre = sum(pts, Vector()) / len(pts)
    d = direction.normalized()
    q = d.to_track_quat('Z', 'Y')
    cam.rotation_euler = q.to_euler()
    right = q @ Vector((1, 0, 0))
    up = q @ Vector((0, 1, 0))
    xs = [(p - centre).dot(right) for p in pts]
    ys = [(p - centre).dot(up) for p in pts]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cam.data.ortho_scale = max(w, h * aspect) * pad
    cam.location = centre + right * cx + up * cy + d * 5.0


ICON_W, ICON_H, ICON_COLS = 480, 200, 10


def compose_icon_sheet(n):
    """Packs the per-gun pictures into ONE sheet (client/assets/icons.webp): 10 columns, gun i at
    column i % 10, row i // 10. One download instead of 50 and far fewer files to upload."""
    import numpy as np
    W, H, cols = ICON_W, ICON_H, ICON_COLS
    rows = (n + cols - 1) // cols
    sheet = np.zeros((rows * H, cols * W, 4), dtype=np.float32)
    for gid in range(n):
        path = os.path.join(ICON_DIR, 'gun_%02d.webp' % gid)
        img = bpy.data.images.load(path)
        px = np.empty(W * H * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        r, c = gid // cols, gid % cols
        y0 = (rows - 1 - r) * H                  # Blender images start at the bottom row
        sheet[y0:y0 + H, c * W:(c + 1) * W] = px.reshape(H, W, 4)
        bpy.data.images.remove(img)
        os.remove(path)
    out = bpy.data.images.new('icon_sheet', cols * W, rows * H, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(OUT, 'icons.webp')
    out.file_format = 'WEBP'
    try:
        out.save(quality=85)
    except TypeError:
        out.save()
    try:
        os.rmdir(ICON_DIR)
    except OSError:
        pass
    print('icon sheet', os.path.getsize(out.filepath_raw) // 1024, 'KB')


def render_icons(guns):
    W, H = ICON_W, ICON_H
    cam = setup_render(W, H)
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88
    for ob in guns.values():
        for o in with_children(ob):
            o.hide_render = True
    for gid, ob in guns.items():
        for o in with_children(ob):
            o.hide_render = False
        frame_camera(cam, [ob], W / H)
        scene.render.filepath = os.path.join(ICON_DIR, 'gun_%02d.webp' % gid)
        bpy.ops.render.render(write_still=True)
        for o in with_children(ob):
            o.hide_render = True
    print('rendered', len(guns), 'icons')
    if ONLY is None:
        compose_icon_sheet(len(GUNS))


# ---------------------------------------------------------------- main
bpy.ops.wm.read_factory_settings(use_empty=True)
guns = build_guns()
total = 0
for gid, ob in guns.items():
    total += export(with_children(ob), os.path.join(GUN_DIR, 'gun_%02d.glb' % gid))
print('exported %d guns, %d KB total' % (len(guns), total // 1024))
if ICONS:
    render_icons(guns)  # before the operator exists, so it is not in the pictures

op = build_operator()
print('exported operator', export(op, os.path.join(OUT, 'operator.glb')) // 1024, 'KB')
tris = sum(len(o.data.loop_triangles) if o.type == 'MESH' and (o.data.calc_loop_triangles() or True) else 0 for o in op)
print('operator triangles (all options):', tris)

if PREVIEW:
    scene = bpy.context.scene
    cam = scene.camera or setup_render(900, 900)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    # close-up sheet of a few guns
    pick = [int(a) for a in ARGS[ARGS.index('--pick') + 1].split(',')] if '--pick' in ARGS else [0, 4, 5, 6, 8, 9, 15, 49]
    pick = [p for p in pick if p in guns]
    for ob in guns.values():
        for o in with_children(ob):
            o.hide_render = True
    shown = []
    for j, gi in enumerate(pick):
        for o in with_children(guns[gi]):
            o.hide_render = False
        guns[gi].location = (0, 40 + (j % 4) * 1.4, -(j // 4) * 0.55)
        shown.append(guns[gi])
    bpy.context.view_layer.update()
    scene.render.resolution_x, scene.render.resolution_y = 1800, 700
    frame_camera(cam, shown, 1800 / 700, direction=Vector((1, 0, 0.05)), pad=1.02)
    scene.render.filepath = os.path.join(OUT, 'preview_closeup.png')
    bpy.ops.render.render(write_still=True)
    for o in shown:
        o.hide_render = True
    # operator front + side (two copies would need duplication; render front then rotate)
    for ob in op:
        if ob.name.startswith('vm_'):
            ob.hide_render = True
        for pre in ('hat_cap', 'hat_beanie', 'hat_boonie', 'hat_beret', 'hat_headset', 'face_gasmask', 'face_bandana',
                    'face_balaclava', 'face_paint', 'face_goggles', 'vest_jacket', 'vest_hoodie', 'vest_bandolier', 'back_radio', 'gloves_'):
            if ob.name.startswith(pre):
                ob.hide_render = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 1000
    root = op[0]
    for i, rz in enumerate((PI * 0.15, PI * 0.6)):
        root.rotation_euler = (0, 0, rz)
        bpy.context.view_layer.update()
        frame_camera(cam, [o for o in op if not o.hide_render], 0.9, direction=Vector((0, 1, 0.12)), pad=1.08)
        scene.render.filepath = os.path.join(OUT, 'preview_operator_%d.png' % i)
        bpy.ops.render.render(write_still=True)
    print('rendered previews')
