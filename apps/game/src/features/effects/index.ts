import { Container, Particle, ParticleContainer, Texture } from 'pixi.js';
import { GLOW, glowTexture } from '../../render/glow';
import { alphaOf, particles } from '../../render/particles';
import type { Feature } from '../feature';

/** Particle sprites kept between frames, one per particle in flight, grown as more fly. */
function pool(texture: Texture) {
  const kept: Particle[] = [];
  return (i: number) => {
    let p = kept[i];
    if (!p) {
      p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5 });
      kept[i] = p;
    }
    return p;
  };
}

/**
 * Every particle the features emit (`render/particles`): dust, sparks, embers, air. Each is a square
 * of its colour; those that glow have a soft halo added under it, so they light what is around.
 */
export const effectsFeature: Feature = {
  id: 'effects',
  layer() {
    const dynamic = { position: true, vertex: true, color: true, rotation: false, uvs: false };
    const halos = new ParticleContainer({ dynamicProperties: dynamic });
    halos.blendMode = 'add';
    const specks = new ParticleContainer({ dynamicProperties: dynamic });
    const view = new Container();
    view.addChild(halos, specks);
    const glow = glowTexture();
    const halo = pool(glow);
    const speck = pool(Texture.WHITE);
    const white = Texture.WHITE.width;

    return {
      view,
      update({ elapsedMs }) {
        particles.step(elapsedMs);
        halos.particleChildren.length = 0;
        specks.particleChildren.length = 0;
        let glowing = 0;
        particles.live.forEach((p, i) => {
          const alpha = alphaOf(p);
          const s = speck(i);
          s.x = p.x;
          s.y = p.y;
          s.scaleX = s.scaleY = p.size / white;
          s.tint = p.effect.colour;
          s.alpha = alpha;
          specks.particleChildren.push(s);
          if (!p.effect.glow) return;
          const h = halo(glowing++);
          h.x = p.x;
          h.y = p.y;
          h.scaleX = h.scaleY = p.effect.glow.size / GLOW;
          h.tint = p.effect.glow.colour;
          h.alpha = alpha * 0.8;
          halos.particleChildren.push(h);
        });
        halos.update();
        specks.update();
      },
      destroy() {
        // What flew in this game's world goes with it.
        particles.clear();
        glow.destroy(true);
      },
    };
  },
};
