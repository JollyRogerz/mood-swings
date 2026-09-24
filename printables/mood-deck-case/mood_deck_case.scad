// Mood deck case — dimensions in millimetres.
// One upright stack of 45 sleeved cards; print the body base down.
// Set part to "body", "lid", or "fit_gauge" before exporting an STL.
part = "body";

card_width = 70;          // Sleeve width plus clearance, measured across card face.
card_height = 96;         // Sleeve height plus clearance.
stack_depth = 33;         // Owner measured 31 mm for 45 sleeved cards; +2 mm ease.
wall = 3;
floor_thickness = 2.8;
flute_depth = 2.0;
flute_count = 16;         // Faceted wings flank a flat title island.
corner = 2.5;
groove_depth = 1.35;
slide_clearance = 0.35;  // On each side; tune with fit_gauge.
groove_floor = 5.5;      // Top of the slide opening is 2.5 below the rim.
groove_roof = 2.5;
lid_thickness = 2.25;
lift_hole_diameter = 15;  // Push up the sleeved stack from beneath.
title_top = "MOOD";
title_bottom = "SWINGS";

outer_width = card_width + 2*wall;
outer_depth = stack_depth + 2*wall;
// The lid rides below the rim, so its channel height is *above* usable card
// height. This keeps the lid from touching the top of a sleeved deck.
outer_height = card_height + floor_thickness + groove_floor;
slot_width = stack_depth + 2*groove_depth;

assert(card_width>=67 && card_height>=93 && stack_depth>=25,
       "Check your actual sleeves and stack; these dimensions are unusually small.");
assert(wall>=groove_depth+1.2 && groove_floor>groove_roof+lid_thickness,
       "The slide channel needs wall stock and vertical clearance.");
assert(flute_count%2==0 && flute_count>=8, "Use an even flute count.");

function x_flute(i) = -outer_width/2 + corner
                       + i*(outer_width-2*corner)/flute_count;
function y_flute(i) = outer_depth/2 +
  (abs(x_flute(i)) < 22 ? flute_depth : ((i%2)==1 ? flute_depth : 0));

module outside_profile() {
  // Alternating facets frame a flat central face for zine-like raised labels.
  // Both facets and labels remain vertical when printed base down.
  polygon(concat(
    [[-outer_width/2, -outer_depth/2+corner],
     [-outer_width/2,  outer_depth/2-corner]],
    [for(i=[0:flute_count]) [x_flute(i), y_flute(i)]],
    [[ outer_width/2,  outer_depth/2-corner],
     [ outer_width/2, -outer_depth/2+corner]],
    [for(i=[flute_count:-1:0]) [x_flute(i), -y_flute(i)]]
  ));
}

module front_relief(points, depth=0.7) {
  // A relief starts 0.05 mm inside the front face for a sound mesh union.
  translate([0, -(outer_depth/2+flute_depth)+0.05, 0])
    rotate([90, 0, 0]) linear_extrude(height=depth) polygon(points);
}

module front_title(label, size, x, z, tilt=0) {
  translate([x, -(outer_depth/2+flute_depth)-0.60, z])
    rotate([90, 0, 0]) rotate([0, 0, tilt])
      linear_extrude(height=0.55)
        text(label, size=size, font="DejaVu Serif:style=Bold",
             halign="center", valign="center");
}

module front_graphics() {
  // Two skewed paper-strip silhouettes. These are original geometry, not a
  // copy of the game's logo or card frame.
  front_relief([[-20, 67], [19, 69], [18, 85], [-19, 83]]);
  front_relief([[-19, 47], [18, 45], [20, 63], [-18, 65]]);
  front_title(title_top, 10.2, -0.5, 76, 2);
  front_title(title_bottom, 7.6, 0, 55, -3);

  // Five crooked ribbons nod to the five-color detailing of the packaging.
  // The tri-color filament supplies the actual shifting color.
  for (i=[0:4])
    let(x=-17+i*8, z=13+((i*3)%5))
      front_relief([[x, z], [x+3.2, z+1],
                    [x+2.1, z+20], [x-1.1, z+19]], 0.6);
}

