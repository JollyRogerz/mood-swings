"""Validate the flat V2 STLs with Blender: blender -b -P validate_meshes.py."""

from pathlib import Path

import bmesh
import bpy


ROOT = Path(__file__).resolve().parent


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(ROOT / f"{name}.stl"))
    obj = next(obj for obj in bpy.data.objects if obj not in before)
    obj.name = name
    return obj


def report(obj, expected_parts):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bad_edges = sum(not edge.is_manifold for edge in mesh.edges)
    unseen = set(mesh.verts)
    components = []
    while unseen:
        seed = unseen.pop()
        pending = [seed]
        vertices = [seed]
        while pending:
            current = pending.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other in unseen:
                    unseen.remove(other)
                    pending.append(other)
                    vertices.append(other)
        components.append(vertices)
    volume = mesh.calc_volume(signed=True)
    print(
        f"{obj.name}: {len(components)} component(s), {bad_edges} nonmanifold edges, "
        f"{volume:.1f} mm³, dimensions {[round(v, 2) for v in obj.dimensions]} mm"
    )
    for index, vertices in enumerate(components, start=1):
        if len(components) > expected_parts:
            print(
                f"  component {index}: {len(vertices)} vertices, "
                f"bounds {[tuple(round(min(v.co[axis] for v in vertices), 2) for axis in range(3)), tuple(round(max(v.co[axis] for v in vertices), 2) for axis in range(3))]}"
            )
    assert bad_edges == 0
    assert volume > 0
    assert len(components) == expected_parts
    mesh.free()


def overlap(a, b):
    probe = a.copy()
    probe.data = a.data.copy()
    bpy.context.collection.objects.link(probe)
    modifier = probe.modifiers.new("Intersection", "BOOLEAN")
    modifier.operation = "INTERSECT"
    modifier.solver = "EXACT"
    modifier.object = b
    bpy.context.view_layer.objects.active = probe
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh = bmesh.new()
    mesh.from_mesh(probe.data)
    volume = abs(mesh.calc_volume(signed=True)) if mesh.faces else 0.0
    mesh.free()
    bpy.data.objects.remove(probe, do_unlink=True)
    return volume


body = load("body")
lid = load("lid")
gauge = load("fit_gauge")
report(body, 1)
report(lid, 1)
report(gauge, 3)

# User-measured 66 × 92 × 31 mm physical stack inside the 70 × 96 × 33 mm
# cavity. There is no card/lid collision in the nominal closed assembly.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 2.2 + 31 / 2))
deck = bpy.context.object
deck.name = "Sleeved deck gauge"
deck.dimensions = (66, 92, 31)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
assert overlap(body, deck) < 0.05

lid.location.z = 40.2 - 5 + (2.75 - 2.25) / 2
closed_overlap = overlap(body, lid)
print(f"Fully closed body/lid solid overlap: {closed_overlap:.4f} mm³")
assert closed_overlap < 0.05
assert overlap(lid, deck) < 0.05

# Attempting to withdraw the unflexed lid must hit the square catch face.
# This is an intentional obstruction; motion requires pulling the side pad
# outward. It distinguishes a true lock from the V1's friction-only fit.
lid.location.y = 0.8
locked_overlap = overlap(body, lid)
print(f"Unreleased 0.8 mm withdrawal overlap: {locked_overlap:.4f} mm³")
assert locked_overlap > 0.1

print("Flat V2 geometry validation passed. Print the latch coupon for real fit.")
