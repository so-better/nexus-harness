/**
 * 启动动画：轨道光点汇聚、中心光核点亮与字标显现，尊重减少动效偏好。
 */
export function activate(ctx) {
  return ctx.startup.register('orbit', (element, _ctx, finish) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'overflow:hidden',
      'background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--nh-color-accent) 8%, transparent), transparent 44%), var(--nh-color-bg-base)',
      'color:var(--nh-color-text-primary)',
      'pointer-events:none'
    ].join(';');

    const stage = document.createElement('div');
    stage.style.cssText = [
      'position:relative',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'width:min(420px, 72vw)',
      'height:min(420px, 72vw)'
    ].join(';');

    const sweep = document.createElement('div');
    sweep.style.cssText = [
      'position:absolute',
      'inset:-18%',
      'border-radius:50%',
      'background:conic-gradient(from 0deg, transparent, color-mix(in srgb, var(--nh-color-accent) 30%, transparent), transparent 38%, transparent 68%, color-mix(in srgb, var(--nh-color-idle) 18%, transparent), transparent)',
      'filter:blur(18px)',
      'opacity:0.62',
      'will-change:transform,opacity',
      'transform:rotate(0deg) scale(0.9)'
    ].join(';');

    const orbits = [
      { size: 156, duration: 2100, delay: 0, direction: 'normal' },
      { size: 236, duration: 2500, delay: 120, direction: 'reverse' },
      { size: 318, duration: 2800, delay: 240, direction: 'normal' }
    ].map((orbit) => {
      const node = document.createElement('div');
      node.style.cssText = [
        'position:absolute',
        'width:' + orbit.size + 'px',
        'height:' + orbit.size + 'px',
        'border:1px solid color-mix(in srgb, var(--nh-color-accent) ' + (32 - orbit.size / 24) + '%, transparent)',
        'border-radius:50%',
        'box-shadow:0 0 20px color-mix(in srgb, var(--nh-color-accent) 12%, transparent)',
        'opacity:0',
        'transform:rotate(0deg) scale(0.78)',
        'will-change:opacity,transform'
      ].join(';');

      const satellite = document.createElement('div');
      satellite.style.cssText = [
        'position:absolute',
        'left:50%',
        'top:-3px',
        'width:6px',
        'height:6px',
        'margin-left:-3px',
        'border-radius:50%',
        'background:var(--nh-color-accent)',
        'box-shadow:0 0 14px color-mix(in srgb, var(--nh-color-accent) 72%, transparent)'
      ].join(';');
      node.appendChild(satellite);
      stage.appendChild(node);
      return { node, orbit };
    });

    const halo = document.createElement('div');
    halo.style.cssText = [
      'position:absolute',
      'width:188px',
      'height:188px',
      'border-radius:50%',
      'background:radial-gradient(circle, color-mix(in srgb, var(--nh-color-accent) 28%, transparent), transparent 64%)',
      'filter:blur(16px)',
      'opacity:0',
      'transform:scale(0.6)',
      'will-change:opacity,transform'
    ].join(';');

    const core = document.createElement('div');
    core.textContent = 'Nexus';
    core.style.cssText = [
      'position:relative',
      'z-index:1',
      'font:600 clamp(34px, 5vw, 54px)/1 var(--nh-font-sans)',
      'letter-spacing:-0.045em',
      'opacity:0',
      'filter:blur(8px)',
      'transform:translate3d(0,10px,0) scale(0.92)',
      'text-shadow:0 0 28px color-mix(in srgb, var(--nh-color-accent) 34%, transparent)',
      'will-change:opacity,filter,transform'
    ].join(';');

    stage.append(sweep, halo, ...orbits.map((item) => item.node), core);
    root.appendChild(stage);
    element.appendChild(root);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      core.style.cssText += ';opacity:1;filter:none;transform:none';
      halo.style.cssText += ';opacity:0.42;transform:scale(1)';
      orbits.forEach(({ node }) => {
        node.style.opacity = '0.55';
        node.style.transform = 'rotate(0deg) scale(1)';
      });
    }

    const animations = reduceMotion
      ? []
      : [
          root.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'both'
          }),
          sweep.animate(
            [
              { transform: 'rotate(0deg) scale(0.9)', opacity: 0.18 },
              { transform: 'rotate(280deg) scale(1.06)', opacity: 0.76, offset: 0.7 },
              { transform: 'rotate(360deg) scale(1.02)', opacity: 0.24 }
            ],
            {
              duration: 2200,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          halo.animate(
            [
              { opacity: 0, transform: 'scale(0.5)' },
              { opacity: 0.66, offset: 0.5, transform: 'scale(1.14)' },
              { opacity: 0.2, transform: 'scale(1.5)' }
            ],
            {
              duration: 1500,
              delay: 160,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          ...orbits.map(({ node, orbit }) =>
            node.animate(
              [
                { opacity: 0, transform: 'rotate(0deg) scale(0.78)' },
                { opacity: 0.82, offset: 0.35, transform: 'rotate(150deg) scale(1)' },
                { opacity: 0.55, transform: 'rotate(330deg) scale(1.06)' }
              ],
              {
                duration: orbit.duration,
                delay: orbit.delay,
                direction: orbit.direction,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                fill: 'both'
              }
            )
          ),
          core.animate(
            [
              { opacity: 0, filter: 'blur(8px)', transform: 'translate3d(0,10px,0) scale(0.92)' },
              { opacity: 1, filter: 'blur(0)', transform: 'translate3d(0,0,0) scale(1.03)', offset: 0.56 },
              { opacity: 1, filter: 'blur(0)', transform: 'translate3d(0,0,0) scale(1)' }
            ],
            {
              duration: 920,
              delay: 360,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          root.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 480,
            delay: 2020,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'forwards'
          })
        ];

    const timer = setTimeout(finish, reduceMotion ? 650 : 2500);
    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      root.remove();
    };
  });
}
