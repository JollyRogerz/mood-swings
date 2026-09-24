// Mood deck case V2: upright short-end deck box with a positively latched top slide.
// Dimensions in millimetres.
// One upright stack of 45 sleeved cards; print the body base down.
// Set part to body, lid, latch_gauge_body, latch_gauge_lid, or card_gauge.
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
lift_hole_diameter = 15;  // Helps lift the sleeved stack from beneath.
latch_slit_width = 0.9; // 0.4 mm nozzle: open print-in-plane relief slots.
latch_arm_y = 15.1;     // Each arm is ~2.4 mm wide and ~25 mm long.
latch_nub_depth = 0.42; // Shallow side engagement, release by pinching.
latch_pocket_depth = 0.72;
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

module front_ink(depth=0.6) {
  // Every mark overlaps the flat front face by 0.05 mm for a sound union.
  translate([0, -(outer_depth/2+flute_depth)+0.05, 0])
    rotate([90, 0, 0]) linear_extrude(height=depth) children();
}

module front_relief(points, depth=0.6) {
  front_ink(depth) polygon(points);
}

module front_title(label, size, x, z, tilt=0) {
  translate([x, -(outer_depth/2+flute_depth)-0.60, z])
    rotate([90, 0, 0]) rotate([0, 0, tilt])
      linear_extrude(height=0.55)
        text(label, size=size, font="DejaVu Sans:style=Bold",
             halign="center", valign="center");
}

module front_arc(cx, cz, inner, outer, start, finish) {
  // Small shared radius changes give each band a hand-cut, angular edge.
  front_relief(concat(
    [for (j=[0:8]) let(a=start+(finish-start)*j/8,
                       cut=(j%3==1 ? 0.5 : (j%3==2 ? -0.35 : 0)))
       [cx+(outer+cut)*cos(a), cz+(outer+cut)*sin(a)]],
    [for (j=[8:-1:0]) let(a=start+(finish-start)*j/8,
                           cut=(j%3==1 ? 0.5 : (j%3==2 ? -0.35 : 0)))
       [cx+(inner+cut)*cos(a), cz+(inner+cut)*sin(a)]]
  ), 0.65);
}

module front_graphics() {
  // Off-register paper shadows, then two skewed title strips.
  front_relief([[-21, 66], [18, 68], [20, 86], [-19, 84]], 0.35);
  front_relief([[-20,67],[-8,67.6],[-7,68.4],[6,68.6],[7,68.3],
                [19,69],[18,85],[6,84],[-8,83.5],[-9,83],[-19,83]], 0.75);
  front_relief([[-20, 46], [17, 44], [21, 62], [-17, 64]], 0.35);
  front_relief([[-19,47],[-5,46.4],[-4,47],[9,45.8],[18,45],
                [20,63],[7,63.6],[6,62.9],[-5,64.2],[-6,64.6],[-18,65]], 0.75);
  front_title(title_top, 10.2, -0.5, 76, 2);
  front_title(title_bottom, 7.6, 0, 55, -3);

  // Broken five-part wheel around a hand-tilted die. All strokes are at
  // least 1.5 mm wide so a 0.4 mm nozzle can actually resolve them.
  for (i=[0:4])
    front_arc(0, 26, 15.3, 17.1,
              8+i*72+(i%2)*3, 60+i*72-(i%3)*2);
  front_ink(0.70) translate([0, 26]) rotate(12)
    difference() {
      square([15.5, 15.5], center=true);
      square([12.5, 12.5], center=true);
    }
  front_ink(0.70) translate([0, 26]) rotate(12)
    for (p=[[-4,-4],[-4,4],[0,0],[4,-4],[4,4]])
      translate(p) circle(d=2.0, $fn=16);

