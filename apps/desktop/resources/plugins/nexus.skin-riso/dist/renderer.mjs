/**
 * 孔版皮肤：两色错位网点与斜向条纹，制造轻量的印刷套色感。
 */
export function activate(ctx) {
  return ctx.skins.register('riso', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:-8%',
      'overflow:hidden',
      'background:var(--nh-color-bg-base)',
      'transform:rotate(-2deg)',
      'pointer-events:none'
    ].join(';');

    const accentDots = document.createElement('div');
    accentDots.style.cssText = [
      'position:absolute',
      'inset:-20px',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-accent) 22%, transparent) 0 2px, transparent 2.4px)',
      'background-size:16px 16px',
      'background-position:0 0',
      'mix-blend-mode:multiply',
      'opacity:0.32',
      'will-change:transform'
    ].join(';');

    const warmDots = document.createElement('div');
    warmDots.style.cssText = [
      'position:absolute',
      'inset:0',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-warning) 18%, transparent) 0 1.6px, transparent 2px)',
      'background-size:16px 16px',
      'background-position:5px 7px',
      'mix-blend-mode:multiply',
      'opacity:0.3'
    ].join(';');

    const bands = document.createElement('div');
    bands.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:repeating-linear-gradient(112deg, transparent 0 38px, color-mix(in srgb, var(--nh-color-idle) 9%, transparent) 38px 40px, transparent 40px 78px)',
      'opacity:0.45'
    ].join(';');

    const fade = document.createElement('div');
    fade.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 50% 42%, transparent 0 34%, color-mix(in srgb, var(--nh-color-bg-base) 62%, transparent) 82%, var(--nh-color-bg-base))'
    ].join(';');

    root.append(accentDots, warmDots, bands, fade);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation;

    const start = () => {
      if (animation) return;
      animation = accentDots.animate(
        [
          { transform: 'translate3d(0,0,0)' },
          { transform: 'translate3d(16px,8px,0)' }
        ],
        {
          duration: 18000,
          direction: 'alternate',
          iterations: Infinity,
          easing: 'ease-in-out'
        }
      );
    };

    const stop = () => {
      animation?.cancel();
      animation = undefined;
    };

    const onMotionChange = () => {
      if (media.matches) stop();
      else start();
    };

    if (!media.matches) start();
    media.addEventListener('change', onMotionChange);

    return () => {
      media.removeEventListener('change', onMotionChange);
      stop();
      root.remove();
    };
  });
}
