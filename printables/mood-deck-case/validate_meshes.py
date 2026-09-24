"""Check exported print meshes and assembled lid clearance in Blender.

Run: blender --background --python validate_meshes.py
This checks geometry; it cannot replace a physical sleeve and printer fit test.
"""

import bmesh
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(ROOT / f"{name}.stl"))
    obj = next(o for o in bpy.data.objects if o not in before)
    obj.name = name
    return obj


def report(obj, expected_parts):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    open_edges = sum(not edge.is_manifold for edge in bm.edges)
    unseen = set(bm.verts)
    parts = 0
    while unseen:
        parts += 1
        queue = [unseen.pop()]
        while queue:
            vertex = queue.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
    volume = bm.calc_volume(signed=True)
    print(
        f"{obj.name}: {parts} closed part(s), {open_edges} nonmanifold edges, "
        f"{volume:.1f} mm³, {[round(v, 2) for v in obj.dimensions]} mm"
    )
    assert parts == expected_parts
    assert open_edges == 0
    assert volume > 0
    assert obj.dimensions.z > 0
    bm.free()


body = load("body")
lid = load("lid")
gauge = load("fit_gauge")
for mesh, count in [(body, 1), (lid, 1), (gauge, 3)]:
    report(mesh, count)

# The user measured a sleeved card at 66 x 92 mm. The nominal 96 mm usable
# height leaves clearance above it; do not count the recessed lid as open air.
floor = 2.8
slot_floor_from_rim = 5.5
assembled_lid_bottom = body.dimensions.z - slot_floor_from_rim + 0.25
card_top = floor + 92.0
assert assembled_lid_bottom - card_top >= 3.0

# Check the actual printable meshes, not the Blender preview position.
lid.location.z = assembled_lid_bottom
test_body = body.copy()
test_body.data = body.data.copy()
bpy.context.collection.objects.link(test_body)
modifier = test_body.modifiers.new("Overlapping volume", "BOOLEAN")
modifier.operation = "INTERSECT"
modifier.solver = "EXACT"
modifier.object = lid
bpy.context.view_layer.objects.active = test_body
bpy.ops.object.modifier_apply(modifier=modifier.name)
bm = bmesh.new()
bm.from_mesh(test_body.data)
overlap = abs(bm.calc_volume(signed=True)) if len(bm.faces) else 0
bm.free()
print(f"Body/lid intersection at assembled height: {overlap:.3f} mm³")
assert overlap < 0.05
print("Printable mesh QA passed. Physical fit still needs the supplied gauge.")
