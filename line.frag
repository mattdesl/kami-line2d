#ifdef GL_ES
precision mediump float;
#endif
varying vec4 v_col;
varying vec3 v_edge0;
varying vec3 v_edge1;

varying vec2 v_texCoord0;

uniform sampler2D u_sampler0;

void main() {
	//sample position
	vec3 p = vec3(gl_FragCoord.xy, 1.0);

	//evaluate edge functions f0, f1
	vec2 scaledDistance = vec2( dot(v_edge0, p), dot(v_edge1, p) );

	if (scaledDistance.x < 0.0 || scaledDistance.y < 0.0) {
		// discard;
	}

	float index = min(scaledDistance.x, scaledDistance.y);
	float filter = texture2D(u_sampler0, vec2(index, 0.0)).x;

	gl_FragColor = vec4(v_edge0.xxx, 1.0);
}