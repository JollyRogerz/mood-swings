"""Build the editable preview scene from the print STLs in Blender 5.x.

Run: blender --background --python render_blender.py
The STL files are the printable geometry. Preview cards, lights and floor are
kept in a separate collection and are not part of either print.
"""

from __future__ import annotations

import bmesh
import bpy
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection" and collection.users == 0:
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 0.001  # One mesh unit is one millimetre.
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 1500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = "//preview.png"  # Keep the saved .blend portable.
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs[0].default_value = (
    0.017, 0.021, 0.049, 1
)
scene.world.node_tree.nodes.get("Background").inputs[1].default_value = 0.8


def material(name: str, color: tuple[float, float, float, float], rough: float, metal: float = 0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.42 if metal else 0.14
    return mat


cyan = material("Illustrative silk · prismatic teal", (0.035, 0.59, 0.65, 1), 0.20, 0.22)
violet = material("Illustrative silk · violet", (0.46, 0.18, 0.75, 1), 0.20, 0.22)
gold = material("Illustrative silk · warm gold", (0.85, 0.40, 0.12, 1), 0.22, 0.18)
edge = material("Illustrative silk · rim", (0.28, 0.19, 0.47, 1), 0.23, 0.18)
navy = material("Preview floor", (0.018, 0.026, 0.059, 1), 0.65)
card_1 = material("Preview only · ink-blue sleeves", (0.026, 0.09, 0.22, 1), 0.46)


def new_collection(name: str):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


print_col = new_collection("PRINT THESE TWO MESHES")
visual_col = new_collection("PREVIEW ONLY · not in the STL files")


def put_in(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def inspect_mesh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    volume = bm.calc_volume(signed=True)
    print(
        f"QA {obj.name}: {len(bm.verts)} vertices, {len(bm.faces)} faces, "
        f"{nonmanifold} nonmanifold edges, signed volume {volume:.1f} mm³, "
        f"bounds {[round(v, 2) for v in obj.dimensions]} mm"
    )
    assert nonmanifold == 0, f"{obj.name} is not watertight"
    assert volume > 0, f"{obj.name} has flipped normals"
    bm.free()


def load_print(name: str, path: Path):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = next(o for o in bpy.data.objects if o not in before)
    obj.name = name
    put_in(obj, print_col)
    inspect_mesh(obj)
    for mat in [cyan, violet, gold, edge]:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        n = poly.normal
        if n.z > 0.8:
            poly.material_index = 2 if name == "Sliding lid" and poly.center.z > 2.5 else 3
        elif n.y < -0.05:
            poly.material_index = 0 if n.x < 0 else 1
        elif n.y > 0.05:
            poly.material_index = 1 if n.x < 0 else 2
        else:
            poly.material_index = 2 if n.x > 0 else 0
    return obj


body = load_print("Single deck case · body", ROOT / "body.stl")
lid = load_print("Sliding lid", ROOT / "lid.stl")
assembled_z = round(body.dimensions.z - 5.5 + 0.25, 2)
assert assembled_z - (2.8 + 92.0) >= 3.0, "The assembled lid must clear sleeved cards."
lid.location = (17, 24, body.dimensions.z + 19)  # Exploded preview.
lid["assembled_location_mm"] = (0, 0, assembled_z)


def cube(name, location, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    put_in(obj, visual_col)
    obj.data.materials.append(mat)
    return obj


cube("Preview only · 45 sleeved cards", (0, 0, 48.85), (66, 31, 92), card_1)
cube("Preview only · studio floor", (0, 0, -0.9), (340, 270, 1.8), navy)


def point(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, location, power, color, size, target=(0, 0, 65)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    visual_col.objects.link(obj)
    obj.location = location
    point(obj, target)


light("Large softbox · front", (65, -100, 210), 420000, (0.91, 0.96, 1.0), 160)
light("Warm highlight · right", (160, 68, 170), 350000, (1.0, 0.80, 0.60), 110)
light("Cool rim · rear", (-100, 125, 165), 300000, (0.55, 0.77, 1.0), 115)

camera_data = bpy.data.cameras.new("Product view")
camera = bpy.data.objects.new("Product view", camera_data)
visual_col.objects.link(camera)
camera.location = (145, -210, 178)
point(camera, (7, 10, 70))
camera_data.type = "ORTHO"
camera_data.ortho_scale = 190
scene.camera = camera

scene.view_settings.view_transform = "AgX"
scene.render.film_transparent = False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "mood_deck_case.blend"))
bpy.ops.render.render(write_still=True)

lid.location = (0, 0, assembled_z)
camera_data.ortho_scale = 150
point(camera, (0, 0, 55))
scene.render.filepath = "//preview_closed.png"
bpy.ops.render.render(write_still=True)


def strip_png_metadata(path: Path):
    """Blender records the local .blend path in PNG text metadata."""
    png = path.read_bytes()
    signature = b"\x89PNG\r\n\x1a\n"
    assert png.startswith(signature)
    clean = bytearray(signature)
    cursor = len(signature)
    while cursor < len(png):
        size = int.from_bytes(png[cursor : cursor + 4], "big")
        kind = png[cursor + 4 : cursor + 8]
        end = cursor + 12 + size
        assert end <= len(png), "Truncated PNG chunk"
        if kind not in {b"tEXt", b"zTXt", b"iTXt", b"eXIf"}:
            clean.extend(png[cursor:end])
        cursor = end
        if kind == b"IEND":
            break
    assert cursor == len(png), "Unexpected data after PNG end chunk"
    path.write_bytes(clean)


for image_name in ("preview.png", "preview_closed.png"):
    strip_png_metadata(ROOT / image_name)
print(f"Saved {ROOT / 'mood_deck_case.blend'} and both previews")
