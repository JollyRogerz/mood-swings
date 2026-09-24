"""Render illustrative product previews from the printable STLs with Blender.

Run: blender --background --python render_preview.py
The metallic colours are artistic, not predictions of tri-colour silk filament.
"""

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1300
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.015, 0.018, 0.044, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
scene.view_settings.view_transform = "AgX"


def material(name, colour, metal=0.0, rough=0.3):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*colour, 1)
    item.use_nodes = True
    shader = item.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*colour, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Coat Weight"].default_value = 0.3
    return item


violet = material("Illustrative plum silk", (0.31, 0.12, 0.57), 0.24, 0.22)
teal = material("Illustrative teal silk", (0.015, 0.52, 0.58), 0.22, 0.21)
gold = material("Illustrative warm silk", (0.87, 0.47, 0.16), 0.20, 0.25)
navy = material("Studio backdrop", (0.018, 0.021, 0.048), 0, 0.7)
card = material("Preview sleeves", (0.034, 0.09, 0.20), 0, 0.5)


def point(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def load(name):
    previous = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(ROOT / f"{name}.stl"))
    obj = next(o for o in bpy.data.objects if o not in previous)
    obj.name = name
    for mat in (violet, teal, gold):
        obj.data.materials.append(mat)
    for face in obj.data.polygons:
        if name == "lid" and face.center.x > 37.5:
            face.material_index = 2  # Show the new release clip clearly.
        elif face.normal.z > 0.8:
            face.material_index = 2 if name == "lid" and face.center.z > 2.5 else 0
        elif face.normal.x > 0.1:
            face.material_index = 1
        elif face.normal.y < -0.1:
            face.material_index = 2
        else:
            face.material_index = 0
    return obj


body = load("body")
lid = load("lid")

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -1.1))
floor = bpy.context.object
floor.name = "Preview-only floor"
floor.dimensions = (300, 300, 2)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
floor.data.materials.append(navy)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 2.2 + 31 / 2))
deck = bpy.context.object
deck.name = "Preview-only sleeved cards"
deck.dimensions = (66, 92, 31)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
deck.data.materials.append(card)


def area(name, location, energy, colour, size):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.color = colour
    light_data.shape = "DISK"
    light_data.size = size
    obj = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(obj)
    obj.location = location
    point(obj, (0, 0, 35))


area("Cool front", (85, 160, 195), 260000, (0.74, 0.92, 1), 130)
area("Warm rim", (165, -80, 175), 240000, (1, 0.75, 0.53), 110)
area("Soft fill", (-115, 55, 160), 200000, (0.76, 0.72, 1), 120)

camera_data = bpy.data.cameras.new("Right-front product view")
camera = bpy.data.objects.new("Right-front product view", camera_data)
scene.collection.objects.link(camera)
camera.location = (156, 175, 170)
point(camera, (0, 0, 31))
camera_data.type = "ORTHO"
camera_data.ortho_scale = 148
scene.camera = camera

assembled_z = 40.2 - 5 + (2.75 - 2.25) / 2
lid.location = (0, 0, assembled_z)
deck.hide_render = True
scene.render.filepath = str(ROOT / "preview_closed.png")
bpy.ops.render.render(write_still=True)

lid.location = (0, 17, 61)
deck.hide_render = False
camera_data.ortho_scale = 169
point(camera, (0, 5, 37))
scene.render.filepath = str(ROOT / "preview_exploded.png")
bpy.ops.render.render(write_still=True)


def strip_png_metadata(path):
    data = path.read_bytes()
    signature = b"\x89PNG\r\n\x1a\n"
    assert data.startswith(signature)
    output = bytearray(signature)
    cursor = len(signature)
    while cursor < len(data):
        length = int.from_bytes(data[cursor : cursor + 4], "big")
        kind = data[cursor + 4 : cursor + 8]
        end = cursor + 12 + length
        assert end <= len(data)
        if kind not in (b"tEXt", b"zTXt", b"iTXt", b"eXIf"):
            output.extend(data[cursor:end])
        cursor = end
        if kind == b"IEND":
            break
    assert cursor == len(data)
    path.write_bytes(output)


for filename in ("preview_closed.png", "preview_exploded.png"):
    strip_png_metadata(ROOT / filename)
print("Saved closed and exploded illustrative previews")
