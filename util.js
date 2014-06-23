var Vector2 = require('vecmath/lib/Vector2');


var tmp = new Vector2();
var tmp2 = new Vector2();
var tmp3 = new Vector2();

var p0 = new Vector2();
var p1 = new Vector2();
var p2 = new Vector2();

var tmpNormal = new Vector2();
var miter = new Vector2();

var NONE = 0;
var ROUND = 1;
var MITER = 2;
var BEVEL = 3;

function SegmentInfo() {
    this.start = new Vector2();
    this.end = new Vector2();

    this.hasPrevious = false;

    //the corners
    this.corners = [
        new Vector2(),
        new Vector2(),
        new Vector2(),
        new Vector2()
    ];

    //The 'computed' join (i.e. after miter limit is applied)
    //If join is NONE or MITER, you don't need to draw any join
    this.joinType = 0;

    //The vertices that make up this join, in the following order:
    // 0 - the shared vertex
    // 1 - the tip of the last segment
    // 2 - the tip of the current segment
    this.joinVertices = [
        new Vector2(),
        new Vector2(),
        new Vector2()
    ];

    //The dot product with the last line, 
    //if > 0 we should flip the texture coords
    this.dot = 0;
}

SegmentInfo.prototype.copy = function(line) {
    this.start.copy(line.start);
    this.end.copy(line.end);
    this.hasPrevious = line.hasPrevious;

    this.dot = line.dot;

    this.corners[0].copy(line.corners[0]);
    this.corners[1].copy(line.corners[1]);
    this.corners[2].copy(line.corners[2]);
    this.corners[3].copy(line.corners[3]);

    this.joinType = line.joinType;
    this.joinVertices[0].copy(line.joinVertices[0]);
    this.joinVertices[1].copy(line.joinVertices[1]);
    this.joinVertices[2].copy(line.joinVertices[2]);
};

//Determine the normal of line AB
function getNormal(start, end, out) {
    if (!out)
        out = new Vector2();

    tmp.copy( start );
    tmp2.copy( end );

    tmp2.sub(tmp).normalize();

    out.x = -tmp2.y;
    out.y = tmp2.x;
    return out;
}

function getSegment(start, end, thickness, normal, out) {
    if (!out)
        out = new SegmentInfo();

    var r = thickness/2;

    //scaled normal for line distance
    tmp.copy(normal).scale(r);

    //determine corner points
    var c = out.corners;
    c[0].copy( start ).add(tmp);
    c[1].copy( start ).sub(tmp);
    c[2].copy( end ).sub(tmp);
    c[3].copy( end ).add(tmp);

    out.start.copy(start);
    out.end.copy(end);
    return out;
}



function arc(origin, r, step, angle1, angle2) {
    var points = [];
    var incremental = true;
    if (angle1 > angle2)
        incremental = false;
    if (incremental) {
        for (var a=angle1; a<angle2; a+=step) {
            var x = Math.cos(a)*r+origin.x,
                y = Math.sin(a)*r+origin.y;
            points.push( {x: x, y: y} );
        }
    } else {
        for (var a=angle1; a>angle2; a-=step) {
            var x = Math.cos(a)*r+origin.x,
                y = Math.sin(a)*r+origin.y;
            points.push( {x: x, y: y} );
        }
    }
    return points;
}

function arcJoin(origin, p0, p1, r) {
    tmp.copy(origin).sub(p0).normalize();
    tmp2.copy(origin).sub(p1).normalize();
    var a1 = Math.acos(tmp.x);
    var a2 = Math.acos(tmp2.x);

    if (tmp.y > 0) 
        a1 = 2*Math.PI-a1;
    if (tmp2.y > 0)
        a2 = 2*Math.PI-a2;

    // a1 = -Math.PI;
    // a2 = Math.PI;
    return arc(origin, r, Math.PI/18, a1, a2);
}



//Joins the last segment with a new end point
//This assumes that the end of the last segment is equal to the start
//of our new segment
function joinSegments(segment, lastSegment, thickness, normal, joinType, miterLimit) {
    p0.copy(lastSegment.start);
    p1.copy(lastSegment.end);
    p2.copy(segment.end);

    segment.start.copy(p1);
    segment.end.copy(p2);

    //get the normals of the lines
    tmp.copy( p2 ).sub( p1 ).normalize();
    tmp2.copy( p1 ).sub( p0 ).normalize();

    //get the angle between them
    var dotProd = tmp.dot(tmp2);

    //compute tangent between the two lines    
    tmp.add(tmp2).normalize();

    //If we're using bevel, we need to know 
    //the direction 
    var dir = tmp.dot( normal );
    //Straight line needs no join..
    if (dir === 0)
        return;

    //if we're using miter, fallback to bevel for sharp edges
    if (joinType === MITER && dotProd < -miterLimit)
        joinType = BEVEL;

    //the miter line is the perpendicular to the tangent
    miter.x = -tmp.y;
    miter.y = tmp.x;

    //scale the miter by thickness
    var miterLen = (thickness/2) / miter.dot( normal );
    miter.scale(miterLen);

    //now reconstruct the two segments based on join
    var c0 = lastSegment.corners;
    var c1 = segment.corners;

    //scaled normal for line distance
    tmp2.copy(normal).scale(thickness/2);

    if (joinType===MITER) {
        c0[2].copy( p1 ).sub(miter);
        c0[3].copy( p1 ).add(miter);
        c1[0].copy( p1 ).add(miter);
        c1[1].copy( p1 ).sub(miter);
    } else {
        if (dir > 0) {
            c0[2].copy( p1 ).sub(miter);
            c1[1].copy( p1 ).sub(miter);
        } else {
            c0[3].copy( p1 ).add(miter);
            c1[0].copy( p1 ).add(miter);
        }
    }
        
    lastSegment.joinType = joinType;
    segment.joinType = joinType;

    //determine the vertices that need to be joined
    //in the correct order
    //(for bevel & round joins)
    if (dir > 0) {
        segment.joinVertices[0].copy( c0[2] );
        segment.joinVertices[1].copy( c0[3] );
        segment.joinVertices[2].copy( c1[0] );
    } else {
        segment.joinVertices[0].copy( c0[3] );
        segment.joinVertices[1].copy( c0[2] );
        segment.joinVertices[2].copy( c1[1] );
    }

    segment.dot = dir;
    lastSegment.dot = dir;

    for (var i=0; i<lastSegment.joinVertices.length; i++)
        lastSegment.joinVertices[i].copy(segment.joinVertices[i]);
}

module.exports.joinSegments = joinSegments;
module.exports.getSegment = getSegment;
module.exports.getNormal = getNormal;
module.exports.SegmentInfo = SegmentInfo;