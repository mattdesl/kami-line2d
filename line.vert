attribute vec4 Position;
attribute vec4 Color;
attribute vec2 TexCoord0;
attribute vec3 Normal;

uniform mat4 u_projModelView;

varying vec4 v_col;	
varying vec2 v_texCoord0;
varying vec2 v_smooth;
varying vec2 v_smooth_enabled;

void main() {
	vec2 pos = Position.xy;


	gl_Position = u_projModelView * vec4(pos, 0.0, 1.0);

	v_col = Color * (256.0/255.0);
	v_texCoord0 = TexCoord0;

	//// Compute edge smoothing
	//Position.z holds the distance squared from end to end (x smooth)
	//Position.w holds the half thickness from top to bottom (y smooth)
	//Negative values will disable the shading for that edge entirely

	vec2 smoothAmt = 1.0 / vec2( sqrt(abs(Position.z))/2.0, abs(Position.w) );
	v_smooth = clamp( smoothAmt, 0.0, 1.0 );
	v_smooth_enabled = sign( Position.zw );
}