module body() {
  union() {
    difference() {
      linear_extrude(height=outer_height) outside_profile();

      // The cavity runs to the rim; the recessed lid sits above usable height.
      translate([-card_width/2, -stack_depth/2, floor_thickness])
        cube([card_width, stack_depth, outer_height-floor_thickness+0.3]);

      // A small opening lets a fingertip lift the sleeved stack from below.
      translate([0, 0, -0.2])
        cylinder(h=floor_thickness+0.4, d=lift_hole_diameter, $fn=48);

      // The slab slides in from the right, under 2.5 mm high rails.
      translate([-outer_width/2+wall, -slot_width/2,
                 outer_height-groove_floor])
        cube([outer_width-wall+0.4, slot_width,
              groove_floor-groove_roof]);

      // A 45-degree transition avoids a flat cantilever under each rail.
      hull() {
        translate([-outer_width/2+wall, -slot_width/2,
                   outer_height-groove_roof])
          cube([outer_width-wall+0.4, slot_width, 0.01]);
        translate([-outer_width/2+wall, -stack_depth/2,
                   outer_height-groove_roof+groove_depth])
          cube([outer_width-wall+0.4, stack_depth, 0.01]);
      }

      // The end entry leaves no bridge over the slot.
      translate([outer_width/2-wall-0.01, -slot_width/2,
                 outer_height-groove_floor])
        cube([wall+0.5, slot_width, groove_floor+0.4]);
    }
    front_graphics();
  }
}

module lid_paper(points) {
  translate([0, 0, lid_thickness-0.05])
    linear_extrude(height=0.55) polygon(points);
}

module lid_title(label, size, x, y, tilt=0) {
  translate([x, y, lid_thickness+0.45])
    rotate([0, 0, tilt]) linear_extrude(height=0.5)
      text(label, size=size, font="DejaVu Serif:style=Bold",
           halign="center", valign="center");
}

module lid() {
  // Flat printable slab; the only extra height is its broad end stop.
  // In the assembled case its underside is at Z = H - groove_floor + 0.25.
  left = -outer_width/2+wall+slide_clearance;
  right = outer_width/2+0.35;
  width = slot_width-2*slide_clearance;
  union() {
    translate([left, -width/2, 0])
      cube([right-left, width, lid_thickness]);
    translate([right, -outer_depth/2, 0])
      cube([3.3, outer_depth, 5.0]);

    // Loosely aligned paper strips and a generic die stamp evoke the game's
    // zine-like visual language without reusing the official logo or art.
    lid_paper([[-31, 3], [16, 4], [17, 15], [-29, 14]]);
    lid_paper([[-21, -15], [31, -14], [29, -3], [-22, -4]]);
    lid_title(title_top, 8.8, -7, 9, 2);
    lid_title(title_bottom, 7.0, 5, -9, -2);

    translate([27, 9, lid_thickness-0.05])
      rotate([0, 0, 10]) linear_extrude(height=0.7)
        difference() {
          square([10, 10], center=true);
          square([7, 7], center=true);
        }
    for (p=[[-2, -2], [0, 0], [2, 2]])
      translate([27+p[0], 9+p[1], lid_thickness-0.05])
        cylinder(h=0.7, d=1.5, $fn=20);

    for (i=[0:4])
      let(x=-31+i*2.5)
        translate([0, 0, lid_thickness-0.05])
          linear_extrude(height=0.5)
            polygon([[x, -14], [x+1.8, -14],
                     [x+3.3, -5], [x+1.5, -5]]);
  }
}

module fit_gauge() {
  // Three cheap coupons: a ring checks the stack cross-section, while a
  // 28 mm-long slice of the actual mouth checks the lid runner. Neither
  // coupon checks card height; the 96 mm nominal cavity has extra slack.
  gauge_length = 28;
  shift = -45-(outer_width/2-gauge_length/2);
  translate([shift, 0, -(outer_height-11)])
    intersection() {
      body();
      translate([outer_width/2-gauge_length,
                 -outer_depth/2-flute_depth-1,outer_height-11])
        cube([gauge_length+0.2, outer_depth+2*flute_depth+2, 11]);
    }
  translate([shift, outer_depth+19, 0])
    intersection() {
      lid();
      translate([outer_width/2-gauge_length,
                 -outer_depth/2-0.2,-0.1])
        cube([gauge_length+4, outer_depth+0.4, 5.3]);
    }
  translate([38, 0, 3])
    difference() {
      cube([card_width+2*wall, stack_depth+2*wall, 6], center=true);
      cube([card_width, stack_depth, 7], center=true);
    }
}

if(part=="body") body();
else if(part=="lid") lid();
else if(part=="fit_gauge") fit_gauge();
else assert(false, "part must be body, lid or fit_gauge");
