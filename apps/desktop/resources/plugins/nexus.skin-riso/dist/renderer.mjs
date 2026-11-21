/**
 * 孔版皮肤：高饱和双色网点、错位色块与不同速度的印刷层，强调平面张力。
 */
export function activate(ctx) {
  return ctx.skins.register('riso', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:-10%',
      'overflow:hidden',
      'background:var(--nh-color-bg-base)',
      'transform:rotate(-2deg)',
      'pointer-events:none'
    ].join(';');

    const accentBlock = document.createElement('div');
    accentBlock.style.cssText = [
      'position:absolute',
      'right:-12%',
      'top:-18%',
      'width:58%',
      'height:76%',
      'border-radius:50%',
      'background:color-mix(in srgb, var(--nh-color-accent) 32%, transparent)',
      'opacity:0.62',
      'will-change:transform,opacity',
      'transform:translate3d(0,0,0) scale(1)'
    ].join(';');

    const warmBlock = document.createElement('div');
    warmBlock.style.cssText = [
      'position:absolute',
      'left:-10%',
      'bottom:-24%',
      'width:54%',
      'height:68%',
      'border-radius:50%',
      'background:color-mix(in srgb, var(--nh-color-warning) 28%, transparent)',
      'opacity:0.58',
      'will-change:transform,opacity',
      'transform:translate3d(0,0,0) scale(1)'
    ].join(';');

    const accentDots = document.createElement('div');
    accentDots.style.cssText = [
      'position:absolute',
      'inset:-24px',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-accent) 42%, transparent) 0 2.4px, transparent 2.8px)',
      'background-size:16px 16px',
      'background-position:0 0',
      'opacity:0.52',
      'will-change:transform'
    ].join(';');

    const warmDots = document.createElement('div');
    warmDots.style.cssText = [
      'position:absolute',
      'inset:-16px',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-warning) 34%, transparent) 0 1.8px, transparent 2.2px)',
      'background-size:16px 16px',
      'background-position:5px 7px',
      'opacity:0.48',
      'will-change:transform'
    ].join(';');

    const bands = document.createElement('div');
    bands.style.cssText = [
      'position:absolute',
      'inset:-8%',
      'background:repeating-linear-gradient(112deg, transparent 0 36px, color-mix(in srgb, var(--nh-color-idle) 18%, transparent) 36px 40px, transparent 40px 76px)',
      'opacity:0.55',
      'will-change:transform',
      'transform:rotate(0deg)'
    ].join(';');

    const fade = document.createElement('div');
    fade.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 50% 42%, transparent 0 38%, color-mix(in srgb, var(--nh-color-bg-base) 38%, transparent) 78%, var(--nh-color-bg-base))'
    ].join(';');

    root.append(accentBlock, warmBlock, accentDots, warmDots, bands, fade);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];

    const start = () => {
      if (animations.length) return;
      animations = [
        accentDots.animate(
          [
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(16px,8px,0)' }
          ],
          {
            duration: 16000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        warmDots.animate(
          [
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(-12px,10px,0)' }
          ],
          {
            duration: 23000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        accentBlock.animate(
          [
            { transform: 'translate3d(0,0,0) scale(1)', opacity: 0.54 },
            { transform: 'translate3d(-2%,3%,0) scale(1.06)', opacity: 0.72 }
          ],
          {
            duration: 28000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        warmBlock.animate(
          [
            { transform: 'translate3d(0,0,0) scale(1)', opacity: 0.48 },
            { transform: 'translate3d(3%,-2%,0) scale(1.05)', opacity: 0.68 }
          ],
          {
            duration: 32000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        bands.animate(
          [{ transform: 'rotate(-0.8deg)' }, { transform: 'rotate(0.8deg)' }],
          {
            duration: 36000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        )
      ];
    };

    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };

    const onMotionChange = () => {
      if (media.matches) stop();
      else start();
    };

    const entrance = media.matches
      ? undefined
      : root.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 650,
          easing: 'ease-out'
        });

    if (!media.matches) start();
    media.addEventListener('change', onMotionChange);

    return () => {
      media.removeEventListener('change', onMotionChange);
      entrance?.cancel();
      stop();
      root.remove();
    };
  });
}