  // Torn seams and misregistered hatch marks break up the quiet spaces.
  front_relief([[-19, 89], [-7, 90], [-7, 91.3], [-19, 90.2]], 0.55);
  front_relief([[7, 88], [19, 89.6], [19, 90.9], [7, 89.3]], 0.55);
  front_relief([[-20, 41], [-9, 42], [-10, 43.4], [-20, 42.4]], 0.55);
  front_relief([[10, 41.5], [20, 40.4], [20, 41.8], [10, 42.9]], 0.55);
  front_relief([[-20, 7], [-15, 7.5], [-15, 9], [-20, 8.5]], 0.55);
  front_relief([[15, 7.5], [20, 7], [20, 8.5], [15, 9]], 0.55);
}

module side_relief(side, points, depth=0.6) {
  // The plain end wall is at X=+/-outer_width/2. Points are (Y,Z).
  translate([side*(outer_width/2-0.05), 0, 0])
    rotate([0, side*90, 0]) linear_extrude(height=depth)
      polygon([for (p=points) [-side*p[1], p[0]]]);
}

module side_title(side) {
  translate([side*(outer_width/2-0.05), 0, 77.5])
    rotate([0, side*90, 0]) rotate([0, 0, side*90])
      linear_extrude(height=0.65)
        text("45", size=9, font="DejaVu Sans:style=Bold",
             halign="center", valign="center");
}

module side_graphics() {
  for (side=[-1,1]) {
    // An index sticker and five uneven diagonal ribbons wrap the composition
    // around both ends without touching the lid entry at the top.
    side_relief(side, [[-12,69],[11,71],[12,86],[-11,84]], 0.55);
    side_title(side);
    for (i=[0:4])
      let(left=-14+(i%2)*2, right=12-(i%3)*2, z=10+i*9)
        side_relief(side,
          [[left,z],[right,z+5],[right,z+7.5],[left,z+2.5]], 0.60);
  }
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

      // Rear thumb window reaches the upper cards without turning the box
      // over. Its round roof stays below the sliding runner and prints as an
      // arch; the decorated front and sleeve contact surfaces remain intact.
      translate([0,outer_depth/2+flute_depth+0.25,85])
        rotate([90,0,0]) cylinder(h=flute_depth+wall+0.5,r=12,$fn=64);

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

      // Closed-position detents for the in-plane lid arms. Each shallow
      // pocket is inside a reinforced rail; the lid has no friction-only fit.
      for (side=[-1,1])
        translate([28.7,
                   side>0 ? slot_width/2-0.01 : -slot_width/2-latch_pocket_depth,
                   outer_height-groove_floor+0.1])
          cube([4.2,latch_pocket_depth+0.02,
                groove_floor-groove_roof-0.2]);
    }
    front_graphics();
    side_graphics();
  }
}

module lid_paper(points) {
  translate([0, 0, lid_thickness-0.05])
    linear_extrude(height=0.55) polygon(points);
}

module lid_ink(depth=0.5) {
  translate([0, 0, lid_thickness-0.05])
    linear_extrude(height=depth) children();
}

module lid_stroke(a, b, width=1.2) {
  lid_ink() hull() {
    translate(a) circle(d=width, $fn=12);
    translate(b) circle(d=width, $fn=12);
  }
}

module lid_title(label, size, x, y, tilt=0) {
  translate([x, y, lid_thickness+0.45])
    rotate([0, 0, tilt]) linear_extrude(height=0.5)
      text(label, size=size, font="DejaVu Sans:style=Bold",
           halign="center", valign="center");
}

// A rounded, through-thickness slit forms a long spring arm in the XY plane.
// Printed flat, the arm bends within its layers, avoiding fragile Z-flex hooks.
module lid_arm_slits() {
  for (side=[-1,1])
    hull() {
      translate([8.0,side*14.65,-0.2])
        cylinder(h=5.8,d=latch_slit_width,$fn=24);
      translate([45.1,side*14.65,-0.2])
        cylinder(h=5.8,d=latch_slit_width,$fn=24);
    }
}

