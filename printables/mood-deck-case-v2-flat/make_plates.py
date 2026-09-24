"""Build portable, geometry-only 3MF plates for the K1C 220 mm square bed.

No printer, filament, process, or G-code settings are embedded. Select the
actual K1C and silk PLA profiles in the slicer after importing a plate.
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
    data = path.read_bytes()
    if len(data) < 84:
        raise ValueError(f"{path.name} is not a binary STL")
    count = struct.unpack_from("<I", data, 80)[0]
    if len(data) != 84 + 50 * count:
        raise ValueError(f"{path.name} has an unexpected STL length")
    vertices = []
    faces = []
    index = {}
    for triangle in range(count):
        offset = 84 + triangle * 50 + 12
        face = []
        for corner in range(3):
            vertex = struct.unpack_from("<fff", data, offset + corner * 12)
            if vertex not in index:
                index[vertex] = len(vertices)
                vertices.append(vertex)
            face.append(index[vertex])
        faces.append(face)
    return vertices, faces


def xml_bytes(element: ET.Element):
    ET.register_namespace("", element.tag.split("}")[0][1:])
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)


def member(archive, name, contents):
    info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    archive.writestr(info, contents, compresslevel=9)


def build_plate(filename, placements):
    model = ET.Element(
        f"{{{CORE}}}model",
        {"unit": "millimeter", "{http://www.w3.org/XML/1998/namespace}lang": "en-US"},
    )
    resources = ET.SubElement(model, f"{{{CORE}}}resources")
    build = ET.SubElement(model, f"{{{CORE}}}build")
    bounds = []
    for object_id, name, stl_name, x, y in placements:
        vertices, faces = stl_mesh(ROOT / stl_name)
        xs = [point[0] + x for point in vertices]
        ys = [point[1] + y for point in vertices]
        zs = [point[2] for point in vertices]
        if not (
            0 <= min(xs) < max(xs) <= 220
            and 0 <= min(ys) < max(ys) <= 220
            # OpenSCAD's binary STL can round a nominal Z=0 to -0.0000002.
            and -0.001 <= min(zs) < max(zs) <= 250
        ):
            raise ValueError(f"{name} exceeds the K1C 2025 build volume")
        bounds.append((name, min(xs), max(xs), min(ys), max(ys)))
        obj = ET.SubElement(
            resources,
            f"{{{CORE}}}object",
            {"id": str(object_id), "type": "model", "name": name},
        )
        mesh = ET.SubElement(obj, f"{{{CORE}}}mesh")
        verts = ET.SubElement(mesh, f"{{{CORE}}}vertices")
        for px, py, pz in vertices:
            ET.SubElement(
                verts,
                f"{{{CORE}}}vertex",
                {"x": format(px, ".9g"), "y": format(py, ".9g"), "z": format(pz, ".9g")},
            )
        triangles = ET.SubElement(mesh, f"{{{CORE}}}triangles")
        for a, b, c in faces:
            ET.SubElement(
                triangles,
                f"{{{CORE}}}triangle",
                {"v1": str(a), "v2": str(b), "v3": str(c)},
            )
        ET.SubElement(
            build,
            f"{{{CORE}}}item",
            {"objectid": str(object_id), "transform": f"1 0 0 0 1 0 0 0 1 {x} {y} 0"},
        )

    # Each object can carry its own 5 mm brim without touching a neighbour.
    for i, first in enumerate(bounds):
        for second in bounds[i + 1 :]:
            x_gap = max(first[1] - second[2], second[1] - first[2], 0)
            y_gap = max(first[3] - second[4], second[3] - first[4], 0)
            if x_gap < 10 and y_gap < 10:
                raise ValueError(f"{first[0]} and {second[0]} need more brim room")

    types = ET.Element(f"{{{CONTENT}}}Types")
    ET.SubElement(
        types,
        f"{{{CONTENT}}}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ET.SubElement(
        types,
        f"{{{CONTENT}}}Default",
        {"Extension": "model", "ContentType": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"},
    )
    relationships = ET.Element(f"{{{REL}}}Relationships")
    ET.SubElement(
        relationships,
        f"{{{REL}}}Relationship",
        {"Id": "rel0", "Type": MODEL_REL, "Target": "/3D/3dmodel.model"},
    )
    target = ROOT / filename
    with ZipFile(target, "w") as archive:
        member(archive, "[Content_Types].xml", xml_bytes(types))
        member(archive, "_rels/.rels", xml_bytes(relationships))
        member(archive, "3D/3dmodel.model", xml_bytes(model))
    print(f"Wrote {target.name}: " + ", ".join(item[0] for item in bounds))


build_plate(
    "case_plate.3mf",
    ((1, "V2 flat tray body", "body.stl", 60, 110),
     (2, "V2 locking sliding lid", "lid.stl", 150, 110)),
)
build_plate(
    "fit_gauge_plate.3mf",
    ((1, "V2 latch and card-stack gauge", "fit_gauge.stl", 110, 110),),
)
