var BaseMixins = require('kami-base-batch/mixins');
var Class = require('klasse');
var Vector2 = require('vecmath/lib/Vector2');
var Vector3 = require('vecmath/lib/Vector3');

var ShaderProgram = require('kami-shader');
var DynamicMesh = require('kami-dynamic-mesh');
var Mesh = require('kami-mesh-buffer');
var wrapContext = require('kami-util').wrapContext;

var Texture = require('kami-texture');

var fs = require('fs');
var DEFAULT_VERT_SHADER = fs.readFileSync(__dirname + '/line.vert', 'utf8');
var DEFAULT_FRAG_SHADER = fs.readFileSync(__dirname + '/line.frag', 'utf8');



var tmp = new Vector2();
var tmp2 = new Vector2();
var tmp3 = new Vector2();

var p0 = new Vector2();
var p1 = new Vector2();
var p2 = new Vector2();

var tmpNormal = new Vector2();

var miter = new Vector2();

var SQRT_2 = Math.sqrt(2);



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
}

SegmentInfo.prototype.copy = function(line) {
    this.start.copy(line.start);
    this.end.copy(line.end);
    this.hasPrevious = line.hasPrevious;
    this.corners[0].copy(line.corners[0]);
    this.corners[1].copy(line.corners[1]);
    this.corners[2].copy(line.corners[2]);
    this.corners[3].copy(line.corners[3]);
}

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

//Joins the last segment with a new end point
//This assumes that the end of the last segment is equal to the start
//of our new segment
function joinSegments(segment, lastSegment, thickness, normal, miterLimit) {
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

    if (dotProd < -miterLimit)
        return;

    //compute tangent between the two lines    
    tmp.add(tmp2).normalize();

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

    c0[2].copy( p1 ).sub(miter);
    c0[3].copy( p1 ).add(miter);
    c1[0].copy( p1 ).add(miter);
    c1[1].copy( p1 ).sub(miter);
}

