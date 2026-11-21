/**
 * 林冠皮肤：等高线与柔和色雾，带轻微呼吸感，不干扰正文阅读。
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
      'inset:-12%',
      'background:radial-gradient(ellipse at 18% 18%, color-mix(in srgb, var(--nh-color-success) 18%, transparent), transparent 54%), radial-gradient(ellipse at 86% 72%, color-mix(in srgb, var(--nh-color-warning) 13%, transparent), transparent 58%)',
      'filter:blur(24px)',
      'opacity:0.72'
    ].join(';');

    const contours = [
      { left: '-8%', top: '-12%', width: '82%', height: '78%', duration: 26000, drift: 'rotate(3deg) scale(1.06)' },
      { right: '-14%', bottom: '-16%', width: '76%', height: '72%', duration: 32000, drift: 'rotate(-4deg) scale(1.1)' },
      { left: '24%', top: '18%', width: '62%', height: '64%', duration: 29000, drift: 'rotate(2deg) scale(1.04)' }
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
        'background:repeating-radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--nh-color-success) 17%, transparent) 0 1px, transparent 1px 22px)',
        'mask-image:radial-gradient(ellipse at 50% 50%, black 8%, transparent 76%)',
        '-webkit-mask-image:radial-gradient(ellipse at 50% 50%, black 8%, transparent 76%)',
        'opacity:0.38'
      ].join(';');
      root.appendChild(node);
      return { node, layer };
    });

    const grain = document.createElement('div');
    grain.style.cssText = [
      'position:absolute',
      'inset:0',
      'background-image:radial-gradient(circle, color-mix(in srgb, var(--nh-color-border) 22%, transparent) 0 0.7px, transparent 0.9px)',
      'background-size:4px 4px',
      'opacity:0.28'
    ].join(';');

    root.append(wash, ...contours.map((item) => item.node), grain);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];

    const start = () => {
      if (animations.length) return;
      animations = contours.map(({ node, layer }) =>
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
      );
    };

    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
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
