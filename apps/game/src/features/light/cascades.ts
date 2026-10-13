import { THINGS } from '../../render/lighting';

/**
 * Light by radiance cascades, worked out on the game's own WebGL2 context: from a mask of the
 * world, every pixel's light from every direction, with soft shadows and light round corners.
 *
 * The mask: colour where light is given off (as a share of `emit`), alpha where it is stopped —
 * 1 for walls and what gives off light, `THINGS` for machines and heroes. Light is found twice:
 * stopped by everything, for what light falls on (`open`), and by walls alone, for things, lit
 * where they stand as though they did not block it (`things`). A wall's face is lit by the
 * brightest light within a cell of it, as found without things. Each time: seeds and a jump
 * flood for every pixel's distance to the nearest that stops light, then cascades from the widest
 * down, each tracing its rays over its own stretch of distance and taking what lies beyond from
 * the four probes above around it that no wall hides; last, each pixel's light from the finest
 * cascade's probes.
 */

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

// What a ray gathers over its stretch, and whether light from beyond it still gets through.
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

// Whether nothing that stops light lies between a and b: a probe the far side of a wall has seen
// what this one cannot. Starting inside a wall, it counts from where the wall ends.
bool sees(vec2 a, vec2 b) {
  vec2 dir = b - a;
  float span = max(length(dir), 1e-3);
  dir /= span;
  float t = 0.0;
  bool left = false;
  for (int i = 0; i < 24; i++) {
    if (t >= span) return true;
    vec2 p = a + dir * t;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= uLight.x || p.y >= uLight.y) return true;
    float d = texelFetch(uDist, ivec2(p), 0).r;
    if (d < 0.75) {
      if (left) return false;
      t += 1.0;
    } else {
      left = true;
      t += max(d - 0.5, 0.75);
    }
  }
  return true;
}

// The light from beyond this stretch, as the four probes above around this one saw it, each
// weighed by how near it is, and left out when a wall stands between.
vec3 upper(vec2 origin, int ray) {
  float spacing = uSpacing * 2.0;
  vec2 at = origin / spacing - 0.5;
  ivec2 q = ivec2(floor(at));
  vec2 f = at - floor(at);
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < 4; i++) {
    ivec2 o = ivec2(i % 2, i / 2);
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    vec2 centre = (vec2(q + o) + 0.5) * spacing;
    if (w <= 0.0 || !sees(origin, centre)) continue;
    sum += w * upperRay(q + o, ray);
    weight += w;
  }
  return weight > 0.0 ? sum / weight : vec3(0.0);
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
uniform sampler2D uThings;
uniform sampler2D uMask;
uniform float uEmit;
uniform float uWall;
uniform float uCell;
uniform float uSpacing;
uniform int uD;
uniform ivec2 uProbes;
uniform vec3 uAmbient;
uniform float uExposure;
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