module lid_decor() {
  lid_paper([[-29,3],[7,4],[8,12],[-27,11]]);
  lid_paper([[-18,-11],[13,-10],[12,-3],[-19,-4]]);
  lid_title(title_top,8.7,-9,7.3,2);
  lid_title(title_bottom,6.8,-2,-7,-3);
  // A five-part broken mood wheel frames a die stamp on the right.
  for(i=[0:4])
    let(a=15+i*72)
      lid_stroke([23+6*cos(a),6*sin(a)],
                 [23+7*cos(a+38),7*sin(a+38)],1.2);
  lid_ink(0.65) translate([23,0]) rotate(11)
    difference() { square([9,9],center=true); square([6.5,6.5],center=true); }
  lid_ink(0.65) for (p=[[-2,-2],[0,0],[2,2]])
    translate([23+p[0],p[1]]) circle(d=1.4,$fn=16);
  lid_stroke([-29,12],[-22,12.4],1.15);
  lid_stroke([9,-11.2],[14,-10.7],1.15);
}

module lid() {
  // The cover enters from the right short side. Two flexible arms at the
  // thumb end snap sideways into the body pockets; pinch both tips toward
  // the middle to release while sliding the cover right.
  left = -outer_width/2+wall+slide_clearance;
  right = outer_width/2+0.1;
  width = slot_width-2*slide_clearance;
  union() {
    difference() {
      union() {
        translate([left,-width/2,0]) cube([right-left,width,lid_thickness]);
        for(side=[-1,1])
          translate([right,side>0 ? latch_arm_y : -width/2,0])
            cube([6.7,width/2-latch_arm_y,lid_thickness]);
        // Central thumb stop. It contacts the short end of the body and
        // cannot bridge the relief slots or stiffen the two spring arms.
        translate([right,-12.7,0]) cube([5.7,25.4,5.0]);
        lid_decor();
        // Sloped insertion face and square release face on each broad arm.
        for(side=[-1,1])
          translate([0,0,0])
            linear_extrude(height=lid_thickness)
              polygon([for(p=[[29.6,width/2-0.40],
                               [31.4,slot_width/2+latch_nub_depth],
                               [32.5,slot_width/2+latch_nub_depth],
                               [32.5,width/2-0.40]])
                         [p[0],side*p[1]]]);
      }
      lid_arm_slits();
    }
    // Wide, tactile pinch pads stay outside the wall when closed.
    for(side=[-1,1])
      translate([40.7,side>0 ? 15.35 : -17.25,lid_thickness-0.05])
        cube([3.3,1.9,0.65]);
  }
}

module latch_gauge_body() {
  // Actual mouth and catch segment, including both side pockets. The thin
  // pedestal joins the side rails so the coupon prints as one stable part.
  gauge_low = outer_height-12;
  translate([0,0,-gauge_low])
    intersection() {
      body();
      translate([7.5,-outer_depth/2-flute_depth-1,gauge_low])
        cube([outer_width/2-7.5+0.1,
              outer_depth+2*flute_depth+2,12.1]);
    }
  translate([7.5,-outer_depth/2-flute_depth,0])
    cube([outer_width/2-7.5,outer_depth+2*flute_depth,1.8]);
}
module latch_gauge_lid() {
  // Full-length spring roots, nubs and thumb tips. The omitted leading
  // cover panel is deliberately beyond the latch mechanics.
  intersection() {
    lid();
    translate([7.5,-outer_depth/2-1,-0.1])
      cube([39,outer_depth+2,5.8]);
  }
}
module card_gauge() {
  difference() {
    translate([-outer_width/2,-outer_depth/2,0])
      cube([outer_width,outer_depth,6]);
    translate([-card_width/2,-stack_depth/2,-0.1])
      cube([card_width,stack_depth,6.2]);
  }
}

if(part=="body") body();
else if(part=="lid") lid();
else if(part=="latch_gauge_body") latch_gauge_body();
else if(part=="latch_gauge_lid") latch_gauge_lid();
else if(part=="card_gauge") card_gauge();
else assert(false,"part must be body, lid, latch_gauge_body, latch_gauge_lid, or card_gauge");
