# Turns a detailed, skinned operator model (skull_operator.glb) into the game's light "KNOCK OFF GHOST"
# operator: the same 9 rigid parts the normal soldier uses (so the game's animation works unchanged),
# ~7k triangles, colours baked into the vertices, one small texture for the skull mask, Draco-compressed.
#
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup
#       --python blender/make_ghost.py -- <skull_operator.glb> [client/assets/ghost.glb]
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    raise SystemExit('usage: ... --python make_ghost.py -- <in.glb> [out.glb]')
SRC = os.path.abspath(args[0])
OUT = os.path.abspath(args[1] if len(args) > 1 else os.path.join(os.path.dirname(__file__), '..', 'client', 'assets', 'ghost.glb'))

PARTS = ['pelvis', 'torso', 'head', 'arm_R', 'forearm_R', 'arm_L', 'forearm_L', 'leg_L', 'leg_R']
PARENT = {'torso': 'pelvis', 'head': 'torso', 'arm_R': 'torso', 'arm_L': 'torso', 'forearm_R': 'arm_R', 'forearm_L': 'arm_L'}
TARGET_TRIS = {'pelvis': 600, 'torso': 2000, 'head': 1300, 'arm_R': 300, 'arm_L': 300, 'forearm_R': 500, 'forearm_L': 500, 'leg_L': 800, 'leg_R': 800}
FACE_MAT = 'Skull_Balaclava'      # keeps its texture (the skull print); everything else becomes vertex colour
FACE_TEX = 512
MIN_SIZE = 0.035                  # parts smaller than this (m) vanish at game distance: boot lugs, eyelets, laces...
LIFT = 1.25                       # the source colours are near-black; lift them a little so the shape reads in game


def part_for(bone):
    """Maps a source skeleton bone to one of the game's rigid parts. The model faces -Y and is turned to +Y
    below, which puts its Left side at -X: the game's *_L side."""
    side = 'L' if bone.startswith('Left') else 'R' if bone.startswith('Right') else ''
    if bone == 'Hips':
        return 'pelvis'
    if bone in ('Neck', 'Head'):
        return 'head'
    if side and ('UpLeg' in bone or bone.endswith(('Leg', 'Foot', 'ToeBase'))):
        return 'leg_' + side
    if side and bone.endswith('ForeArm') or side and 'Hand' in bone:
        return 'forearm_' + side
    if side and bone.endswith('Arm'):
        return 'arm_' + side
    return 'torso'  # Spine, Spine1, Spine2, shoulders


# ---------------------------------------------------------------- load
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
srcs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in srcs:
    if o.parent != arm:
        print('GHOST skip (not part of the character):', o.name)

# ---------------------------------------------------------------- pose: arms hang straight down like the game's soldier
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for side, sx in (('Left', 1), ('Right', -1)):
    for bone, want in ((side + 'Arm', Vector((sx * 0.06, 0.0, -1.0))), (side + 'ForeArm', Vector((sx * 0.02, 0.0, -1.0)))):
        pb = arm.pose.bones[bone]
        d = (pb.tail - pb.head).normalized()
        q = d.rotation_difference(want.normalized())
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
        bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
dg = bpy.context.evaluated_depsgraph_get()

TURN = Matrix.Rotation(math.pi, 4, 'Z')   # face +Y like the game's soldier (exported as -Z)
W = TURN @ arm.matrix_world
PIVOT = {
    'pelvis': arm.pose.bones['Hips'].head, 'torso': arm.pose.bones['Spine'].head, 'head': arm.pose.bones['Neck'].head,
    'arm_L': arm.pose.bones['LeftArm'].head, 'arm_R': arm.pose.bones['RightArm'].head,
    'forearm_L': arm.pose.bones['LeftForeArm'].head, 'forearm_R': arm.pose.bones['RightForeArm'].head,
    'leg_L': arm.pose.bones['LeftUpLeg'].head, 'leg_R': arm.pose.bones['RightUpLeg'].head,
}
PIVOT = {k: W @ v for k, v in PIVOT.items()}


