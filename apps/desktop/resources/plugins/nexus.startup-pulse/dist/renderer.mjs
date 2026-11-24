/**
 * 启动动画：语义色光核、冲击波环、粒子爆发与字标发光，尊重减少动效偏好。
 */
export function activate(ctx) {
  return ctx.startup.register('pulse', (element, _ctx, finish) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'overflow:hidden',
      'background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--nh-color-accent) 11%, transparent), transparent 46%), var(--nh-color-bg-base)',
      'color:var(--nh-color-text-primary)',
      'pointer-events:none'
    ].join(';');

    const stage = document.createElement('div');
    stage.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center'
    ].join(';');

    const flash = document.createElement('div');
    flash.style.cssText = [
      'position:absolute',
      'width:min(110vmax, 1100px)',
      'height:min(110vmax, 1100px)',
      'border-radius:50%',
      'background:radial-gradient(circle, color-mix(in srgb, var(--nh-color-accent) 46%, transparent), transparent 64%)',
      'opacity:0',
      'will-change:opacity,transform'
    ].join(';');

    const rings = [0, 1, 2, 3].map((index) => {
      const ring = document.createElement('div');
      const size = 170 + index * 110;
      ring.style.cssText = [
        'position:absolute',
        'width:' + size + 'px',
        'height:' + size + 'px',
        'border:' + (index < 2 ? '2px' : '1px') + ' solid color-mix(in srgb, var(--nh-color-accent) ' + (62 - index * 9) + '%, transparent)',
        'border-radius:50%',
        'box-shadow:0 0 ' + (34 - index * 5) + 'px color-mix(in srgb, var(--nh-color-accent) ' + (38 - index * 7) + '%, transparent)',
        'opacity:0',
        'transform:scale(0.22)',
        'will-change:opacity,transform'
      ].join(';');
      stage.appendChild(ring);
      return ring;
    });

    const particles = Array.from({ length: 28 }, (_, index) => {
      const particle = document.createElement('div');
      const size = index % 4 === 0 ? 5 : index % 3 === 0 ? 4 : 3;
      particle.style.cssText = [
        'position:absolute',
        'left:50%',
        'top:50%',
        'width:' + size + 'px',
        'height:' + size + 'px',
        'border-radius:50%',
        'background:var(--nh-color-accent)',
        'box-shadow:0 0 12px color-mix(in srgb, var(--nh-color-accent) 62%, transparent)',
        'opacity:0',
        'will-change:opacity,transform'
      ].join(';');
      stage.appendChild(particle);
      return particle;
    });

    const orb = document.createElement('div');
    orb.style.cssText = [
      'position:relative',
      'grid-area:1 / 1',
      'z-index:2',
      'width:clamp(72px, 10vw, 104px)',
      'height:clamp(72px, 10vw, 104px)',
      'border-radius:50%',
      'background:radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--nh-color-text-primary) 72%, transparent), color-mix(in srgb, var(--nh-color-accent) 42%, transparent) 38%, transparent 72%)',
      'box-shadow:0 0 48px color-mix(in srgb, var(--nh-color-accent) 52%, transparent), inset 0 0 26px color-mix(in srgb, var(--nh-color-accent) 30%, transparent)',
      'opacity:0',
      'transform:scale(0.3)',
      'will-change:opacity,transform'
    ].join(';');

    const core = document.createElement('div');
    core.textContent = 'Nexus';
    core.style.cssText = [
      'position:relative',
      'grid-area:1 / 1',
      'z-index:3',
      'font:600 clamp(34px, 5vw, 56px)/1 var(--nh-font-sans)',
      'letter-spacing:-0.045em',
      'opacity:0',
      'filter:blur(8px)',
      'transform:translate3d(0,12px,0) scale(0.9)',
      'text-shadow:0 0 30px color-mix(in srgb, var(--nh-color-accent) 52%, transparent)',
      'will-change:opacity,filter,transform'
    ].join(';');

    const lockup = document.createElement('div');
    lockup.style.cssText = [
      'position:relative',
      'z-index:2',
      'display:grid',
      'place-items:center'
    ].join(';');
    lockup.append(orb, core);
    stage.append(flash, lockup);
    root.appendChild(stage);
    element.appendChild(root);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      core.style.cssText += ';opacity:1;filter:none;transform:none';
      orb.style.cssText += ';opacity:1;transform:scale(1)';
      rings.forEach((ring) => {
        ring.style.opacity = '0.55';
        ring.style.transform = 'scale(1)';
      });
    }

    const ringAnimations = rings.map((ring, index) =>
      ring.animate(
        [
          { opacity: 0, transform: 'scale(0.22)' },
          { opacity: 0.95, offset: 0.18, transform: 'scale(0.72)' },
          { opacity: 0, transform: 'scale(2.15)' }
        ],
        {
          duration: 1500,
          delay: 80 + index * 150,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both'
        }
      )
    );
    const particleAnimations = particles.map((particle, index) => {
      const angle = (index / particles.length) * Math.PI * 2 + (index % 3) * 0.18;
      const distance = 110 + (index % 6) * 28;
      return particle.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.2)' },
          {
            opacity: 0.95,
            offset: 0.16,
            transform:
              'translate(-50%, -50%) rotate(' +
              (angle * 180) / Math.PI +
              'deg) translateY(-' +
              distance * 0.24 +
              'px) scale(1.45)'
          },
          {
            opacity: 0,
            transform:
              'translate(-50%, -50%) rotate(' +
              (angle * 180) / Math.PI +
              'deg) translateY(-' +
              distance +
              'px) scale(0.3)'
          }
        ],
        {
          duration: 980,
          delay: 170 + (index % 7) * 24,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both'
        }
      );
    });

    const animations = reduceMotion
      ? []
      : [
          root.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 300,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'both'
          }),
          flash.animate(
            [
              { opacity: 0, transform: 'scale(0.32)' },
              { opacity: 0.9, offset: 0.14, transform: 'scale(0.7)' },
              { opacity: 0, transform: 'scale(1.08)' }
            ],
            {
              duration: 900,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          orb.animate(
            [
              { opacity: 0, transform: 'scale(0.3)' },
              { opacity: 1, offset: 0.3, transform: 'scale(1.16)' },
              { opacity: 0.92, offset: 0.58, transform: 'scale(0.96)' },
              { opacity: 0, transform: 'scale(2.5)' }
            ],
            {
              duration: 1100,
              delay: 120,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          core.animate(
            [
              { opacity: 0, filter: 'blur(8px)', transform: 'translate3d(0,12px,0) scale(0.9)' },
              { opacity: 1, filter: 'blur(0)', transform: 'translate3d(0,0,0) scale(1.04)', offset: 0.5 },
              { opacity: 1, filter: 'blur(0)', transform: 'translate3d(0,0,0) scale(1)' }
            ],
            {
              duration: 900,
              delay: 300,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both'
            }
          ),
          ...ringAnimations,
          ...particleAnimations,
          root.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 500,
            delay: 2300,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'forwards'
          })
        ];

    const timer = setTimeout(finish, reduceMotion ? 620 : 2800);
    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      root.remove();
    };
  });
}
