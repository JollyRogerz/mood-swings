// Flat-format Mood Swings-inspired print prototype for one 45-card sleeved deck.
// Separate body and lid, exported base/flat face down on the build plate.
// Measured card stack cavity: 70 x 96 x 33 mm.
part = "body";
card_w = 70;
card_h = 96;
stack = 33;
wall = 2.4;
floor = 2.2;
W = card_w + 2*wall;
L = card_h + 2*wall;
channel = 1.05;
slide_clearance = 0.35;
lid_t = 2.25;
H = floor + stack + 5;
$fn = 32;

module side_mark(side, points, depth=0.58) {
  translate([side*(W/2-0.05),0,0]) rotate([0,side*90,0])
    linear_extrude(height=depth)
      polygon([for (p=points) [-side*p[1],p[0]]]);
}
module side_art() {
  for (side=[-1,1]) {
    // Broken, uneven ribbon pieces on the visible long sides.
    for (i=[0:3])
      let(y=-19+i*16, z=9+(i%2)*2)
        side_mark(side,[[y,z],[y+10,z+3],[y+11,z+5.5],[y-1,z+2.5]]);
    side_mark(side,[[-31,27],[-5,29],[-5,30.4],[-31,28.4]],0.52);
    side_mark(side,[[4,27.5],[27,26],[27,27.4],[4,28.9]],0.52);
    translate([side*(W/2-0.05),-37,20])
      rotate([0,side*90,0]) rotate([0,0,side*90])
        linear_extrude(height=0.64)
          text("45",size=7.5,font="DejaVu Sans:style=Bold",
               halign="center",valign="center");
  }
}

module body() {
  union() {
  difference() {
    translate([-W/2,-L/2,0]) cube([W,L,H]);
    translate([-card_w/2,-card_h/2,floor])
      cube([card_w,card_h,H+0.3]);
    // The enlarged slot leaves 2.25 mm roof rails and 0.25 mm vertical
    // clearance above/below a 2.25 mm lid. Each side supports 1.35 mm.
    translate([-card_w/2-channel,-card_h/2,H-5])
      cube([card_w+2*channel,card_h+wall+1,2.75]);
    // The end opening lets the lid slide in; the other end stays closed.
    translate([-card_w/2-channel,card_h/2-0.01,H-5])
      cube([card_w+2*channel,wall+1,5.3]);
    // Push the deck out with a fingertip after sliding the lid away.
    translate([0,0,-0.2]) cylinder(h=floor+0.4,d=15,$fn=48);
  }
  side_art();
  }
}

module lid_relief(points, depth=0.56) {
  translate([0,0,lid_t-0.05])
    linear_extrude(height=depth) polygon(points);
}
module lid_ink(depth=0.56) {
  translate([0,0,lid_t-0.05])
    linear_extrude(height=depth) children();
}
module lid_title(label, size, x, y, tilt=0) {
  translate([x,y,lid_t+0.60]) rotate([0,0,tilt])
    linear_extrude(height=0.75)
      text(label,size=size,font="DejaVu Sans:style=Bold",
           halign="center",valign="center");
}
module broken_arc(cx,cy,r1,r2,start,finish) {
  lid_relief(concat(
    [for (j=[0:7]) let(a=start+(finish-start)*j/7)
       [cx+r2*cos(a),cy+r2*sin(a)]],
    [for (j=[7:-1:0]) let(a=start+(finish-start)*j/7)
       [cx+r1*cos(a),cy+r1*sin(a)]]),0.60);
}
module lid_art() {
  // Raised, imperfect paper strips echo the game's hand-cut collage feeling.
  lid_relief([[-27,20],[24,22],[26,39],[-24,38]],0.38);
  lid_relief([[-26,21],[-7,21.4],[2,22.2],[23,22],[25,38],[-25,37]],0.78);
  lid_relief([[-24,-1],[28,0],[26,17],[-26,16]],0.38);
  lid_relief([[-23,0],[-3,-0.3],[8,0.7],[27,1],[25,16],[-25,15]],0.78);
  lid_title("MOOD",12,-1,30,2);
  lid_title("SWINGS",10.5,0,8,-2);

  // Five irregular mood-wheel segments orbit a generic five-pip die.
  for (i=[0:4]) broken_arc(0,-24,15.2,17.1,
                          9+i*72+(i%2)*3,60+i*72-(i%3)*2);
  lid_ink(0.70) translate([0,-24]) rotate(10)
    difference() {
      square([15.5,15.5],center=true);
      square([12.5,12.5],center=true);
    }
  lid_ink(0.70) translate([0,-24]) rotate(10)
    for (p=[[-4,-4],[-4,4],[0,0],[4,-4],[4,4]])
      translate(p) circle(d=2,$fn=16);

  // Faceted corner hatching and broken side rules.
  for (side=[-1,1]) {
    for (i=[0:3]) {
      lid_relief([[side*30,-41+i*4],
                  [side*32,-40+i*4],
                  [side*30,-36+i*4],
                  [side*28,-37+i*4]],0.56);
    }
    lid_relief([[side*30,19],[side*31,19],[side*31,39],[side*30,39]],0.52);
  }
  lid_relief([[-28,42],[-14,42.8],[-14,44],[-28,43.2]],0.56);
  lid_relief([[13,41.7],[29,42.4],[29,43.6],[13,42.9]],0.56);
}
module lid() {
  lid_w = card_w+2*channel-2*slide_clearance;
  lid_l = card_h+wall+0.4;
  union() {
    // Rail edges and underside stay smooth for the sliding fit.
    translate([-lid_w/2,-card_h/2+slide_clearance,0])
      cube([lid_w,lid_l,lid_t]);
    translate([-W/2,card_h/2+wall+0.1,0])
      cube([W,3,5]);
    lid_art();
    // Raised grip bars on the external stop for thumb access.
    for (x=[-12,-4,4,12])
      translate([x-1,card_h/2+wall+0.65,4.95])
        cube([2,1.5,0.55]);
  }
}
module fit_gauge() {
  // First coupon reproduces the actual mouth, rails, and open end. The
  // 20 mm insertion segment is enough to test the 0.35 mm side clearance.
  translate([-50,-35,-(H-10)])
    intersection() {
      body();
      translate([-W/2-1,31,H-10]) cube([W+2,23,10.1]);
    }
  // Mating front of the lid, including the external finger stop.
  translate([50,-35,0])
    intersection() {
      lid();
      translate([-W/2-1,31,-0.1]) cube([W+2,23,5.8]);
    }
  // A full-width 70 x 33 mm hole checks one 45-card stack edge-on.
  // The 92 mm card length extends out of this cheap, low ring.
  translate([0,65,0])
    difference() {
      translate([-W/2,-(stack+2*wall)/2,0])
        cube([W,stack+2*wall,6]);
      translate([-card_w/2,-stack/2,-0.2])
        cube([card_w,stack,6.4]);
    }
}
if (part=="body") body();
else if (part=="lid") lid();
else if (part=="fit_gauge") fit_gauge();
else assert(false,"part must be body, lid or fit_gauge");
