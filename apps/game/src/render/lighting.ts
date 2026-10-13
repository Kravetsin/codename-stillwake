import {
  Filter,
  GlProgram,
  Matrix,
  Sprite,
  Texture,
  UniformGroup,
  type Container,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js';

const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLightUv;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uLightMatrix;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vLightUv = (uLightMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`;

const FRAGMENT = `in vec2 vTextureCoord;
in vec2 vLightUv;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLightTexture;
uniform vec2 uLightSize;
uniform float uBlocks;

// A cell's light, its alpha the cell's side: whole for a wall, a little less for the open. Read at
// the texel's middle from a texture that is not filtered: that texel and no other.
vec4 cell(vec2 texel) {
  return texture(uLightTexture, (clamp(texel, vec2(0.0), uLightSize - 1.0) + 0.5) / uLightSize);
}

// What one of the four cells round a point adds, weighed by w, if it is on the given side.
void add(vec4 near, float w, bool side, inout vec3 sum, inout float weight) {
  if ((near.a > 0.99) == side) {
    sum += near.rgb * w;
    weight += w;
  }
}

void main(void) {
  vec4 colour = texture(uTexture, vTextureCoord);
  // Blended between the four cells round this point, those of this cell's side only: smooth
  // light in a room and along a wall, and no blending across a wall's face.
  vec2 at = vLightUv * uLightSize - 0.5;
  vec2 corner = floor(at);
  vec2 f = at - corner;
  vec4 own = cell(floor(vLightUv * uLightSize));
  // A block takes light from its own side; all else, in front of the back wall, from the open.
  bool side = uBlocks > 0.5 && own.a > 0.99;
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  add(cell(corner), (1.0 - f.x) * (1.0 - f.y), side, sum, weight);
  add(cell(corner + vec2(1.0, 0.0)), f.x * (1.0 - f.y), side, sum, weight);
  add(cell(corner + vec2(0.0, 1.0)), (1.0 - f.x) * f.y, side, sum, weight);
  add(cell(corner + vec2(1.0, 1.0)), f.x * f.y, side, sum, weight);
  vec3 light = weight > 0.0 ? sum / weight : own.rgb;
  finalColor = vec4(colour.rgb * light, colour.a);
}
`;

/**
 * Multiplies what it is set on by the light where it lies: the light's texture is laid in the world
 * by `lighting.sprite`, so the camera's moves and zoom are the sprite's own.
 */
class LitFilter extends Filter {
  constructor(blocks: boolean) {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'lit-filter' }),
      resources: {
        litUniforms: new UniformGroup({
          uLightMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uLightSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
          uBlocks: { value: blocks ? 1 : 0, type: 'f32' },
        }),
        uLightTexture: Texture.WHITE.source,
        uLightSampler: Texture.WHITE.source.style,
      },
    });
  }

  override apply(
    filters: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const uniforms = (this.resources.litUniforms as UniformGroup).uniforms as {
      uLightMatrix: Matrix;
    };
    filters.calculateSpriteMatrix(uniforms.uLightMatrix, lighting.sprite);
    filters.applyFilter(this, input, output, clearMode);
  }
}

/**
 * How light falls on what it lights: `blocks` — walls, floors, ladders and doors — each from its
 * own side, so a block keeps its edges; `open` — back walls, machines, heroes, items, pipes and
 * cables — from the open cells only, so the back wall beside a door is lit by the room it is in,
 * not by the door's cell.
 */
export type Falls = 'blocks' | 'open';

const filters: Record<Falls, LitFilter> = {
  blocks: new LitFilter(true),
  open: new LitFilter(false),
};

/**
 * The light, shared as the particles are: one per page. The `light` feature works it out into a
 * texture laid in the world by `sprite`; features set it on what it lights with `lit`. Until light
 * is worked out, the texture is white and lights nothing differently.
 */
export const lighting = {
  sprite: Object.assign(new Sprite(Texture.WHITE), { renderable: false }),
  /** Lights with `texture`, a texel a cell, laid where `sprite` lies. */
  show(texture: Texture) {
    lighting.sprite.texture = texture;
    for (const filter of Object.values(filters)) {
      filter.resources.uLightTexture = texture.source;
      filter.resources.uLightSampler = texture.source.style;
      const group = filter.resources.litUniforms as UniformGroup;
      const uniforms = group.uniforms as { uLightSize: Float32Array };
      uniforms.uLightSize[0] = texture.source.width;
      uniforms.uLightSize[1] = texture.source.height;
      group.update();
    }
  },
};

/** Lights `view` from now on, light falling on it as on `falls`. */
export function lit(view: Container, falls: Falls = 'open'): void {
  view.filters = [filters[falls]];
}
