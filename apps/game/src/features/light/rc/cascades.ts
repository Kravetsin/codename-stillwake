/**
 * Light by radiance cascades (a trial, `?rc`): from a mask of the scene, what blocks light (alpha)
 * and what gives it off (colour), every pixel's light from every direction, soft shadows and light
 * round corners included. On a WebGL2 canvas of its own, half the screen's size, laid over the game
 * and multiplied into it by CSS.
 *
 * Passes: seeds and a jump flood for each pixel's distance to the nearest solid one; then cascades
 * from the widest down, each tracing its rays over its own stretch of distance and taking what lies
 * beyond from the cascade above; last, the light of each pixel from the finest cascade's probes.
 */

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const SEED = `#version 300 es
precision highp float;
uniform sampler2D uMask;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  o = texelFetch(uMask, p, 0).a > 0.5 ? vec4(gl_FragCoord.xy, 0.0, 1.0) : vec4(-1.0);
}
`;

const FLOOD = `#version 300 es
precision highp float;
uniform sampler2D uSeed;
uniform float uStep;
uniform vec2 uSize;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 best = vec4(-1.0);
  float nearest = 1e9;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 q = p + vec2(x, y) * uStep;
      if (q.x < 0.0 || q.y < 0.0 || q.x >= uSize.x || q.y >= uSize.y) continue;
      vec4 s = texelFetch(uSeed, ivec2(q), 0);
      if (s.x < 0.0) continue;
      float d = distance(p, s.xy);
      if (d < nearest) { nearest = d; best = s; }
    }
  }
  o = best;
}
`;

const DISTANCE = `#version 300 es
precision highp float;
uniform sampler2D uSeed;
out vec4 o;
void main() {
  vec4 s = texelFetch(uSeed, ivec2(gl_FragCoord.xy), 0);
  o = vec4(s.x < 0.0 ? 1e4 : distance(gl_FragCoord.xy, s.xy));
}
`;

const CASCADE = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform sampler2D uDist;
uniform sampler2D uUpper;
uniform vec2 uLight;
uniform float uSpacing;
uniform int uD;
uniform float uStart;
uniform float uEnd;
uniform int uHasUpper;
uniform ivec2 uUpperProbes;
uniform float uEmit;
out vec4 o;

vec4 trace(vec2 origin, vec2 dir) {
  float t = uStart;
  for (int i = 0; i < 64; i++) {
    vec2 p = origin + dir * t;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= uLight.x || p.y >= uLight.y) break;
    float d = texelFetch(uDist, ivec2(p), 0).r;
    if (d < 0.75) return vec4(texelFetch(uMask, ivec2(p), 0).rgb * uEmit, 0.0);
    t += max(d - 0.5, 0.75);
    if (t >= uEnd) break;
  }
  return vec4(0.0, 0.0, 0.0, 1.0);
}

vec3 upperRay(ivec2 probe, int ray) {
  int d = uD * 2;
  ivec2 q = clamp(probe, ivec2(0), uUpperProbes - 1);
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    int k = ray * 4 + j;
    sum += texelFetch(uUpper, q * d + ivec2(k % d, k / d), 0).rgb;
  }
  return sum * 0.25;
}

vec3 upper(vec2 origin, int ray) {
  vec2 at = origin / (uSpacing * 2.0) - 0.5;
  ivec2 q = ivec2(floor(at));
  vec2 f = at - floor(at);
  return mix(
    mix(upperRay(q, ray), upperRay(q + ivec2(1, 0), ray), f.x),
    mix(upperRay(q + ivec2(0, 1), ray), upperRay(q + ivec2(1, 1), ray), f.x),
    f.y
  );
}

void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  ivec2 probe = t / uD;
  ivec2 r = t - probe * uD;
  int ray = r.y * uD + r.x;
  float angle = (float(ray) + 0.5) * 6.28318530718 / float(uD * uD);
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 origin = (vec2(probe) + 0.5) * uSpacing;
  vec4 rad = trace(origin, dir);
  if (uHasUpper == 1 && rad.a > 0.0) rad.rgb += rad.a * upper(origin, ray);
  o = vec4(rad.rgb, 1.0);
}
`;

const OUTPUT = `#version 300 es
precision highp float;
uniform sampler2D uC0;
uniform sampler2D uDist;
uniform sampler2D uMask;
uniform float uEmit;
uniform float uSpacing;
uniform int uD;
uniform ivec2 uProbes;
uniform vec3 uAmbient;
uniform float uExposure;
out vec4 o;

