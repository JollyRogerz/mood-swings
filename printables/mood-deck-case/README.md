# Faceted case for one Mood Swings deck

An original, printable case for **one stack of 45 sleeved cards**. Print two
identical cases for two decks. The front and back have alternating vertical
facets that catch different colours from tri-colour silk PLA as the case turns.
A separate sliding lid has a raised starburst and a generic **MOOD** label.
There is no copied card art or logo.

![Exploded preview of the single-deck case](preview.png)

## Files

| File | Purpose |
| --- | --- |
| `fit_gauge.stl` | Three small test pieces: a stack opening, a rail, and a short lid section. Print this first. |
| `body.stl` | The single-deck case with an opening underneath for pushing up the cards. |
| `lid.stl` | The flat-printed sliding cover. |
| `mood_deck_case.scad` | Editable dimensions; regenerate the STLs with OpenSCAD. |
| `mood_deck_case.blend` | Blender preview scene with lighting and a sample deck. Only the two meshes in **PRINT THESE TWO MESHES** are printable. |
| `render_blender.py` | Rebuilds the `.blend` and preview from the current STLs. |
| `validate_meshes.py` | Checks water-tightness, part count, lid collision and vertical card clearance in Blender. |

The preview colours illustrate the facet effect. Your actual colours depend on
the filament, the way it twists into the extruder, the toolpath, and the light.

## Fit before printing the full case

The user measured one Dragon Shield sleeved card at **66 × 92 mm**. The cavity
has **70 mm clear width × 96 mm usable card height × 32 mm stack depth** by
default. That leaves 2 mm on each face edge around the measured card. The
32 mm stack depth is a starting value, **not a verified measurement of 45
cards**. Dragon Shield specifies the cards its standard sleeves fit, but does
not publish an exterior dimension for every sleeve type; your measurement
therefore governs this print.

1. Put all 45 cards in their final sleeves and measure the complete stack's
   thickness without squeezing it. If it exceeds 30 mm, set `stack_depth` in
   `mood_deck_case.scad` to the measured thickness plus about 2 mm before
   exporting. Measure yours even if the cards have only one sleeve each.
2. Print `fit_gauge.stl` first. Check that the full stack passes through the
   rectangular ring without scuffing sleeves, and that the little lid piece
   slides into the little rail piece. The gauge is only 11 mm tall; it checks
   width, stack depth and rail tolerance, not full card height.
3. If the rail is tight, increase `slide_clearance` from 0.35 to 0.45 mm. If
   very loose, try 0.25 mm. Regenerate the gauge after either adjustment.
4. Print the full body and lid only after the gauge fits. Remove any elephant's
   foot or brim from the lid edge and rail entry before testing the full slide.

The default body measures **76 × 42 × 104.3 mm** including its facets. The
lid measures about **76.3 × 38 × 5 mm**. Both fit within a typical 180 mm
square build plate as separate prints. Verify your actual printer's printable
area, especially if adding a brim.

## Print orientation and starting settings

- Print the **body with its closed bottom on the bed and opening upward**.
  The long faces are continuous vertical toolpaths, exposing the alternating
  facet angles to the tri-colour filament. Put the seam on a short end rather
  than the chevron front.
- Print the **lid flat, with the starburst and label upward**. Print the
  gauge in its exported orientation. None of these three STLs needs supports
  in the intended orientation.
- Start with a 0.4 mm nozzle, 0.20 mm layers, four to five walls, and six to
  seven top/bottom layers. A 4–5 mm brim can help the tall body stay put.
  Use the temperature and cooling range supplied with your specific silk PLA.
- Slow the outer wall to around **35–40 mm/s** for gloss. Do one small gauge
  at the default rotation and another rotated about 30–45° on the plate to
  see which face shows your favourite colour split. Exact band placement is
  not guaranteed by bed rotation because the filament may twist.

The lid has a broad stop at its right end. Slide it in from the right until
the stop rests against the end of the case. Push the deck up through its 15 mm
opening underneath before lifting it out. The sliding cover
has no positive lock; use a band around the case for travel if your printed
fit slides freely.

## Changing the design

`mood_deck_case.scad` is set for one deck per case. Set `stack_depth` from the
measured stack, adjust `slide_clearance` based on the test gauge, and change
`lid_label` if desired. Re-export every STL after changing a dimension:

```sh
openscad -o body.stl -D 'part="body"' mood_deck_case.scad
openscad -o lid.stl -D 'part="lid"' mood_deck_case.scad
openscad -o fit_gauge.stl -D 'part="fit_gauge"' mood_deck_case.scad
blender --background --python validate_meshes.py
blender --background --python render_blender.py
```

The default STLs were generated with OpenSCAD 2021.01. Blender 5.2 found
**zero nonmanifold edges** in the body, lid and gauge, and **zero overlapping
volume** between the body and lid in their assembled position. The usable
height leaves over 4 mm above the measured 92 mm sleeve. A real-world print
and full-stack fit test are still required; STL validation cannot establish
your printer's dimensional accuracy or the stack thickness.

## Sources for the fit and print assumptions

- [Dragon Shield FAQ](https://www.dragonshield.com/pages/faqs) gives the
  standard card size its sleeves fit. We use the owner's direct **66 × 92 mm**
  sleeve measurement for this model.
- [Prusa's print-design guide](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135)
  recommends starting with at least 0.3 mm clearance for moving printed parts.
- [eSUN's tri-colour silk guidance](https://www.esun3d.com/esilk-pla-mystic-product)
  describes its angle-dependent colour effect. Its material data also shows
  weaker strength across layers, so the design uses a broad slide instead of
  a thin flexing clip.

This is a personal fan accessory for the physical decks, independent of the
original game creators and their trademarks.