void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 m = texelFetch(uMask, ivec2(p), 0);
  vec3 light;
  if (max(m.r, max(m.g, m.b)) > 0.0) {
    // What gives off light shows its own.
    light = m.rgb * uEmit;
  } else if (m.a >= uWall) {
    // A wall's face takes the brightest light within a cell of it, found as though no thing stood
    // there, so the shadows of things do not stain it and a wall reads as thick as it is.
    light = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float reach = uCell * float(i / 8 + 1) / 3.0;
      float angle = float(i) * 0.785398 + float(i / 8) * 0.26;
      vec2 q = p + vec2(cos(angle), sin(angle)) * reach;
      vec4 there = texelFetch(uMask, ivec2(q), 0);
      if (max(there.r, max(there.g, there.b)) > 0.0) light = max(light, there.rgb * uEmit);
      else if (there.a < uWall) light = max(light, at(uThings, q));
    }
  } else {
    light = at(uC0, p);
  }
  o = vec4(1.0 - exp(-(uAmbient + light) * uExposure), 1.0);
}
`;

/** How light is worked out and shown: from `LIGHT` in content, tunable while it runs. */
export interface Tuning {
  /** How bright the mask's colours shine. */
  readonly emit: number;
  /** The curve from light to brightness. */
  readonly exposure: number;
  /**
   * The finest cascade's probes, this many light pixels apart, each with `rays` × `rays` rays; its
   * stretch of distance as long as its spacing, and each above four times as long.
   */
  readonly spacing: number;
  readonly rays: number;
  /** Light everywhere, so the darkest is never black. */
  readonly ambient: readonly [number, number, number];
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

/** One way of stopping light: its distance field and its cascades. */
interface Field {
  readonly seeds: readonly [Target, Target];
  readonly distance: Target;
  readonly cascades: readonly Cascade[];
}

/**
 * The cascades on `gl`, the context the game draws with. Its state is the caller's to give back
 * (`renderer.resetState()`) once `run` is done. Undefined where float targets are missing.
 */
export function createCascades(gl: WebGL2RenderingContext) {
  if (!gl.getExtension('EXT_color_buffer_float')) return undefined;

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
  const locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const uniform = (p: WebGLProgram, name: string) => {
    let names = locations.get(p);
    if (!names) locations.set(p, (names = new Map<string, WebGLUniformLocation | null>()));
    if (!names.has(name)) names.set(name, gl.getUniformLocation(p, name));
    return names.get(name) ?? null;
  };

  // One triangle over the whole target, in an array of its own so the game's are left alone.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const target = (width: number, height: number): Target => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, fbo, width, height };
  };
  const free = (t: Target) => {
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.fbo);
  };

  const field = (width: number, height: number, finest: Tuning): Field => {
    // Enough cascades for the last to reach across the whole light.
    const across = Math.hypot(width, height);
    let count = 1;
    while ((finest.spacing * (4 ** count - 1)) / 3 < across) count++;
    return {
      seeds: [target(width, height), target(width, height)],
      distance: target(width, height),
      cascades: Array.from({ length: count }, (_, c) => {
        const spacing = finest.spacing * 2 ** c;
        const d = finest.rays * 2 ** c;
        const probes: [number, number] = [Math.ceil(width / spacing), Math.ceil(height / spacing)];
        return { target: target(probes[0] * d, probes[1] * d), spacing, d, probes };
      }),
    };
  };
  const freeField = (f: Field) => {
    for (const t of [...f.seeds, f.distance, ...f.cascades.map((c) => c.target)]) free(t);
  };

  let size = { width: 0, height: 0, spacing: 0, rays: 0 };
  let fields: { open: Field; things: Field } | undefined;
  /** Framebuffers drawing into the textures light is shown from, by texture. */
  const outputs = new Map<WebGLTexture, WebGLFramebuffer>();

  const draw = (
    into: WebGLFramebuffer | null,
    width: number,
    height: number,
    use: WebGLProgram,
    bind: (u: (name: string) => WebGLUniformLocation | null) => void,
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    gl.viewport(0, 0, width, height);
    gl.useProgram(use);
    bind((name) => uniform(use, name));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const sample = (unit: number, t: WebGLTexture | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    return unit;
  };

  /** Light stopped by whatever the mask's alpha puts over `blocks`: into `f`'s finest cascade. */
  const find = (mask: WebGLTexture, f: Field, blocks: number, tuning: Tuning) => {
    const { width, height } = size;
    const first = f.seeds[0];
    draw(first.fbo, width, height, programs.seed, (u) => {
      gl.uniform1i(u('uMask'), sample(0, mask));
      gl.uniform1f(u('uBlocks'), blocks);
    });
    let from = 0;
    const top = 2 ** Math.ceil(Math.log2(Math.max(width, height))) / 2;
    for (let step = top; step >= 1; step /= 2) {
      const read = f.seeds[from];
      const write = f.seeds[1 - from];
      if (!read || !write) return;
      draw(write.fbo, width, height, programs.flood, (u) => {
        gl.uniform1i(u('uSeed'), sample(0, read.texture));
        gl.uniform1f(u('uStep'), step);
        gl.uniform2f(u('uSize'), width, height);
      });
      from = 1 - from;
    }
    const flooded = f.seeds[from];
    if (!flooded) return;
    draw(f.distance.fbo, width, height, programs.distance, (u) =>
      gl.uniform1i(u('uSeed'), sample(0, flooded.texture)),
    );
    for (let c = f.cascades.length - 1; c >= 0; c--) {
      const at = f.cascades[c];
      const above = f.cascades[c + 1];
      if (!at) continue;
      draw(at.target.fbo, at.target.width, at.target.height, programs.cascade, (u) => {
        gl.uniform1i(u('uMask'), sample(0, mask));
        gl.uniform1i(u('uDist'), sample(1, f.distance.texture));
        gl.uniform1i(u('uUpper'), sample(2, above?.target.texture ?? null));
        gl.uniform2f(u('uLight'), width, height);
        gl.uniform1f(u('uSpacing'), at.spacing);
        gl.uniform1i(u('uD'), at.d);
        gl.uniform1f(u('uStart'), (tuning.spacing * (4 ** c - 1)) / 3);
        gl.uniform1f(u('uEnd'), (tuning.spacing * (4 ** (c + 1) - 1)) / 3);
        gl.uniform1i(u('uHasUpper'), above ? 1 : 0);
        gl.uniform2i(u('uUpperProbes'), above?.probes[0] ?? 1, above?.probes[1] ?? 1);
        gl.uniform1f(u('uEmit'), tuning.emit);
      });
    }
  };

  /**
   * Shows the light found in `f` into `into`, a texture the light's size; walls' faces from
   * `things`, the light found without things, within `cell` light pixels.
   */
  const show = (
    mask: WebGLTexture,
    f: Field,
    things: Field,
    into: WebGLTexture,
    tuning: Tuning,
    cell: number,
  ) => {
    const finest = f.cascades[0];
    const unblocked = things.cascades[0];
    if (!finest || !unblocked) return;
    let fbo = outputs.get(into);
    if (!fbo) {
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, into, 0);
      outputs.set(into, fbo);
    }
    draw(fbo, size.width, size.height, programs.output, (u) => {
      gl.uniform1i(u('uC0'), sample(0, finest.target.texture));
      gl.uniform1i(u('uMask'), sample(1, mask));
      gl.uniform1i(u('uThings'), sample(2, unblocked.target.texture));
      gl.uniform1f(u('uEmit'), tuning.emit);
      gl.uniform1f(u('uWall'), (1 + THINGS) / 2);
      gl.uniform1f(u('uCell'), cell);
      gl.uniform1f(u('uSpacing'), finest.spacing);
      gl.uniform1i(u('uD'), finest.d);
      gl.uniform2i(u('uProbes'), finest.probes[0], finest.probes[1]);
      gl.uniform3f(u('uAmbient'), ...tuning.ambient);
      gl.uniform1f(u('uExposure'), tuning.exposure);
    });
  };

  return {
    /**
     * Lights the world in `mask`, `width` × `height` at `cell` pixels a cell, into `open` and
     * `things`, textures of that size the game samples.
     */
    run(
      mask: WebGLTexture,
      width: number,
      height: number,
      into: { readonly open: WebGLTexture; readonly things: WebGLTexture },
      tuning: Tuning,
      cell: number,
    ) {
      const made =
        width === size.width &&
        height === size.height &&
        tuning.spacing === size.spacing &&
        tuning.rays === size.rays;
      if (!made || !fields) {
        if (fields) {
          freeField(fields.open);
          freeField(fields.things);
        }
        for (const fbo of outputs.values()) gl.deleteFramebuffer(fbo);
        outputs.clear();
        size = { width, height, spacing: tuning.spacing, rays: tuning.rays };
        fields = { open: field(width, height, tuning), things: field(width, height, tuning) };
      }
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      find(mask, fields.open, THINGS / 2, tuning);
      find(mask, fields.things, (1 + THINGS) / 2, tuning);
      show(mask, fields.open, fields.things, into.open, tuning, cell);
      show(mask, fields.things, fields.things, into.things, tuning, cell);
      gl.bindVertexArray(null);
    },
    /** Forgets the targets, so the next `run` makes them anew, after the textures it drew into went. */
    forgetOutputs() {
      for (const fbo of outputs.values()) gl.deleteFramebuffer(fbo);
      outputs.clear();
    },
  };
}
