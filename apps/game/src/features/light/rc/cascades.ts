/**
 * Light by radiance cascades (a trial, `?rc`): from a mask of the scene, what blocks light (alpha)
 * and what gives it off (colour), every pixel's light from every direction, soft shadows and light
 * round corners included. On a WebGL2 canvas of its own, half the screen's size, laid over the game
 * and multiplied into it by CSS.
 *
 * The mask's alpha says what blocks: walls and closed doors at 1, machines and heroes at
 * `THINGS`. Light is found twice: once blocked by all, for the open space and the shadows things
 * cast; once by walls alone, for the fronts of things, seen from the side as they are and lit as
 * if they were not there, and for the faces of walls. Each time: seeds and a jump flood for each
 * pixel's distance to the nearest that blocks, then cascades from the widest down, each tracing
 * its rays over its own stretch of distance and taking what lies beyond from the cascade above.
 */

/** The mask's alpha for machines and heroes: they block light, but less than a wall does. */
export const THINGS = 0.6;

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const SEED = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform float uBlocks;
out vec4 o;
void main() {
  bool seed = texelFetch(uMask, ivec2(gl_FragCoord.xy), 0).a > uBlocks;
  o = seed ? vec4(gl_FragCoord.xy, 0.0, 1.0) : vec4(-1.0);
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
uniform sampler2D uAll;
uniform sampler2D uWalls;
uniform sampler2D uMask;
uniform float uEmit;
uniform float uSpacing;
uniform int uD;
uniform ivec2 uProbes;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uThings;
out vec4 o;

vec3 probe(sampler2D c, ivec2 q) {
  q = clamp(q, ivec2(0), uProbes - 1);
  vec3 sum = vec3(0.0);
  for (int y = 0; y < uD; y++) for (int x = 0; x < uD; x++) {
    sum += texelFetch(c, q * uD + ivec2(x, y), 0).rgb;
  }
  return sum / float(uD * uD);
}

vec3 at(sampler2D c, vec2 p) {
  vec2 a = p / uSpacing - 0.5;
  ivec2 q = ivec2(floor(a));
  vec2 f = a - floor(a);
  return mix(
    mix(probe(c, q), probe(c, q + ivec2(1, 0)), f.x),
    mix(probe(c, q + ivec2(0, 1)), probe(c, q + ivec2(1, 1)), f.x),
    f.y
  );
}

float blocks(vec2 p) {
  return texelFetch(uMask, ivec2(p), 0).a;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 m = texelFetch(uMask, ivec2(p), 0);
  vec3 light;
  if (max(m.r, max(m.g, m.b)) > 0.0) {
    // What gives off light shows its own.
    light = m.rgb * uEmit;
  } else if (m.a > (1.0 + uThings) * 0.5) {
    // A wall's face takes the brightest light beside it, found as if no thing stood there.
    light = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      int ring = i / 8;
      float angle = float(i) * 0.785398 + float(ring) * 0.26;
      vec2 q = p + vec2(cos(angle), sin(angle)) * (5.0 + 6.0 * float(ring));
      vec4 there = texelFetch(uMask, ivec2(q), 0);
      if (max(there.r, max(there.g, there.b)) > 0.0) light = max(light, there.rgb * uEmit);
      else if (there.a < (1.0 + uThings) * 0.5) light = max(light, at(uWalls, q));
    }
  } else if (m.a > uThings * 0.5) {
    // A thing's front is lit as the place it stands in.
    light = at(uWalls, p);
  } else {
    light = at(uAll, p);
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

interface Cascade {
  readonly target: Target;
  readonly spacing: number;
  readonly d: number;
  readonly probes: readonly [number, number];
}

/** One way of blocking light: its distance field and its cascades. */
interface Field {
  readonly seeds: readonly [Target, Target];
  readonly distance: Target;
  readonly cascades: readonly Cascade[];
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
  let fields: { all: Field; walls: Field } | undefined;

  const field = (width: number, height: number): Field => {
    // Enough cascades for the last to reach across the whole light.
    const across = Math.hypot(width, height);
    let count = 1;
    while ((INTERVAL * (4 ** count - 1)) / 3 < across) count++;
    return {
      seeds: [target(width, height), target(width, height)],
      distance: target(width, height),
      cascades: Array.from({ length: count }, (_, c) => {
        const spacing = SPACING * 2 ** c;
        const d = D0 * 2 ** c;
        const probes: [number, number] = [Math.ceil(width / spacing), Math.ceil(height / spacing)];
        return { target: target(probes[0] * d, probes[1] * d), spacing, d, probes };
      }),
    };
  };
  const freeField = (f: Field) => {
    for (const t of [...f.seeds, f.distance, ...f.cascades.map((c) => c.target)]) free(t);
  };

  const resize = (width: number, height: number) => {
    if (width === size.width && height === size.height) return;
    size = { width, height };
    canvas.width = width;
    canvas.height = height;
    if (fields) {
      freeField(fields.all);
      freeField(fields.walls);
    }
    fields = { all: field(width, height), walls: field(width, height) };
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

  /** Light where whatever the mask's alpha puts over `blocks` stops it: into `f`'s finest cascade. */
  const light = (f: Field, blocks: number, tuning: Tuning) => {
    draw(f.seeds[0], programs.seed, (u) => {
      gl.uniform1i(u('uMask'), sample(0, mask));
      gl.uniform1f(u('uBlocks'), blocks);
    });
    let from = 0;
    const top = 2 ** Math.ceil(Math.log2(Math.max(size.width, size.height))) / 2;
    for (let step = top; step >= 1; step /= 2) {
      const read = f.seeds[from];
      const write = f.seeds[1 - from];
      if (!read || !write) return;
      draw(write, programs.flood, (u) => {
        gl.uniform1i(u('uSeed'), sample(0, read.texture));
        gl.uniform1f(u('uStep'), step);
        gl.uniform2f(u('uSize'), size.width, size.height);
      });
      from = 1 - from;
    }
    const flooded = f.seeds[from];
    if (!flooded) return;
    draw(f.distance, programs.distance, (u) =>
      gl.uniform1i(u('uSeed'), sample(0, flooded.texture)),
    );
    for (let c = f.cascades.length - 1; c >= 0; c--) {
      const at = f.cascades[c];
      const above = f.cascades[c + 1];
      if (!at) continue;
      draw(at.target, programs.cascade, (u) => {
        gl.uniform1i(u('uMask'), sample(0, mask));
        gl.uniform1i(u('uDist'), sample(1, f.distance.texture));
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
  };

  return {
    gl,
    /** Lights the scene drawn on `scene`, a canvas the light's size, and shows it on `canvas`. */
    run(scene: OffscreenCanvas | HTMLCanvasElement, tuning: Tuning) {
      resize(scene.width, scene.height);
      if (!fields) return;
      gl.bindTexture(gl.TEXTURE_2D, mask);
      // Rows bottom up, as the targets are, so the light comes out the right way up.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, scene);

      light(fields.all, THINGS * 0.5, tuning);
      light(fields.walls, (1 + THINGS) * 0.5, tuning);
      const all = fields.all.cascades[0];
      const walls = fields.walls.cascades[0];
      if (!all || !walls) return;
      draw(null, programs.output, (u) => {
        gl.uniform1i(u('uAll'), sample(0, all.target.texture));
        gl.uniform1i(u('uWalls'), sample(1, walls.target.texture));
        gl.uniform1i(u('uMask'), sample(2, mask));
        gl.uniform1f(u('uEmit'), tuning.emit);
        gl.uniform1f(u('uSpacing'), all.spacing);
        gl.uniform1i(u('uD'), all.d);
        gl.uniform2i(u('uProbes'), all.probes[0], all.probes[1]);
        gl.uniform3f(u('uAmbient'), ...tuning.ambient);
        gl.uniform1f(u('uExposure'), tuning.exposure);
        gl.uniform1f(u('uThings'), THINGS);
      });
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
