// Mood deck case — dimensions in millimetres.
// One upright stack of 45 sleeved cards; print the body base down.
// Set part to "body", "lid", or "fit_gauge" before exporting an STL.
part = "body";

card_width = 70;          // Sleeve width plus clearance, measured across card face.
card_height = 96;         // Sleeve height plus clearance.
stack_depth = 32;         // Provisional; set to measured 45-card thickness + 2 mm.
wall = 3;
floor_thickness = 2.8;
flute_depth = 2.0;
flute_count = 16;         // Even, repeated chevron facets on front and back.
corner = 2.5;
groove_depth = 1.35;
slide_clearance = 0.35;  // On each side; tune with fit_gauge.
groove_floor = 5.5;      // Top of the slide opening is 2.5 below the rim.
groove_roof = 2.5;
lid_thickness = 2.25;
lid_relief = 0.55;
lift_hole_diameter = 15;  // Push up the sleeved stack from beneath.
lid_label = "MOOD";      // Keep short enough to fit next to the star.

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
function y_flute(i) = outer_depth/2 + ((i%2)==1 ? flute_depth : 0);

module outside_profile() {
  // The straight, wide, vertical facets show different parts of tri-colour
  // co-extruded filament as the case is turned in the light. No supports.
  polygon(concat(
    [[-outer_width/2, -outer_depth/2+corner],
     [-outer_width/2,  outer_depth/2-corner]],
    [for(i=[0:flute_count]) [x_flute(i), y_flute(i)]],
    [[ outer_width/2,  outer_depth/2-corner],
     [ outer_width/2, -outer_depth/2+corner]],
    [for(i=[flute_count:-1:0]) [x_flute(i), -y_flute(i)]]
  ));
}

module body() {
  difference() {
    linear_extrude(height=outer_height) outside_profile();

    // The cavity runs to the rim; the recessed lid sits above usable height.
    translate([-card_width/2, -stack_depth/2, floor_thickness])
      cube([card_width, stack_depth, outer_height-floor_thickness+0.3]);

    // The card tops sit a few millimetres below the rim. A small opening
    // in each floor lets a fingertip lift the whole sleeved stack first.
    translate([0, 0, -0.2])
      cylinder(h=floor_thickness+0.4, d=lift_hole_diameter, $fn=48);

    // The slab slides in from the right, under 2.5 mm high rails.
    translate([-outer_width/2+wall, -slot_width/2,
               outer_height-groove_floor])
      cube([outer_width-wall+0.4, slot_width,
            groove_floor-groove_roof]);

    // A 45-degree transition above the channel makes the long rail's
    // underside grow inward gradually instead of creating a flat cantilever.
    hull() {
      translate([-outer_width/2+wall, -slot_width/2,
                 outer_height-groove_roof])
        cube([outer_width-wall+0.4, slot_width, 0.01]);
      translate([-outer_width/2+wall, -stack_depth/2,
                 outer_height-groove_roof+groove_depth])
        cube([outer_width-wall+0.4, stack_depth, 0.01]);
    }

    // A full-height entry through the right end wall leaves no bridge over
    // the slot. The lid's end stop covers this entry when fully inserted.
    translate([outer_width/2-wall-0.01, -slot_width/2,
               outer_height-groove_floor])
      cube([wall+0.5, slot_width, groove_floor+0.4]);
  }
}

module star_2d(r1=6.3, r2=2.9) {
  polygon([for(i=[0:15]) let(a=360*i/16+90,
                            r=i%2==0 ? r1 : r2)
           [r*cos(a),r*sin(a)]]);
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

    // An original raised starburst and a generic label, with no card art or
    // official logo. Print this identical lid for either deck.
    translate([-19, 0, lid_thickness])
      linear_extrude(height=lid_relief) star_2d();
    translate([6, 0, lid_thickness])
      linear_extrude(height=lid_relief)
        text(lid_label, size=9, font="DejaVu Sans:style=Bold",
             halign="center", valign="center");
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
