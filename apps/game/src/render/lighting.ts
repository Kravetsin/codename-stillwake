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

void main(void) {
  vec4 colour = texture(uTexture, vTextureCoord);
  finalColor = vec4(colour.rgb * texture(uLightTexture, vLightUv).rgb, colour.a);
}
`;

/**
 * Multiplies what it is set on by the light where it lies: the light's texture is laid in the world
 * by `lighting.sprite`, so the camera's moves and zoom are the sprite's own.
 */
class LitFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'lit-filter' }),
      resources: {
        litUniforms: new UniformGroup({
          uLightMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
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
 * How light falls on what it lights: `smooth`, blended between cells, on what stands in front of
 * the back walls and on them; `cell`, a whole cell alike, on walls, floors, ladders and doors, so
 * each block keeps its edges.
 */
export type Falls = 'smooth' | 'cell';

const filters: Record<Falls, LitFilter> = { smooth: new LitFilter(), cell: new LitFilter() };

/**
 * The light, shared as the particles are: one per page. The `light` feature works it out into a
 * texture laid in the world by `sprite`; features set it on what it lights with `lit`. Until light
 * is worked out, the texture is white and lights nothing differently.
 */
export const lighting = {
  sprite: Object.assign(new Sprite(Texture.WHITE), { renderable: false }),
  /** Lights with the same light read two ways, laid where `sprite` lies. */
  show(textures: Record<Falls, Texture>) {
    lighting.sprite.texture = textures.smooth;
    for (const falls of ['smooth', 'cell'] as const) {
      filters[falls].resources.uLightTexture = textures[falls].source;
      filters[falls].resources.uLightSampler = textures[falls].source.style;
    }
  },
};

/** Lights `view` from now on, light falling on it as `falls`. */
export function lit(view: Container, falls: Falls = 'smooth'): void {
  view.filters = [filters[falls]];
}
