"""Build a portable, geometry-only 3MF with one body and one lid.

This deliberately omits printer, filament, support and G-code settings. Open
the file in a slicer and select the exact printer and silk PLA spool profile.
"""

from __future__ import annotations

import struct
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent
CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
CONTENT = "http://schemas.openxmlformats.org/package/2006/content-types"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
MODEL_REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"


def stl_mesh(path: Path):
    """Read triangle vertices from an OpenSCAD binary STL."""
    data = path.read_bytes()
    if len(data) < 84:
        raise ValueError(f"{path.name} is not a binary STL")
    triangles = struct.unpack_from("<I", data, 80)[0]
    if len(data) != 84 + 50 * triangles:
        raise ValueError(f"{path.name} has an unexpected STL length")

    vertices = []
    faces = []
    index = {}
    for triangle in range(triangles):
        offset = 84 + triangle * 50 + 12  # Skip the triangle normal.
        face = []
        for corner in range(3):
            point = struct.unpack_from("<fff", data, offset + corner * 12)
            if point not in index:
                index[point] = len(vertices)
                vertices.append(point)
            face.append(index[point])
        faces.append(face)
    return vertices, faces


def xml_bytes(root: ET.Element) -> bytes:
    ET.register_namespace("", root.tag.split("}")[0][1:])
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def zip_member(archive: ZipFile, name: str, contents: bytes):
    # Fixed timestamps make repeated exports byte-for-byte reproducible.
    info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    archive.writestr(info, contents, compresslevel=9)


model = ET.Element(f"{{{CORE}}}model", {"unit": "millimeter", "{http://www.w3.org/XML/1998/namespace}lang": "en-US"})
resources = ET.SubElement(model, f"{{{CORE}}}resources")
build = ET.SubElement(model, f"{{{CORE}}}build")

# Both STLs already have their print orientation: body base down, lid flat.
# Centers at (60, 110) and (150, 110) leave room for separate brims on a
# 220 × 220 mm build plate, with the whole arrangement inside its bounds.
placed_bounds = []
for object_id, name, stl_name, x, y in (
    (1, "Flat tray body", "body.stl", 60, 110),
    (2, "Sliding face lid - flat", "lid.stl", 150, 110),
):
    vertices, faces = stl_mesh(ROOT / stl_name)
    xs = [point[0] + x for point in vertices]
    ys = [point[1] + y for point in vertices]
    zs = [point[2] for point in vertices]
    if not (0 <= min(xs) < max(xs) <= 220 and
            0 <= min(ys) < max(ys) <= 220 and
            0 <= min(zs) < max(zs) <= 250):
        raise ValueError(f"{name} exceeds the K1C 2025 build volume")
    placed_bounds.append((name, min(xs), max(xs), min(ys), max(ys)))
    obj = ET.SubElement(resources, f"{{{CORE}}}object", {"id": str(object_id), "type": "model", "name": name})
    mesh = ET.SubElement(obj, f"{{{CORE}}}mesh")
    verts = ET.SubElement(mesh, f"{{{CORE}}}vertices")
    for px, py, pz in vertices:
        ET.SubElement(verts, f"{{{CORE}}}vertex", {
            "x": format(px, ".9g"), "y": format(py, ".9g"), "z": format(pz, ".9g")
        })
    triangles = ET.SubElement(mesh, f"{{{CORE}}}triangles")
    for v1, v2, v3 in faces:
        ET.SubElement(triangles, f"{{{CORE}}}triangle", {
            "v1": str(v1), "v2": str(v2), "v3": str(v3)
        })
    ET.SubElement(build, f"{{{CORE}}}item", {
        "objectid": str(object_id),
        "transform": f"1 0 0 0 1 0 0 0 1 {x} {y} 0",
    })

# Two 5 mm brims should not collide even if the decorative relief grows.
for i, a in enumerate(placed_bounds):
    for b in placed_bounds[i + 1:]:
        x_gap = max(a[1] - b[2], b[1] - a[2], 0)
        y_gap = max(a[3] - b[4], b[3] - a[4], 0)
        if x_gap < 10 and y_gap < 10:
            raise ValueError(f"{a[0]} and {b[0]} need more room for 5 mm brims")

types = ET.Element(f"{{{CONTENT}}}Types")
ET.SubElement(types, f"{{{CONTENT}}}Default", {
    "Extension": "rels",
    "ContentType": "application/vnd.openxmlformats-package.relationships+xml",
})
ET.SubElement(types, f"{{{CONTENT}}}Default", {
    "Extension": "model",
    "ContentType": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
})
relationships = ET.Element(f"{{{REL}}}Relationships")
ET.SubElement(relationships, f"{{{REL}}}Relationship", {
    "Id": "rel0", "Type": MODEL_REL, "Target": "/3D/3dmodel.model",
})

target = ROOT / "case_plate.3mf"
with ZipFile(target, "w") as archive:
    zip_member(archive, "[Content_Types].xml", xml_bytes(types))
    zip_member(archive, "_rels/.rels", xml_bytes(relationships))
    zip_member(archive, "3D/3dmodel.model", xml_bytes(model))

print(f"Wrote {target} with one body and one lid; select printer and silk PLA in your slicer.")
