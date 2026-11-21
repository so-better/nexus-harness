/**
 * 极光皮肤：高饱和语义色极光帘幕、缓慢旋转与指针视差，强调色彩与纵深。
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

    const stage = document.createElement('div');
    stage.style.cssText = [
      'position:absolute',
      'inset:-6%',
      'will-change:transform',
      'transform:translate3d(0,0,0) scale(1.02)'
    ].join(';');

    const hue = document.createElement('div');
    hue.style.cssText = [
      'position:absolute',
      'inset:-24%',
      'border-radius:50%',
      'background:conic-gradient(from 210deg at 50% 50%, color-mix(in srgb, var(--nh-color-accent) 62%, transparent), color-mix(in srgb, var(--nh-color-idle) 48%, transparent), color-mix(in srgb, var(--nh-color-success) 34%, transparent), color-mix(in srgb, var(--nh-color-warning) 28%, transparent), color-mix(in srgb, var(--nh-color-accent) 52%, transparent))',
      'filter:blur(24px)',
      'opacity:0.78',
      'will-change:transform,opacity',
      'transform:rotate(0deg) scale(1.08)'
    ].join(';');

    const layers = [
      {
        color: 'var(--nh-color-accent)',
        left: '-20%',
        top: '-28%',
        width: '76%',
        height: '78%',
        alpha: '76%',
        duration: 18000,
        drift: 'translate3d(12%, 7%, 0) scale(1.2)'
      },
      {
        color: 'var(--nh-color-idle)',
        right: '-22%',
        top: '-18%',
        width: '72%',
        height: '68%',
        alpha: '68%',
        duration: 22000,
        drift: 'translate3d(-14%, 10%, 0) scale(1.14)'
      },
      {
        color: 'var(--nh-color-danger)',
        left: '22%',
        bottom: '-38%',
        width: '88%',
        height: '70%',
        alpha: '44%',
        duration: 26000,
        drift: 'translate3d(10%, -10%, 0) scale(1.24)'
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
        `background:radial-gradient(ellipse at 50% 50%, color-mix(in srgb, ${layer.color} ${layer.alpha}, transparent), transparent 72%)`,
        'filter:blur(18px)',
        'opacity:0.92',
        'will-change:transform',
        'transform:translate3d(0,0,0) scale(1)'
      ].join(';');
      stage.appendChild(node);
      return { node, layer };
    });

    const veil = document.createElement('div');
    veil.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 50% 44%, transparent 18%, color-mix(in srgb, var(--nh-color-bg-base) 28%, transparent) 82%)'
    ].join(';');

    root.append(stage, veil);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [];
    let frameId;
    let targetX = 0;
    let targetY = 0;

    const applyParallax = () => {
      frameId = undefined;
      stage.style.transform = `translate3d(${targetX}px,${targetY}px,0) scale(1.02)`;
    };

    const move = (event) => {
      if (media.matches) return;
      targetX = (event.clientX / window.innerWidth - 0.5) * -20;
      targetY = (event.clientY / window.innerHeight - 0.5) * -14;
      if (frameId === undefined) frameId = requestAnimationFrame(applyParallax);
    };

    const start = () => {
      if (animations.length) return;
      animations = [
        hue.animate(
          [
            { transform: 'rotate(0deg) scale(1.08)', opacity: 0.62 },
            { transform: 'rotate(360deg) scale(1.08)', opacity: 0.9 }
          ],
          { duration: 60000, iterations: Infinity, easing: 'linear' }
        ),
        ...layers.map(({ node, layer }) =>
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
        )
      ];
    };

    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };

    const onMotionChange = () => {
      if (media.matches) {
        stop();
        stage.style.transform = 'translate3d(0,0,0) scale(1.02)';
      } else {
        start();
      }
    };

    window.addEventListener('pointermove', move, { passive: true });
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
      window.removeEventListener('pointermove', move);
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      entrance?.cancel();
      stop();
      root.remove();
    };
  });
}
