var BaseMixins = require('kami-base-batch/mixins');
var Class = require('klasse');
var Vector2 = require('vecmath/lib/Vector2');
var Vector3 = require('vecmath/lib/Vector3');

var ShaderProgram = require('kami-shader');
var DynamicMesh = require('kami-dynamic-mesh');
var Mesh = require('kami-mesh-buffer');
var wrapContext = require('kami-util').wrapContext;

var fs = require('fs');
var DEFAULT_VERT_SHADER = fs.readFileSync(__dirname + '/line.vert', 'utf8');
var DEFAULT_FRAG_SHADER = fs.readFileSync(__dirname + '/line.frag', 'utf8');



var tmp = new Vector2();
var tmp2 = new Vector2();

var perp = new Vector2();

var leftA = new Vector2();
var leftB = new Vector2();
var rightA = new Vector2();
var rightB = new Vector2();

function SegmentInfo() {
    //the corners
    this.corners = [
        new Vector2(),
        new Vector2(),
        new Vector2(),
        new Vector2()
    ];

    //edge coefficients
    this.edges = [
        new Vector3(),
        new Vector3()
    ];
}

//Determine the normal of line AB
function normal(start, end, out) {
    if (!out)
        out = new Vector2();

    tmp.copy( start );
    tmp2.copy( end );

    tmp2.sub(tmp).normalize();

    out.x = -tmp2.y;
    out.y = tmp2.x;
    return out;
}

function segment(start, end, thickness, normal, out) {
    if (!out)
        out = new SegmentInfo();

    var r = thickness/2;

    //save the length...
    var nlen = tmp.copy(normal).length();
    
    //scaled normal for line width
    tmp.scale(r);

    //determine corner points
    var c = out.corners;
    c[0].copy( start ).add(tmp);
    c[1].copy( start ).sub(tmp);
    c[2].copy( end ).sub(tmp);
    c[3].copy( end ).add(tmp);

    //determine scale
    var s = 1 / (2*r + nlen);

    var p0x = c[0].x,
        p0y = c[0].y,
        p1x = c[1].x,
        p1y = c[1].y,
        p2x = c[2].x,
        p2y = c[2].y;

    //compute linear coefficients for edge functions
    var e = out.edges;
    e[0].x = p0y - p3y;
    e[0].y = p3x - p0x;
    e[0].z = p0x*p3y - p0y*p3x;

    e[1].x = p2y - p1y;
    e[1].y = p1x - p2x;
    e[1].z = p2x*p1y - p2y*p1x;

    //scale them by distance
    e[0].scale(s);
    e[1].scale(s);

    return out;
}


var LineRenderer = new Class({

    Mixins: BaseMixins,

    initialize: function LineRenderer(context, options) {
        if (!(this instanceof LineRenderer))
            return new LineRenderer(context, options);
        this.context = wrapContext(context);
        options = options||{};


        var size = options.size||500;

        //the total number of floats in our batch
        //Not all line segments will have 4 verts but this is a good guess
        var numVerts = size * 4 * this.getVertexSize();
        
        //vertex data
        this.vertices = new Float32Array(numVerts);
        this.thickness = 1;

        this.smoothingFactor = new Vector2(1, 0.8);
        
        /** The 'pen' is the position at which the line is currently
         being drawn. */
        this.pen = new Vector2();

        var shader = this._createShader();
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
    _createShader: function() {
        var shader = new ShaderProgram(this.context,
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



    /**
     * Draws a single segment, not intended to be
     * connected with any other segments, and with no end
     * caps. This is useful for, say, a hard-edge rectangle stroke,
     * and is used internally to create straight lines.
     *
     * You can force the left or right edges to be "hard" (no anti-aliasing),
     * as they are smoothed by default. However, if the line is straight on 
     * either axis (equal end/start components), 
     * no smoothing will be applied to any edge.
     * 
     * @param  {[type]} x1 [description]
     * @param  {[type]} y1 [description]
     * @param  {[type]} x2 [description]
     * @param  {[type]} y2 [description]
     * @return {[type]}    [description]
     */
    segment: function( start, end, hardLeftEdge, hardRightEdge ) {
        var m = this.dynamicMesh,
            c = this.color;
        var disableSmooth = this.thickness<1 || start.x===end.x || start.y===end.y;
        var halfThick = this.thickness/2;

        //if we aren't axis aligned, we need to push the triangles out
        //so that when we smooth we aren't losing any width
        if (!disableSmooth)  {
            halfThick += (1 * this.smoothingFactor.y);
        }
        halfThick = Math.ceil(halfThick);

            //halfThick = (this.thickness/2 + (1.0/halfThick * this.smoothingFactor.y));
        
        var xdist = start.distSq(end) * this.smoothingFactor.x;

        //determine direction, normalized 
        tmp.copy(end).sub(start).normalize();

        //determine perpendicular and scale it to half width
        perp.set( -tmp.y, tmp.x );
        perp.scale( halfThick );

        //get edge points
        leftB.copy(start).add(perp); //bottom left
        leftA.copy(start).sub(perp); //top left

        rightB.copy(end).add(perp); //bottom right
        rightA.copy(end).sub(perp); //top right

        halfThick *= this.smoothingFactor.y;
        //if we are axis-aligned... make sure it's straight
        if (disableSmooth) {
            halfThick *= -1; 
            hardLeftEdge = true;
            hardRightEdge = true;
        } 

        if (this.thickness < 10) {
            hardLeftEdge = true;
            hardRightEdge = true;
        }

        //Using a negative sign disables the anti-aliasing for that edge
        var leftx = hardLeftEdge ? -xdist : xdist;
        var rightx = hardRightEdge ? -xdist : xdist;

        //make triangle in clockwise, starting from bototm left
        m.colorPacked(c);
        m.texCoord(0, 0);
        m.vertex(leftB.x, leftB.y, leftx, halfThick);
        m.colorPacked(c);
        m.texCoord(0, 1);
        m.vertex(leftA.x, leftA.y, leftx, halfThick);
        m.colorPacked(c);
        m.texCoord(1, 1);
        m.vertex(rightA.x, rightA.y, rightx, halfThick);

        m.colorPacked(c);
        m.texCoord(1, 1);
        m.vertex(rightA.x, rightA.y, rightx, halfThick);
        m.colorPacked(c);
        m.texCoord(1, 0);
        m.vertex(rightB.x, rightB.y, rightx, halfThick);
        m.colorPacked(c);
        m.texCoord(0, 0);
        m.vertex(leftB.x, leftB.y, leftx, halfThick);
    },

    moveTo: function( x, y ) {
        this.pen.set( x, y );
    },

    lineTo: function( x, y ) {

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