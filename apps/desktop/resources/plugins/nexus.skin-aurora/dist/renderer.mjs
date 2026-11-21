/**
 * 极光皮肤：用语义色叠加缓慢漂移的极光帘幕，保持内容可读性。
 */
export function activate(ctx) {
  return ctx.skins.register('aurora', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'overflow:hidden',
      'background:var(--nh-color-bg-base)',
      'pointer-events:none'
    ].join(';');

    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:absolute',
      'inset:-10%',
      'background:linear-gradient(135deg, color-mix(in srgb, var(--nh-color-accent) 14%, transparent), transparent 46%, color-mix(in srgb, var(--nh-color-idle) 12%, transparent))',
      'opacity:0.7'
    ].join(';');

    const layers = [
      {
        color: 'var(--nh-color-accent)',
        left: '-18%',
        top: '-24%',
        width: '72%',
        height: '74%',
        alpha: '38%',
        duration: 24000,
        drift: 'translate3d(10%, 6%, 0) scale(1.14)'
      },
      {
        color: 'var(--nh-color-idle)',
        right: '-20%',
        top: '-10%',
        width: '70%',
        height: '64%',
        alpha: '34%',
        duration: 30000,
        drift: 'translate3d(-12%, 9%, 0) scale(1.08)'
      },
      {
        color: 'var(--nh-color-success)',
        left: '18%',
        bottom: '-34%',
        width: '82%',
        height: '64%',
        alpha: '24%',
        duration: 27000,
        drift: 'translate3d(8%, -8%, 0) scale(1.16)'
      }
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
        `background:radial-gradient(ellipse at 50% 50%, color-mix(in srgb, ${layer.color} ${layer.alpha}, transparent), transparent 70%)`,
        'opacity:0.8',
        'will-change:transform',
        'transform:translate3d(0,0,0) scale(1)'
      ].join(';');
      root.appendChild(node);
      return { node, layer };
    });

    const veil = document.createElement('div');
    veil.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--nh-color-bg-base) 10%, transparent), color-mix(in srgb, var(--nh-color-bg-base) 76%, transparent) 78%)',
      'pointer-events:none'
    ].join(';');

    root.append(glow, ...layers.map((item) => item.node), veil);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];

    const start = () => {
      if (animations.length) return;
      animations = layers.map(({ node, layer }) =>
        node.animate(
          [
            { transform: 'translate3d(0,0,0) scale(1)' },
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