var LineRenderer = new Class({

    Mixins: BaseMixins,

    initialize: function LineRenderer(context, options) {
        if (!(this instanceof LineRenderer))
            return new LineRenderer(context, options);
        this.context = wrapContext(context);
        options = options||{};

        this.texture = new Texture(context, {
            src: 'gauss.png'
        });
        this.texture.setFilter(Texture.Filter.LINEAR);

        var size = options.size||500;

        //the total number of floats in our batch
        //Not all line segments will have 4 verts but this is a good guess
        var numVerts = size * 4 * this.getVertexSize();
        
        //vertex data
        this.vertices = new Float32Array(numVerts);
        this.thickness = 1;

        this.lastSegment = new SegmentInfo();
        this.currentSegment = new SegmentInfo();
        this.continuous = false;
        this.placedFirstPoint = false;
        this.hasSegment = false;
        this.lastMoveTo = new Vector2();

        this.miterLimit = 0.9;

        this.smoothingFactor = new Vector2(1, 0.9);
        
        /** The 'pen' is the position at which the line is currently
         being drawn. */
        this.pen = new Vector2();

        var shader = this._createShader(context);
        BaseMixins.call(this, this.context.gl, shader);

        this.dynamicMesh = new DynamicMesh(context, {
            vertexCount: numVerts,
            numTexCoords: 1,
            hasNormals: false,
            hasColors: true,
            positionComponents: 4,
            shader: shader
        });
        this.mesh = this.dynamicMesh.mesh;
    },

    /**
     * Creates a default shader for this batch.
     *
     * @method  _createShader
     * @protected
     * @return {ShaderProgram} a new instance of ShaderProgram
     */
    _createShader: function(context) {
        var shader = new ShaderProgram(context,
                LineRenderer.DEFAULT_VERT_SHADER, 
                LineRenderer.DEFAULT_FRAG_SHADER);
        if (shader.log)
            console.warn("Shader Log:\n" + shader.log);
        return shader;
    },

    /**
     * Used internally to return the Position, Color, and TexCoord0 attributes.
     *
     * @method  _createVertexAttribuets
     * @protected
     * @return {[type]} [description]
     */
    _createVertexAttributes: function() {
        var gl = this.context.gl;

        return [ 
            new Mesh.Attrib(ShaderProgram.POSITION_ATTRIBUTE, 2),
            new Mesh.Attrib(ShaderProgram.COLOR_ATTRIBUTE, 4, null, gl.UNSIGNED_BYTE, true, 1),
            new Mesh.Attrib(ShaderProgram.TEXCOORD_ATTRIBUTE+"0", 2)
        ];
    },

    /**
     * The number of floats per vertex for this batcher 
     * (Position.xy + Color + TexCoord0.xy).
     *
     * @method  getVertexSize
     * @return {Number} the number of floats per vertex
     */
    getVertexSize: function() {
        return LineRenderer.VERTEX_SIZE;
    },

    _vertex: function() {

    },

    //draws a segment with smoothing
    _drawSegment: function(line, hardLeft, hardRight) {
        var thickness = this.thickness,
            halfThick = thickness/2,
            drawThickness = thickness;

        var start = line.start,
            end = line.end;
        var axisAligned = (start.x===end.x || start.y===end.y);

        if (thickness<=1.5) 
            axisAligned = true;
        
        if (!axisAligned) 
            drawThickness = Math.ceil(thickness + SQRT_2 + 0.5);

        var e0 = -1;
        var e1 = -1; 

        //disable edge anti-aliasing
        if (!axisAligned) {
            //the x distance (squared) from start to end point
            //multiplied by our smoothing factor
            e0 = start.distSq(end) * this.smoothingFactor.x;

            //the y distance from end-to-end of line thickness
            e1 = halfThick * this.smoothingFactor.y;
        }

        var m = this.dynamicMesh,
            color = this.color;
        var c = line.corners;  
        hardLeft = !!hardLeft;
        hardRight = !!hardRight;

        m.colorPacked(color);
        m.texCoord(0, 0);
        m.vertex(c[0].x, c[0].y, hardLeft ? -1 : e0, e1);
        m.colorPacked(color);
        m.texCoord(0, 1);
        m.vertex(c[1].x, c[1].y, hardLeft ? -1 : e0, e1);
        m.colorPacked(color);
        m.texCoord(1, 1);
        m.vertex(c[2].x, c[2].y, hardRight ? -1 : e0, e1);

        m.colorPacked(color);
        m.texCoord(1, 1);
        m.vertex(c[2].x, c[2].y, hardRight ? -1 : e0, e1);
        m.colorPacked(color);
        m.texCoord(1, 0);
        m.vertex(c[3].x, c[3].y, hardRight ? -1 : e0, e1);
        m.colorPacked(color);
        m.texCoord(0, 0);
        m.vertex(c[0].x, c[0].y, hardLeft ? -1 : e0, e1);
    },  

    _drawLastSegment: function() {
        if (this.hasSegment) {
            this._drawSegment(this.currentSegment, this.currentSegment.hasPrevious, false);
            this.hasSegment = false;
        }
    },

    _disconnectedSegment: function(start, end) {
        getNormal(start, end, tmpNormal);
        getSegment(start, end, this.thickness, tmpNormal, this.currentSegment);

        //since we are disconnected, both edges should be soft
        this.currentSegment.hasPrevious = false;
        this.lastSegment.copy(this.currentSegment);
    },

    _joinSegment: function(nextPoint) {
        var thickness = this.thickness,
            halfThick = thickness/2,
            drawThickness = thickness;

        var mid = this.lastSegment.end;

        
        
        //first get a regular segment for the new line
        getNormal(mid, nextPoint, tmpNormal);
        getSegment(mid, nextPoint, this.thickness, tmpNormal, this.currentSegment);

        //now join the new segment with the last
        joinSegments(this.currentSegment, this.lastSegment, thickness, tmpNormal, this.miterLimit);

        //draw the last segment with a hard edge for miter
        this._drawSegment(this.lastSegment, this.lastSegment.hasPrevious, true);

        // swap segments
        // var t = this.lastSegment;
        // this.lastSegment = this.currentSegment;
        // this.currentSegment = t;

        //prepare the segments for the next command
        this.currentSegment.hasPrevious = true;
        this.lastSegment.copy(this.currentSegment)
    },

    moveTo: function( x, y ) {
        var oldX = this.pen.x,
            oldY = this.pen.y;

        this.pen.set( x, y );

        //if new position is different, we are
        //drawing a discontinuous line
        if (this.pen.x !== this.lastMoveTo.x || this.pen.y !== this.lastMoveTo.y) {
            this.continuous = false;
            this._drawLastSegment();
        }
        this.placedFirstPoint = true;
        this.lastMoveTo.copy(this.pen);
    },

    lineTo: function( x, y ) {
        //if the user is issuing lineTo as the first
        //command, then assume it is a moveTo
        if (!this.placedFirstPoint) {
            this.placedFirstPoint = true;
            this.moveTo(x, y);
        }
        //If we are continuing from another lineTo command,
        //we will want to join this new point with the last
        else if (this.continuous) {
            tmp3.set(x, y);


            //join the new segment with the last one
            this._joinSegment( tmp3 );
            //move pen to end of line
            this.pen.copy(tmp3);
               
            //make sure to draw the segment at end()
            this.hasSegment = true;
        } 
        //otherwise, we can draw a simple straight segment
        else {
            console.log("disconnected");

            tmp3.set(x, y);
            //place a new disconnected segment
            this._disconnectedSegment( this.pen, tmp3 );
            //move the pen to end of line
            this.pen.copy(tmp3);

            //make sure to draw the segment at end()
            this.hasSegment = true;
        }

        //and we assume the next move will be continuous
        this.continuous = true;
    }, 

    setProjectionMatrix: function(proj) {
        this.dynamicMesh.projModelView = proj;
    },

    
    /** 
     * Begins the sprite batch. This will bind the shader
     * and mesh. Subclasses may want to disable depth or 
     * set up blending.
     *
     * @method  begin
     */
    begin: function()  {
        if (this.drawing) 
            throw "batch.end() must be called before begin";
        this.drawing = true;
        var gl = this.context.gl;
        gl.disable(gl.DEPTH_TEST);
        this.dynamicMesh.begin();

        this.texture.bind();

        this.continuous = false;
        this.placedFirstPoint = false;
        this.currentSegment.hasPrevious = false;
        this.lastSegment.hasPrevious = false;

        if (this._blendingEnabled) {
            gl.enable(gl.BLEND);
            //todo: fix
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            //
        }
    },

    /** 
     * Ends the sprite batch. This will flush any remaining 
     * data and set GL state back to normal.
     * 
     * @method  end
     */
    end: function()  {
        if (!this.drawing)
            throw "batch.begin() must be called before end";

        this._drawLastSegment();

        if (this.idx > 0)
            this.flush();
        var gl = this.context.gl;
        this.drawing = false;

        this.dynamicMesh.end();

        if (this._blendingEnabled) {
            gl.disable(gl.BLEND);
        }
        gl.enable(gl.DEPTH_TEST);
    },
});

LineRenderer.DEFAULT_FRAG_SHADER = DEFAULT_FRAG_SHADER;
LineRenderer.DEFAULT_VERT_SHADER = DEFAULT_VERT_SHADER;
LineRenderer.VERTEX_SIZE = 2 + 2 + 1;

module.exports = LineRenderer;