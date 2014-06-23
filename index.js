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

var getNormal = require('./util').getNormal;
var SegmentInfo = require('./util').SegmentInfo;
var getSegment = require('./util').getSegment;
var joinSegments = require('./util').joinSegments;

var tmp = new Vector2();
var tmp2 = new Vector2();
var tmp3 = new Vector2();

var p0 = new Vector2();
var p1 = new Vector2();
var p2 = new Vector2();

var tmpNormal = new Vector2();

var miter = new Vector2();

var SQRT_2 = Math.sqrt(2);


var NONE = 0;
var ROUND = 1;
var MITER = 2;
var BEVEL = 3;


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
        this.roundSegments = 5;

        this.joinType = MITER;
        this.miterLimit = 0.75;

        this.smoothingFactor = new Vector2(1, 1);
        
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

    thickness: {
        set: function(val) {
            this._thickness = val||0;
            this._drawThickness = Math.ceil((this._thickness) + 0);
        },
        get: function() {
            return this._thickness;
        }
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

    _drawSegmentJoin: function(line) {
        if (line.joinType === NONE || line.joinType === MITER)
            return;

        var color = this.color;
        var flip = line.dot > 0;
        var u1 = flip ? 1 : 0;
        var u2 = flip ? 0 : 1;

        var c = line.joinVertices;
        var thickness = this._drawThickness;

        var axisAligned = false;
        
        //NOTE: round edge is going to break if the previous
        //line is axis-aligned and the next isn't !
        var thickness = line.joinType === ROUND 
                    ? this._drawThickness
                    : this._getComputedThickness(c[1], c[2]);

        var halfThick = thickness/2;

        var e0 = -1,
            e1 = -1;

        //disable edge anti-aliasing
        if (!axisAligned || !LineRenderer.AXIS_SNAP) {
            //the y distance from end-to-end of line thickness
            e1 = halfThick * this.smoothingFactor.y;
        }

        if (line.joinType === BEVEL) {
            this._joinVert(c[0], c[1], c[2], color, e0, e1, u1, u2);
        } else if (line.joinType === ROUND) {
            var points = arcJoin( line.end, c[1], c[2], halfThick );

            var last = c[0];
            var shared = c[0];
            for (var j=0; j<points.length; j++) {
                var pt = points[j];

                this._joinVert(shared, last, pt, color, e0, e1, u1, u2);
                last = pt;
            }
        }   
    },

    _joinVert: function(a, b, c, color, e0, e1, u1, u2) {
        var m = this.dynamicMesh;
            
        m.colorPacked(color);
        m.texCoord(u1, u1);
        m.vertex(a.x, a.y, e0, e1);
        m.colorPacked(color);
        m.texCoord(u2, u2);
        m.vertex(b.x, b.y, e0, e1);
        m.colorPacked(color);
        m.texCoord(u2, u2);
        m.vertex(c.x, c.y, e0, e1);
    },

    _vert: function(m, x, y, e0, e1) {
        if (this._thickness <= 1.5 && LineRenderer.PIXEL_SNAP)
            m.vertex( Math.round(x/0.5)*0.5, Math.round(y/0.5)*0.5, e0, e1 );
        else 
            m.vertex(x, y, e0, e1);
    },

    _quad: function(c, color, e0Left, e0Right, e1) {
        var m = this.dynamicMesh;

        m.colorPacked(color);
        m.texCoord(0, 0);
        this._vert(m, c[0].x, c[0].y, e0Left, e1);
        m.colorPacked(color);
        m.texCoord(0, 1);
        this._vert(m, c[1].x, c[1].y, e0Left, e1);
        m.colorPacked(color);
        m.texCoord(1, 1);
        this._vert(m, c[2].x, c[2].y, e0Right, e1);

        m.colorPacked(color);
        m.texCoord(1, 1);
        this._vert(m, c[2].x, c[2].y, e0Right, e1);
        m.colorPacked(color);
        m.texCoord(1, 0);
        this._vert(m, c[3].x, c[3].y, e0Right, e1);
        m.colorPacked(color);
        m.texCoord(0, 0);
        this._vert(m, c[0].x, c[0].y, e0Left, e1);
    },

    //draws a segment with smoothing
    _drawSegment: function(line, hardLeft, hardRight, useJoin) {
        //draw the join vertices with the last segment
        if (useJoin) {
            this._drawSegmentJoin(this.lastSegment);
        }

        var start = line.start,
            end = line.end,
            thickness = this._getComputedThickness(start, end),
            halfThick = thickness/2;

        var e0 = Number.MIN_VALUE;
        var e1 = Number.MIN_VALUE;

        var axisAligned = start.x===end.x||start.y===end.y;

        //disable edge anti-aliasing
        if (!axisAligned || !LineRenderer.AXIS_SNAP) {
            //the x distance (squared) from start to end point
            //multiplied by our smoothing factor
            e0 = start.distSq(end) * this.smoothingFactor.x;

            //the y distance from end-to-end of line thickness
            e1 = halfThick * this.smoothingFactor.y;
        }

        var color = this.color;
        var c = line.corners;  
        hardLeft = !!hardLeft;
        hardRight = !!hardRight;

        this._quad(c, color, hardLeft ? -1 : e0, hardRight ? -1 : e0, e1);
    },  

    _drawLastSegment: function() {
        if (this.hasSegment) {            
            this._drawSegment(this.currentSegment, this.currentSegment.hasPrevious, false, false);
            this.hasSegment = false;
        }
    },

    _getComputedThickness: function(start, end) {
        var axisAligned = (start.x===end.x || start.y===end.y);
        if (axisAligned && LineRenderer.AXIS_SNAP)
            return this._thickness;
        return this._drawThickness;
    },

    _disconnectedSegment: function(start, end) {
        var thickness = this._getComputedThickness(start, end);

        getNormal(start, end, tmpNormal);
        getSegment(start, end, thickness, tmpNormal, this.currentSegment);

        //since we are disconnected, both edges should be soft
        this.currentSegment.hasPrevious = false;
        this.lastSegment.copy(this.currentSegment);
    },

    _joinSegment: function(nextPoint) {
        var mid = this.lastSegment.end;

        var thickness = this._getComputedThickness(this.lastSegment.start, this.lastSegment.end),
            halfThick = thickness/2,
            drawThickness = thickness;

        //first get a regular segment for the new line
        getNormal(mid, nextPoint, tmpNormal);
        getSegment(mid, nextPoint, thickness, tmpNormal, this.currentSegment);

        //now join the new segment with the last
        joinSegments(this.currentSegment, this.lastSegment, thickness, tmpNormal, this.joinType, this.miterLimit);
        this.currentSegment.hasPrevious = true;

        //draw the last segment with a hard edge for miter
        this._drawSegment(this.lastSegment, this.lastSegment.hasPrevious, true, true);

        //prepare the segments for the next command
        this.lastSegment.copy(this.currentSegment);        
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
            //we are continuing.. so we have a previous segment
            this.currentSegment.hasPrevious = true;
            
            // this.lastSegment.hasPrevious = true;

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

        this.dynamicMesh.shader.setUniformf("thickness", this.thickness);

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

LineRenderer.AXIS_SNAP = true;
LineRenderer.PIXEL_SNAP = true;
LineRenderer.DEFAULT_FRAG_SHADER = DEFAULT_FRAG_SHADER;
LineRenderer.DEFAULT_VERT_SHADER = DEFAULT_VERT_SHADER;
LineRenderer.VERTEX_SIZE = 2 + 2 + 1;
LineRenderer.NONE = NONE;
LineRenderer.MITER = MITER;
LineRenderer.BEVEL = BEVEL;
//LineRenderer.ROUND = ROUND;

module.exports = LineRenderer;