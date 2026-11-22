/**
 * 启动动画示例：语义色字标淡入、细线展开与柔和淡出，尊重减少动效偏好。
 */
export function activate(ctx) {
  return ctx.startup.register('fade', (element, _ctx, finish) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:22px',
      'background:radial-gradient(ellipse at 50% 46%, color-mix(in srgb, var(--nh-color-accent) 9%, transparent), transparent 58%), var(--nh-color-bg-base)',
      'color:var(--nh-color-text-primary)',
      'pointer-events:none'
    ].join(';');

    const wordmark = document.createElement('div');
    wordmark.textContent = 'Nexus';
    wordmark.style.cssText = [
      'font:600 clamp(36px, 5vw, 58px)/1 var(--nh-font-sans)',
      'letter-spacing:-0.045em',
      'opacity:0',
      'filter:blur(8px)',
      'transform:translate3d(0,12px,0) scale(0.985)',
      'will-change:opacity,filter,transform'
    ].join(';');

    const line = document.createElement('div');
    line.style.cssText = [
      'width:min(220px, 28vw)',
      'height:1px',
      'background:linear-gradient(90deg, transparent, var(--nh-color-accent), transparent)',
      'transform:scaleX(0)',
      'transform-origin:center',
      'will-change:transform'
    ].join(';');

    root.append(wordmark, line);
    element.appendChild(root);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      wordmark.style.cssText += ';opacity:1;filter:none;transform:none';
      line.style.transform = 'scaleX(1)';
    }

    const animations = reduceMotion
      ? []
      : [
          root.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 600,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'both'
          }),
          wordmark.animate(
            [
              { opacity: 0, filter: 'blur(8px)', transform: 'translate3d(0,12px,0) scale(0.985)' },
              { opacity: 1, filter: 'blur(0)', transform: 'translate3d(0,0,0) scale(1)' }
            ],
            {
              duration: 1100,
              delay: 220,
              easing: 'cubic-bezier(0.2, 0, 0, 1)',
              fill: 'both'
            }
          ),
          line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
            duration: 900,
            delay: 780,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'both'
          }),
          root.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 650,
            delay: 1900,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'forwards'
          })
        ];

    const timer = setTimeout(finish, reduceMotion ? 600 : 2600);
    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      root.remove();
    };
  });
}