# ---------------------------------------------------------------- material colours
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat_colour(m):
    """Linear RGB of a material: its base colour, or the average of its base-colour texture."""
    if m is None or not m.use_nodes:
        return (0.05, 0.05, 0.05)
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return (0.05, 0.05, 0.05)
    inp = bsdf.inputs['Base Color']
    fac = tuple(inp.default_value)[:3]
    if inp.is_linked:
        n = inp.links[0].from_node
        while n.type != 'TEX_IMAGE' and n.inputs and any(i.is_linked for i in n.inputs):
            n = next(i for i in n.inputs if i.is_linked).links[0].from_node
        if n.type == 'TEX_IMAGE' and n.image:
            img = n.image
            px = np.empty(len(img.pixels), dtype=np.float32)
            img.pixels.foreach_get(px)
            avg = px.reshape(-1, 4)[:, :3].mean(axis=0)
            lin = [srgb_to_lin(float(c)) for c in avg] if img.colorspace_settings.name.lower().startswith('srgb') else [float(c) for c in avg]
            return tuple(lin)
        return (0.05, 0.05, 0.05)
    return fac


def face_image(m):
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n = bsdf.inputs['Base Color'].links[0].from_node
    while n.type != 'TEX_IMAGE':
        n = next(i for i in n.inputs if i.is_linked).links[0].from_node
    return n.image


# ---------------------------------------------------------------- gather geometry per game part
buf = {p: {'co': [], 'faces': [], 'mat': [], 'uv': []} for p in PARTS}
mats = []          # source materials, indexed by face 'mat'
mat_index = {}
skipped = 0
for ob in srcs:
    if ob.parent != arm:
        continue
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    M = TURN @ ob.matrix_world
    co = [M @ v.co for v in me.vertices]
    lo = Vector(map(min, *co)) if len(co) > 1 else co[0]
    hi = Vector(map(max, *co)) if len(co) > 1 else co[0]
    if (hi - lo).length < MIN_SIZE and not ob.name.startswith('Eye'):
        skipped += 1
        ev.to_mesh_clear()
        continue
    gnames = [g.name for g in ob.vertex_groups]
    orig = ob.data
    same = len(orig.vertices) == len(me.vertices)
    vparts = []
    for v in (orig.vertices if same else []):
        w = {}
        for g in v.groups:
            p = part_for(gnames[g.group])
            w[p] = w.get(p, 0.0) + g.weight
        vparts.append(w)
    uvl = me.uv_layers.active
    remap = {p: {} for p in PARTS}
    for poly in me.polygons:
        tot = {}
        for vi in poly.vertices:
            for p, wt in (vparts[vi] if same else {}).items():
                tot[p] = tot.get(p, 0.0) + wt
        part = max(tot, key=tot.get) if tot else 'torso'
        m = ob.material_slots[poly.material_index].material if ob.material_slots else None
        key = m.name if m else ''
        if key not in mat_index:
            mat_index[key] = len(mats)
            mats.append(m)
        B = buf[part]
        idx = []
        for vi in poly.vertices:
            r = remap[part].get(vi)
            if r is None:
                r = remap[part][vi] = len(B['co'])
                B['co'].append(co[vi])
            idx.append(r)
        B['faces'].append(idx)
        B['mat'].append(mat_index[key])
        B['uv'].append([tuple(uvl.data[li].uv) if uvl else (0.0, 0.0) for li in poly.loop_indices])
    ev.to_mesh_clear()
print('GHOST skipped tiny parts:', skipped)

colours = [mat_colour(m) for m in mats]
face_idx = mat_index.get(FACE_MAT)

# ---------------------------------------------------------------- build, clean up and decimate each part
mat_vc = bpy.data.materials.new('ghost_body')
mat_face = bpy.data.materials.new('ghost_face')
mat_face.use_nodes = True
img = face_image(mats[face_idx]) if face_idx is not None else None
if img:
    img.scale(FACE_TEX, FACE_TEX)
    nt = mat_face.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'])

