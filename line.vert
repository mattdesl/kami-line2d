attribute vec4 Position;  //Line xy Position
attribute vec4 Color;     //Line Color
attribute vec2 TexCoord0; //Line start xy
attribute vec2 TexCoord1; //Line end xy

uniform mat4 u_projModelView;

varying vec4 v_col;	
varying vec3 v_edge0;
varying vec3 v_edge1;
varying vec2 v_texCoord0;

uniform float thickness;

void main() {
	vec2 pos = Position.xy;

	gl_Position = u_projModelView * vec4(pos.xy, 0.0, 1.0);
	v_col = Color * (256.0/255.0);

	//the line unit normal
	vec2 normal = vec2( TexCoord1.y-TexCoord0.y, TexCoord0.x-TexCoord1.x );
	float nlen = length(normal);

	//the scale amount
	float s = 1.0 / (thickness + nlen);

	//the amount to offset for half thickness
	normal = (normal/nlen) * (thickness/2.0);

	vec2 p0 = TexCoord0 + normal;
	vec2 p1 = TexCoord0 - normal;
	vec2 p2 = TexCoord1 + normal;
	vec2 p3 = TexCoord1 - normal;

	//compute linear coefficients for our edge functions
	v_edge0.x = p0.y-p3.y;
	v_edge0.y = p3.x-p0.x;
	v_edge0.z = p0.x*p3.y - p0.y*p3.x;

	v_edge1.x = p2.y-p1.y;
	v_edge1.y = p1.x-p2.x;
	v_edge1.z = p2.x*p1.y - p2.y*p1.x;

	//and scale them
	v_edge0 *= s;
	v_edge1 *= s;

	//compute x texture coordinates
	v_texCoord0.x = distance(pos, TexCoord0) / distance(TexCoord0, TexCoord1);
}