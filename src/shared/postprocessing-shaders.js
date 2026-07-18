export function createPostprocessingShaders(THREE) {
  const BloomClampShader = {
    uniforms: {
      tDiffuse: { value: null },
      uCap: { value: 4.0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uCap;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 over = max(c.rgb - vec3(uCap), vec3(0.0));
        gl_FragColor = vec4(min(c.rgb, vec3(uCap)) + over / (1.0 + over), c.a);
      }`,
  };

  const LensingShader = {
    uniforms: {
      tDiffuse: { value: null },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uStrength: { value: 0 },
      uAspect: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uCenter; uniform float uStrength; uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - uCenter; d.x *= uAspect;
        float r = length(d) + 1e-4;
        float pull = uStrength / (r * r * 60.0 + 1.0);
        vec2 uv = vUv - (d / r) * pull;
        gl_FragColor = texture2D(tDiffuse, uv);
      }`,
  };

  return { BloomClampShader, LensingShader };
}
