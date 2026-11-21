/**
 * 林冠皮肤：低对比等高线、漂移色雾与极慢呼吸，提供安静但不空洞的环境背景。
 */
export function activate(ctx) {
  return ctx.skins.register('canopy', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'overflow:hidden',
      'background:var(--nh-color-bg-base)',
      'pointer-events:none'
    ].join(';');

    const wash = document.createElement('div');
    wash.style.cssText = [
      'position:absolute',
      'inset:-16%',
      'background:radial-gradient(ellipse at 16% 14%, color-mix(in srgb, var(--nh-color-success) 34%, transparent), transparent 58%), radial-gradient(ellipse at 86% 78%, color-mix(in srgb, var(--nh-color-warning) 24%, transparent), transparent 62%)',
      'filter:blur(18px)',
      'opacity:0.84',
      'will-change:transform,opacity',
      'transform:translate3d(0,0,0) scale(1)'
    ].join(';');

    const disc = document.createElement('div');
    disc.style.cssText = [
      'position:absolute',
      'right:10%',
      'top:8%',
      'width:212px',
      'height:212px',
      'border-radius:50%',
      'background:radial-gradient(circle, color-mix(in srgb, var(--nh-color-warning) 32%, transparent), color-mix(in srgb, var(--nh-color-warning) 8%, transparent) 62%, transparent 72%)',
      'filter:blur(4px)',
      'opacity:0.8'
    ].join(';');

    const contours = [
      { left: '-10%', top: '-16%', width: '88%', height: '82%', duration: 42000, drift: 'rotate(2deg) scale(1.04)' },
      { right: '-18%', bottom: '-20%', width: '84%', height: '78%', duration: 52000, drift: 'rotate(-3deg) scale(1.08)' },
      { left: '22%', top: '16%', width: '68%', height: '68%', duration: 46000, drift: 'rotate(1deg) scale(1.03)' }
    ].map((layer) => {
      const node = document.createElement('div');
      node.style.cssText = [
        'position:absolute',
        `left:${layer.left ?? 'auto'}`,
        `right:${layer.right ?? 'auto'}`,
        `top:${layer.top ?? 'auto'}`,
        `bottom:${layer.bottom ?? 'auto'}`,
        `width:${layer.width}`,
        `height:${layer.height}`,
        'border-radius:50%',
        'background:repeating-radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--nh-color-success) 30%, transparent) 0 1px, transparent 1px 22px)',
        'mask-image:radial-gradient(ellipse at 50% 50%, black 12%, transparent 82%)',
        '-webkit-mask-image:radial-gradient(ellipse at 50% 50%, black 12%, transparent 82%)',
        'opacity:0.44',
        'will-change:transform'
      ].join(';');
      root.appendChild(node);
      return { node, layer };
    });

    const dust = document.createElement('div');
    dust.style.cssText = [
      'position:absolute',
      'inset:-10%',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-success) 32%, transparent) 0 1px, transparent 1.4px)',
      'background-size:96px 96px',
      'opacity:0.26',
      'will-change:transform',
      'transform:translate3d(0,0,0)'
    ].join(';');

    const grain = document.createElement('div');
    grain.style.cssText = [
      'position:absolute',
      'inset:0',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-border) 24%, transparent) 0 0.7px, transparent 0.9px)',
      'background-size:4px 4px',
      'opacity:0.2'
    ].join(';');

    root.append(wash, disc, ...contours.map((item) => item.node), dust, grain);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];

    const start = () => {
      if (animations.length) return;
      animations = [
        wash.animate(
          [
            { transform: 'translate3d(0,0,0) scale(1)', opacity: 0.76 },
            { transform: 'translate3d(2%, -1.5%, 0) scale(1.06)', opacity: 0.92 }
          ],
          {
            duration: 36000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        dust.animate(
          [
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(-24px,16px,0)' }
          ],
          {
            duration: 48000,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'ease-in-out'
          }
        ),
        ...contours.map(({ node, layer }) =>
          node.animate(
            [
              { transform: 'rotate(0deg) scale(1)' },
              { transform: layer.drift }
            ],
            {
              duration: layer.duration,
              direction: 'alternate',
              iterations: Infinity,
              easing: 'ease-in-out'
            }
          )
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
          duration: 900,
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
