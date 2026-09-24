import bmesh
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def load(name):
    old=set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(ROOT/f'{name}.stl'))
    obj=next(o for o in bpy.data.objects if o not in old)
    obj.name=name
    return obj

def report(obj, expected_parts=1):
    bm=bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    nonmanifold=sum(not e.is_manifold for e in bm.edges)
    unseen=set(bm.verts); parts=0
    while unseen:
        parts+=1; todo=[unseen.pop()]
        while todo:
            v=todo.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen:
                    unseen.remove(other);todo.append(other)
    vol=bm.calc_volume(signed=True)
    print(f'{obj.name}: {parts} connected part(s), {nonmanifold} nonmanifold edges, {vol:.1f} mm3, bounds {[round(x,2) for x in obj.dimensions]} mm')
    assert parts==expected_parts and nonmanifold==0 and vol>0
    bm.free()

def overlap(first,second):
    probe=first.copy();probe.data=first.data.copy();bpy.context.collection.objects.link(probe)
    mod=probe.modifiers.new('Probe','BOOLEAN');mod.operation='INTERSECT';mod.solver='EXACT';mod.object=second
    bpy.context.view_layer.objects.active=probe
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(probe.data)
    v=abs(bm.calc_volume(signed=True)) if bm.faces else 0
    bm.free();bpy.data.objects.remove(probe,do_unlink=True)
    return v

body=load('body');lid=load('lid');gauge=load('fit_gauge')
report(body);report(lid);report(gauge, 3)
# 66 x 92 mm sleeves, 31 mm measured stack in the flat tray orientation.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,2.2+31/2))
stack=bpy.context.object;stack.name='Measured sleeved deck';stack.dimensions=(66,92,31)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
stack_overlap=overlap(body,stack)
print(f'Body/31-mm deck overlap: {stack_overlap:.4f} mm3');assert stack_overlap<0.05
lid.location.z=40.2-5+0.25
for offset in [0,10,30,50,100]:
    lid.location.y=offset
    vol=overlap(body,lid)
    print(f'Body/lid overlap at insertion offset Y={offset}: {vol:.4f} mm3')
    assert vol<0.05
lid.location.y=0
vol=overlap(lid,stack)
print(f'Lid/31-mm deck overlap: {vol:.4f} mm3');assert vol<0.05
print('Geometry validation passed. Physical slip fit and durability remain untested.')
