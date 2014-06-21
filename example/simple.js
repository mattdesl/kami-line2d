var size = 250;
var thickness = 4.0;

var gl = require('webgl-context')({ width: size, height: size });
var tex = require('kami-white-texture')(gl);
var lineBatch = require('../')(gl, {
    attributes: {
        antialias: false
    }
});

var Vector2 = require('vecmath').Vector2;
var OrthographicCamera = require('cam3d').OrthographicCamera;
var ortho = new OrthographicCamera();
ortho.setToOrtho(true, size, size);

requestAnimationFrame(render);



function render() {
    requestAnimationFrame(render);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    lineBatch.setColor(1,0,0,0.95);
    lineBatch.thickness = thickness;
    lineBatch.setProjectionMatrix(ortho.combined);
    lineBatch.begin();

    lineBatch.segment(new Vector2(50, 50), new Vector2(200, 50));
    lineBatch.segment(new Vector2(50, 50), new Vector2(10, 60));

    lineBatch.end();
}
    

console.log(lineBatch);
document.body.appendChild( gl.canvas );

var canvas2d = document.createElement("canvas");
var context = canvas2d.getContext("2d");
canvas2d.style.marginLeft = "20px";
canvas2d.width = size;
canvas2d.height = size;

context.fillRect(0, 0, size, size);

context.strokeStyle = 'white';
context.lineWidth = thickness;
context.moveTo(50, 50);
context.lineTo(200, 50);
context.stroke();

context.moveTo(50, 50);
context.lineTo(10, 60);
context.stroke();

document.body.appendChild(canvas2d);