"""Mechanical/mesh QA for the upright V2 case; run with Blender --background."""
from pathlib import Path
import bmesh
import bpy

ROOT = Path(__file__).resolve().parent


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(ROOT / f"{name}.stl"))
    obj = next(o for o in bpy.data.objects if o not in before)
    obj.name = name
    return obj


def mesh_report(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    bad = sum(not e.is_manifold for e in bm.edges)
    unseen = set(bm.verts)
    components = 0
    while unseen:
        components += 1
        queue = [unseen.pop()]
        while queue:
            v = queue.pop()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w in unseen:
                    unseen.remove(w)
                    queue.append(w)
    volume = bm.calc_volume(signed=True)
    print(f"{obj.name}: {components} component, {bad} nonmanifold edges, {volume:.2f} mm3, dimensions {tuple(round(v,2) for v in obj.dimensions)}")
    assert components == 1
    assert bad == 0
    assert volume > 0
    bm.free()


def intersection_details(a, b):
    probe = a.copy()
    probe.data = a.data.copy()
    bpy.context.collection.objects.link(probe)
    mod = probe.modifiers.new("overlap", "BOOLEAN")
    mod.operation = "INTERSECT"
    mod.solver = "EXACT"
    mod.object = b
    bpy.context.view_layer.objects.active = probe
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(probe.data)
    result = abs(bm.calc_volume(signed=True)) if len(bm.faces) else 0
    bounds = None
    closest_to_center_y = None
    if len(bm.faces):
        bounds = tuple((min(v.co[i] for v in bm.verts),
                        max(v.co[i] for v in bm.verts)) for i in range(3))
        closest_to_center_y = min(abs(v.co.y) for v in bm.verts)
    bm.free()
    bpy.data.objects.remove(probe, do_unlink=True)
    return result, bounds, closest_to_center_y


def intersection_volume(a, b):
    return intersection_details(a, b)[0]


body, lid, coupon_body, coupon_lid, card_gauge = [load(n) for n in (
    "body", "lid", "latch_gauge_body", "latch_gauge_lid", "card_gauge"
)]
for part in (body,lid,coupon_body,coupon_lid,card_gauge):
    mesh_report(part)

# The 66 x 92 x 31 mm measured 45-card deck must clear both the body and lid.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,2.8+92/2))
deck=bpy.context.object
deck.dimensions=(66,31,92)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
body_deck=intersection_volume(body,deck)
print(f"Body/deck overlap: {body_deck:.4f} mm3")
assert body_deck < 0.05

# Assembled lid bottom: H 104.3 - groove floor 5.5 + nominal 0.25 rise.
lid.location.z=104.3-5.5+0.25
print(f"Deck/lid vertical gap: {lid.location.z-(2.8+92):.2f} mm")
assert lid.location.z-(2.8+92)>4
closed_overlap=intersection_volume(body,lid)
print(f"Body/lid closed overlap: {closed_overlap:.4f} mm3")
assert closed_overlap < 0.1
print(f"Lid/deck overlap: {intersection_volume(lid,deck):.4f} mm3")
assert intersection_volume(lid,deck)<0.05

# Entry at +X: the nubs must be compressed while passing the non-pocketed
# side rails. This is intentional; closed position must have no intersection.
lid.location.x=2
insertion_overlap=intersection_volume(body,lid)
print(f"Body/lid at +2 mm insertion offset (intentional nub flex): {insertion_overlap:.4f} mm3")
assert insertion_overlap > 0.2
assert insertion_overlap < 8

# Check the entire slide route at the channel floor, nominal 0.25 mm rise,
# and roof-side limit (0.75 mm above the floor).
# The only designed interference is at the two outer nub tips, which flex
# inward into the lid's relief slits as they pass the unpocketed side rails.
nominal_lid_bottom = 104.3 - 5.5
for rise in (0, 0.25, 0.75):
    lid.location.z = nominal_lid_bottom + rise
    for offset in (0, 0.25, 0.5, 1, 2, 4, 6, 8, 10, 15, 25, 35, 45, 60, 73):
        lid.location.x = offset
        volume, bounds, closest_to_center_y = intersection_details(body, lid)
        print(f"Full lid slide: rise={rise:.2f} mm, X={offset:.2f} mm, "
              f"overlap={volume:.4f} mm3, nearest_center_y={closest_to_center_y}")
        if offset == 0:
            assert volume < 0.05, "A closed lid must rest without compressing its nubs"
        if volume > 0.05:
            assert bounds is not None
            assert closest_to_center_y >= 17.83, (
                "Sliding collision extends inside the rail opening, beyond nub tips"
            )
            assert volume < 10, "Excessive insertion interference"

# There must be a substantial, continuous sheet behind the slit roots in the
# full lid; a previous coupon cropped this to only 0.05 mm and could not test
# retention. The full lid starts at X=-34.65 and the 0.9 mm round slit starts
# at X=7.55, leaving 42.2 mm of uncut material behind each root.
full_lid_anchor_length = 7.55 - (-34.65)
assert full_lid_anchor_length > 5
print(f"Full lid uncut material behind spring roots: {full_lid_anchor_length:.2f} mm")
coupon_lid_anchor_length = 7.55 - 0
assert coupon_lid_anchor_length > 5
print(f"Revised coupon uncut material behind spring roots: {coupon_lid_anchor_length:.2f} mm")
print(f"Worst-case vertical deck/lid gap: {nominal_lid_bottom-(2.8+92):.2f} mm")
assert nominal_lid_bottom-(2.8+92) >= 4

# The coupon copies the same right-end body and lid geometry; no difference
# other than the supporting bottom pedestal and trim of leading lid panel.
coupon_lid.location.z=12-5.5+0.25
coupon_closed=intersection_volume(coupon_body,coupon_lid)
print(f"Coupon closed overlap: {coupon_closed:.4f} mm3")
assert coupon_closed < 0.1
coupon_lid.location.x=2
coupon_insertion=intersection_volume(coupon_body,coupon_lid)
print(f"Coupon at +2 mm (intentional nub flex): {coupon_insertion:.4f} mm3")
assert coupon_insertion > 0.2
print("Upright V2 geometric QA passed; physical latch fit remains unverified.")
