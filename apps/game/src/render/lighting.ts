import {
  ColorMatrixFilter,
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

/**
 * What a surface is lit by: `open` for what light crosses and falls on — back walls, walls, floors,
 * pipes and cables behind — and `things` for what stands in the room — machines, heroes, items —
 * lit where they stand as though they did not block it themselves.
 */
export type Surface = 'open' | 'things';

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

  /** Lights with `texture`, laid where `lighting.sprite` lies. */
  show(texture: Texture) {
    this.resources.uLightTexture = texture.source;
    this.resources.uLightSampler = texture.source.style;
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
 * The light, shared as the particles are: one per page. The `light` feature works it out into two
 * textures laid in the world by `sprite`; features set `filters[surface]` on what it lights and add
 * to `casting` what casts a shadow drawn as it is, the heroes. Until light is worked out, the
 * textures are white and light nothing differently.
 */
export const lighting = {
  sprite: Object.assign(new Sprite(Texture.WHITE), { renderable: false }),
  filters: { open: new LitFilter(), things: new LitFilter() },
  casting: new Set<Container>(),
};

/** Lights `view` as `surface` from now on. */
export function lightAs(view: Container, surface: Surface): void {
  view.filters = [lighting.filters[surface]];
}

/**
 * The share of the mask's alpha that machines and heroes block with: they stop light, but less than
 * a wall's whole alpha, so the light can be found once without them.
 */
export const THINGS = 0.6;

/** What a hero looks like in the mask: its shape, black, at `THINGS`. */
export function silhouette(): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  filter.matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, THINGS, 0];
  return filter;
}
