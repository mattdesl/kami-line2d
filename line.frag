#ifdef GL_ES
precision mediump float;
#endif
varying vec4 v_col;
varying vec2 v_texCoord0;
varying vec2 v_smooth;
varying vec2 v_smooth_enabled;

uniform sampler2D u_sampler0;
// uniform float thickness;

void main() {
	vec2 dist = v_smooth;
	vec2 center = 1.0-abs(v_texCoord0 * 2.0 - 1.0);
	center = smoothstep(vec2(0.0), dist, center);


	center = mix(vec2(1.0), center, v_smooth_enabled);


	// float index = min(center.x, center.y);
	// float filter = texture2D(u_sampler0, vec2(index, 0.0)).x;


	float smoothing = clamp(center.x * center.y, 0.0, 1.0);
	gl_FragColor = v_col * smoothing;

	// gl_FragColor = vec4(smoothing, 1.0, 1.0, 1.0);
}