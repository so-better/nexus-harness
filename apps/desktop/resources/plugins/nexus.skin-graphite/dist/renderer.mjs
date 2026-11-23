/**
 * 石墨皮肤：低对比纸面、细颗粒、极淡网格与缓慢扫光，强调长时间工作时的安静感。
 */
export function activate(ctx) {
  return ctx.skins.register('graphite', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:-8%',
      'overflow:hidden',
      'background:color-mix(in srgb, var(--nh-color-bg-base) 92%, var(--nh-color-text-primary)), radial-gradient(ellipse at 22% 8%, color-mix(in srgb, var(--nh-color-text-primary) 8%, transparent), transparent 58%), radial-gradient(ellipse at 84% 92%, color-mix(in srgb, var(--nh-color-text-secondary) 7%, transparent), transparent 62%)',
      'pointer-events:none'
    ].join(';');

    const grain = document.createElement('div');
    grain.style.cssText = [
      'position:absolute',
      'inset:-16px',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-text-primary) 34%, transparent) 0 0.7px, transparent 1px)',
      'background-size:3px 3px',
      'opacity:0.24',
      'will-change:transform',
      'transform:translate3d(0,0,0)'
    ].join(';');

    const grid = document.createElement('div');
    grid.style.cssText = [
      'position:absolute',
      'inset:0',
      'background-image:linear-gradient(color-mix(in srgb, var(--nh-color-text-primary) 13%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--nh-color-text-primary) 13%, transparent) 1px, transparent 1px)',
      'background-size:48px 48px',
      'mask-image:radial-gradient(ellipse at 50% 45%, black 18%, color-mix(in srgb, black 38%, transparent) 64%, transparent 96%)',
      '-webkit-mask-image:radial-gradient(ellipse at 50% 45%, black 18%, color-mix(in srgb, black 38%, transparent) 64%, transparent 96%)',
      'opacity:0.46'
    ].join(';');

    const weave = document.createElement('div');
    weave.style.cssText = [
      'position:absolute',
      'inset:-18%',
      'background:repeating-linear-gradient(116deg, transparent 0 56px, color-mix(in srgb, var(--nh-color-text-primary) 9%, transparent) 56px 58px, transparent 58px 112px)',
      'opacity:0.58',
      'will-change:transform',
      'transform:rotate(0deg)'
    ].join(';');

    const sheen = document.createElement('div');
    sheen.style.cssText = [
      'position:absolute',
      'top:-34%',
      'left:-16%',
      'width:82%',
      'height:92%',
      'border-radius:50%',
      'background:radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--nh-color-text-primary) 13%, transparent), transparent 68%)',
      'filter:blur(28px)',
      'opacity:0.62',
      'will-change:transform,opacity',
      'transform:translate3d(0,0,0) scale(1)'
    ].join(';');

    const vignette = document.createElement('div');
    vignette.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 50% 44%, transparent 26%, color-mix(in srgb, var(--nh-color-text-primary) 7%, transparent) 72%, color-mix(in srgb, var(--nh-color-text-primary) 12%, transparent) 100%)'
    ].join(';');

    root.append(sheen, weave, grid, grain, vignette);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];

    const start = () => {
      if (animations.length) return;
      animations = [
        sheen.animate(
          [
            { transform: 'translate3d(-2%,0,0) scale(1)', opacity: 0.28 },
            { transform: 'translate3d(10%,4%,0) scale(1.14)', opacity: 0.82 }
          ],
          {
            duration: 28000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        grain.animate(
          [
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(3px,-2px,0)' }
          ],
          {
            duration: 18000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'linear'
          }
        ),
        weave.animate(
          [{ transform: 'rotate(-0.4deg)' }, { transform: 'rotate(0.4deg)' }],
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
          duration: 700,
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