vec3 probe(ivec2 q) {
  q = clamp(q, ivec2(0), uProbes - 1);
  vec3 sum = vec3(0.0);
  for (int y = 0; y < uD; y++) for (int x = 0; x < uD; x++) {
    sum += texelFetch(uC0, q * uD + ivec2(x, y), 0).rgb;
  }
  return sum / float(uD * uD);
}

vec3 at(vec2 p) {
  vec2 a = p / uSpacing - 0.5;
  ivec2 q = ivec2(floor(a));
  vec2 f = a - floor(a);
  return mix(
    mix(probe(q), probe(q + ivec2(1, 0)), f.x),
    mix(probe(q + ivec2(0, 1)), probe(q + ivec2(1, 1)), f.x),
    f.y
  );
}

bool solid(vec2 p) {
  return texelFetch(uDist, ivec2(p), 0).r < 0.75;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec3 light = at(p);
  vec3 own = texelFetch(uMask, ivec2(p), 0).rgb * uEmit;
  // What gives off light shows its own; a solid pixel that does not is lit as the open space
  // around it: a wall's face, a machine's front, the hero.
  if (solid(p) && max(own.r, max(own.g, own.b)) > 0.0) {
    light = own;
  } else if (solid(p)) {
    light = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      int ring = i / 8;
      float angle = float(i) * 0.785398 + float(ring) * 0.26;
      vec2 q = p + vec2(cos(angle), sin(angle)) * (6.0 + 7.0 * float(ring));
      vec3 there = texelFetch(uMask, ivec2(q), 0).rgb * uEmit;
      if (!solid(q)) light = max(light, at(q));
      else if (max(there.r, max(there.g, there.b)) > 0.0) light = max(light, there);
    }
  }
  vec3 shown = 1.0 - exp(-(uAmbient + light) * uExposure);
  o = vec4(shown, 1.0);
}
`;

/** What can be tuned while the trial runs, from the console as `__light`. */
export interface Tuning {
  /** How bright the mask's colours shine. */
  emit: number;
  /** How much of the light shows: the curve from light to brightness. */
  exposure: number;
  /** Light everywhere, so the darkest is never black. */
  ambient: [number, number, number];
}

interface Target {
  readonly texture: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

/** Probe spacing of the finest cascade, in light pixels, and its rays across one side. */
const SPACING = 2;
const D0 = 2;
/** The finest cascade's stretch of distance, in light pixels; each above reaches four times as far. */
const INTERVAL = 2;

export function createCascades(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error('WebGL2 is missing');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float targets are missing');

  const program = (fragment: string) => {
    const p = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const s = gl.createShader(type);
      if (!s) throw new Error('no shader');
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      }
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? '');
    return p;
  };
  const programs = {
    seed: program(SEED),
    flood: program(FLOOD),
    distance: program(DISTANCE),
    cascade: program(CASCADE),
    output: program(OUTPUT),
  };

  // One triangle over the whole target.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const texture = (width: number, height: number, float: boolean) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const target = (width: number, height: number): Target => {
    const t = texture(width, height, true);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { texture: t, fbo, width, height };
  };
  const free = (t: Target) => {
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.fbo);
  };

  const mask = texture(1, 1, false);
  let size = { width: 0, height: 0 };
  let seeds: [Target, Target] | undefined;
  let distance: Target | undefined;
  let cascades: { target: Target; spacing: number; d: number; probes: [number, number] }[] = [];

  const resize = (width: number, height: number) => {
    if (width === size.width && height === size.height) return;
    size = { width, height };
    canvas.width = width;
    canvas.height = height;
    for (const t of [...(seeds ?? []), ...(distance ? [distance] : [])]) free(t);
    for (const c of cascades) free(c.target);
    seeds = [target(width, height), target(width, height)];
    distance = target(width, height);
    // Enough cascades for the last to reach across the whole light.
    const across = Math.hypot(width, height);
    let count = 1;
    while ((INTERVAL * (4 ** count - 1)) / 3 < across) count++;
    cascades = Array.from({ length: count }, (_, c) => {
      const spacing = SPACING * 2 ** c;
      const d = D0 * 2 ** c;
      const probes: [number, number] = [Math.ceil(width / spacing), Math.ceil(height / spacing)];
      return { target: target(probes[0] * d, probes[1] * d), spacing, d, probes };
    });
  };

  const draw = (
    into: Target | null,
    use: WebGLProgram,
    bind: (u: (n: string) => WebGLUniformLocation | null) => void,
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.fbo : null);
    gl.viewport(0, 0, into ? into.width : size.width, into ? into.height : size.height);
    gl.useProgram(use);
    bind((n) => gl.getUniformLocation(use, n));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const sample = (unit: number, t: WebGLTexture | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    return unit;
  };

  return {
    gl,
    /** Lights the scene drawn on `scene`, a canvas the light's size, and shows it on `canvas`. */
    run(scene: OffscreenCanvas | HTMLCanvasElement, tuning: Tuning) {
      resize(scene.width, scene.height);
      if (!seeds || !distance) return;
      gl.bindTexture(gl.TEXTURE_2D, mask);
      // Rows bottom up, as the targets are, so the light comes out the right way up.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, scene);

      draw(seeds[0], programs.seed, (u) => gl.uniform1i(u('uMask'), sample(0, mask)));
      let from = 0;
      for (
        let step = 2 ** Math.ceil(Math.log2(Math.max(size.width, size.height))) / 2;
        step >= 1;
        step /= 2
      ) {
        const read = seeds[from];
        const write = seeds[1 - from];
        if (!read || !write) return;
        draw(write, programs.flood, (u) => {
          gl.uniform1i(u('uSeed'), sample(0, read.texture));
          gl.uniform1f(u('uStep'), step);
          gl.uniform2f(u('uSize'), size.width, size.height);
        });
        from = 1 - from;
      }
      const flooded = seeds[from];
      if (!flooded) return;
      draw(distance, programs.distance, (u) =>
        gl.uniform1i(u('uSeed'), sample(0, flooded.texture)),
      );

      for (let c = cascades.length - 1; c >= 0; c--) {
        const at = cascades[c];
        const above = cascades[c + 1];
        if (!at) continue;
        draw(at.target, programs.cascade, (u) => {
          gl.uniform1i(u('uMask'), sample(0, mask));
          gl.uniform1i(u('uDist'), sample(1, distance?.texture ?? null));
          gl.uniform1i(u('uUpper'), sample(2, above?.target.texture ?? null));
          gl.uniform2f(u('uLight'), size.width, size.height);
          gl.uniform1f(u('uSpacing'), at.spacing);
          gl.uniform1i(u('uD'), at.d);
          gl.uniform1f(u('uStart'), (INTERVAL * (4 ** c - 1)) / 3);
          gl.uniform1f(u('uEnd'), (INTERVAL * (4 ** (c + 1) - 1)) / 3);
          gl.uniform1i(u('uHasUpper'), above ? 1 : 0);
          gl.uniform2i(u('uUpperProbes'), above?.probes[0] ?? 1, above?.probes[1] ?? 1);
          gl.uniform1f(u('uEmit'), tuning.emit);
        });
      }
      const finest = cascades[0];
      if (!finest) return;
      draw(null, programs.output, (u) => {
        gl.uniform1i(u('uC0'), sample(0, finest.target.texture));
        gl.uniform1i(u('uDist'), sample(1, distance?.texture ?? null));
        gl.uniform1i(u('uMask'), sample(2, mask));
        gl.uniform1f(u('uEmit'), tuning.emit);
        gl.uniform1f(u('uSpacing'), finest.spacing);
        gl.uniform1i(u('uD'), finest.d);
        gl.uniform2i(u('uProbes'), finest.probes[0], finest.probes[1]);
        gl.uniform3f(u('uAmbient'), ...tuning.ambient);
        gl.uniform1f(u('uExposure'), tuning.exposure);
      });
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
