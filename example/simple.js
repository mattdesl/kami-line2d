var size = 350;
var thickness = 6;

var gl = require('webgl-context')({ 
        width: size, 
        height: size, 
        attributes: {
            antialias: false
        } 
    });
var tex = require('kami-white-texture')(gl);
var lineBatch = require('../')(gl);

var Vector2 = require('vecmath').Vector2;
var OrthographicCamera = require('cam3d').OrthographicCamera;
var ortho = new OrthographicCamera();
ortho.setToOrtho(true, size, size);
// ortho.zoom = 0.56;
ortho.update();

requestAnimationFrame(render);


var time = 0;

function render() {
    time+=0.005;
    // requestAnimationFrame(render);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    lineBatch.setColor(1,1,1,1);
    lineBatch.thickness = thickness;
    lineBatch.setProjectionMatrix(ortho.combined);
    lineBatch.begin();

    // lineBatch.moveTo(25, 25);
    // lineBatch.lineTo(150, 50);
    // lineBatch.lineTo(25, 80);

    var rect = {
        x: 50,
        y: 50,
        width: 100,
        height: 100
    };

    // lineBatch.moveTo(rect.x, rect.y);
    // lineBatch.lineTo(rect.x+rect.width, rect.y);
    // lineBatch.lineTo(rect.x+rect.width, rect.y+rect.height);
    // lineBatch.lineTo(rect.x, rect.y+rect.height);
    // lineBatch.lineTo(rect.x, rect.y);
    
    lineBatch.moveTo(50, 50);
    lineBatch.lineTo(205, 50);
    lineBatch.lineTo(79, 175);
    lineBatch.lineTo(200, 100);
    lineBatch.lineTo(300, 100);
    lineBatch.lineTo(100, 300);
    // lineBatch.lineTo(100, 300);
    lineBatch.lineTo(200, 300);

    // lineBatch.moveTo(25, 25);
    // lineBatch.lineTo(50, 100);


    // lineBatch.moveTo(50, 25);
    // lineBatch.lineTo(20, 100);

    // lineBatch.moveTo(50, 15);
    // lineBatch.lineTo(15, 15);

    //lineBatch.strip()

    // lineBatch.segment(new Vector2(50, 80), new Vector2(100, 80));
    // lineBatch.segment(new Vector2(102, 80.01), new Vector2(200, 80));
    // lineBatch.segment(new Vector2(10, 60), new Vector2(50, 50));
    
    // var mid = new Vector2(size/2, size/2);
    // lineBatch.segment(mid, 
    //         new Vector2(Math.cos(time), Math.sin(time)).scale(5).add(mid) );

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