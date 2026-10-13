import { RenderTexture, Sprite, type Application, type Container } from 'pixi.js';

/**
 * The world as pixel art (a trial, `?pixel`): drawn at its own size, a pixel of the world a pixel
 * of a texture, with no smoothing, then laid on the screen that many times larger, a whole number
 * of screen pixels to each. The camera still moves and zooms `world`; its zoom is rounded to whole
 * pixels and its moves to whole pixels of the world, as pixel art moves.
 */
export function createPixelView(app: Application, world: Container, background: number) {
  app.stage.removeChild(world);
  const view = new Sprite();
  app.stage.addChildAt(view, 0);
  let target: RenderTexture | undefined;
  const clear: [number, number, number, number] = [
    ((background >> 16) & 0xff) / 255,
    ((background >> 8) & 0xff) / 255,
    (background & 0xff) / 255,
    1,
  ];

  return {
    /** Draws the world into its texture as the camera last placed it. */
    render() {
      const zoom = world.scale.x;
      const pixel = Math.max(1, Math.round(zoom));
      const width = Math.ceil(app.screen.width / pixel);
      const height = Math.ceil(app.screen.height / pixel);
      if (!target || target.width !== width || target.height !== height) {
        const old = target;
        target = RenderTexture.create({ width, height, scaleMode: 'nearest', antialias: false });
        view.texture = target;
        old?.destroy(true);
      }
      // Drawn at a pixel a pixel, then put back as the camera left it, which the pointer reads.
      const { x, y } = world.position;
      world.scale.set(zoom / pixel);
      world.position.set(Math.round(x / pixel), Math.round(y / pixel));
      app.renderer.render({ container: world, target, clear: true, clearColor: clear });
      world.scale.set(zoom);
      world.position.set(x, y);
      view.scale.set(pixel);
    },
    destroy() {
      target?.destroy(true);
    },
  };
}