root = bpy.data.objects.new('ghost_root', None)
bpy.context.scene.collection.objects.link(root)
objs = {}
report = []
for part in PARTS:
    B = buf[part]
    me = bpy.data.meshes.new('ghost_' + part)
    piv = PIVOT[part]
    me.from_pydata([tuple(c - piv) for c in B['co']], [], B['faces'])
    me.polygons.foreach_set('material_index', B['mat'])
    has_face = face_idx is not None and face_idx in B['mat']
    if has_face:
        uv = me.uv_layers.new(name='UVMap')
        flat = [c for f in B['uv'] for uvc in f for c in uvc]
        uv.data.foreach_set('uv', flat)
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(part, me)
    bpy.context.scene.collection.objects.link(ob)
    before = sum(len(p.vertices) - 2 for p in me.polygons)
    # weld seams so the decimator sees one surface, then cut down to the triangle budget
    me.validate(clean_customdata=False)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    bm.to_mesh(me); bm.free()
    me.validate(clean_customdata=False)
    ratio = min(1.0, TARGET_TRIS[part] / max(1, before))
    md = ob.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = ratio; md.use_collapse_triangulate = True
    dgp = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dgp))
    ob.modifiers.clear()
    old = ob.data; ob.data = new; bpy.data.meshes.remove(old)
    me = ob.data
    # colours per face corner from the source material; faces of the mask keep the texture instead
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = col
    try:
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
    except Exception:
        pass
    cdata = [0.0] * (len(me.loops) * 4)
    new_idx = [0] * len(me.polygons)
    for p in me.polygons:
        is_face = p.material_index == face_idx
        c = (1.0, 1.0, 1.0) if is_face else tuple(min(1.0, v * LIFT) for v in colours[p.material_index])
        new_idx[p.index] = 1 if is_face else 0
        for li in p.loop_indices:
            cdata[li * 4:li * 4 + 4] = [c[0], c[1], c[2], 1.0]
    col.data.foreach_set('color', cdata)
    me.materials.clear()          # (this resets every face to slot 0, so set the slots afterwards)
    me.materials.append(mat_vc)
    if has_face:
        me.materials.append(mat_face)
    me.polygons.foreach_set('material_index', new_idx)
    if has_face:
        print('GHOST', part, 'mask faces:', sum(new_idx))
    # smooth shading with hard edges on sharp creases (keeps pouches and boots boxy)
    bm = bmesh.new(); bm.from_mesh(me)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(42):
            e.smooth = False
    bm.to_mesh(me); bm.free()
    me.validate(clean_customdata=False)   # drops the odd degenerate face the welding leaves behind
    after = sum(len(p.vertices) - 2 for p in me.polygons)
    report.append(f'{part}: {before} -> {after} tris')
    objs[part] = ob

for part in PARTS:
    ob = objs[part]
    par = PARENT.get(part)
    ob.parent = objs[par] if par else root
    ob.location = PIVOT[part] - (PIVOT[par] if par else Vector())
print('GHOST', ' | '.join(report))
print('GHOST pivots', {k: tuple(round(c, 3) for c in v) for k, v in PIVOT.items()})

# colours the first-person arms use (sleeve + glove), as sRGB hex for the game
def hexcol(name):
    c = colours[mat_index[name]] if name in mat_index else (0.03, 0.03, 0.03)
    def enc(v):
        v = min(1.0, v * LIFT)
        s = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        return round(s * 255)
    return '#%02x%02x%02x' % tuple(enc(v) for v in c)
print('GHOST viewmodel colours: sleeve', hexcol('Uniform_Navy_Fabric'), 'glove', hexcol('Glove_Synthetic'), 'glove panel', hexcol('Glove_Bone_Panels'))

# ---------------------------------------------------------------- export
for o in bpy.context.scene.objects:
    o.select_set(False)
for o in [root] + list(objs.values()):
    o.select_set(True)
bpy.context.view_layer.objects.active = root
kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
          export_texcoords=True, export_normals=True, export_animations=False, export_skins=False,
          export_cameras=False, export_lights=False, export_extras=False,
          export_vertex_color='ACTIVE', export_image_format='JPEG', export_jpeg_quality=82,
          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
          export_draco_position_quantization=14, export_draco_normal_quantization=10,
          export_draco_texcoord_quantization=12, export_draco_color_quantization=8)
for drop in ([], ['export_vertex_color'], ['export_jpeg_quality', 'export_image_format'], ['export_draco_color_quantization']):
    for k in drop:
        kw.pop(k, None)
    try:
        bpy.ops.export_scene.gltf(**kw)
        break
    except TypeError as e:
        print('GHOST export retry without', drop, e)
print('GHOST wrote', OUT, os.path.getsize(OUT), 'bytes')
