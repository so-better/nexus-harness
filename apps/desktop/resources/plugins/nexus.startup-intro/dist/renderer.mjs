/**
 * 启动动画示例：语义色淡入字标与一条展开线，尊重减少动效偏好。
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
      'gap:18px',
      'background:var(--nh-color-bg-base)',
      'color:var(--nh-color-text-primary)',
      'pointer-events:none'
    ].join(';');

    const wordmark = document.createElement('div');
    wordmark.textContent = 'Nexus';
    wordmark.style.cssText = [
      'font:600 clamp(28px, 5vw, 52px)/1 var(--nh-font-sans)',
      'letter-spacing:-0.035em',
      'opacity:0',
      'transform:translate3d(0,8px,0)'
    ].join(';');

    const line = document.createElement('div');
    line.style.cssText = [
      'width:min(180px, 24vw)',
      'height:1px',
      'background:var(--nh-color-border)',
      'transform:scaleX(0)',
      'transform-origin:center'
    ].join(';');

    root.append(wordmark, line);
    element.appendChild(root);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      wordmark.style.opacity = '1';
      wordmark.style.transform = 'none';
      line.style.transform = 'scaleX(1)';
    }

    const animations = reduceMotion
      ? []
      : [
          wordmark.animate(
            [
              { opacity: 0, transform: 'translate3d(0,8px,0)' },
              { opacity: 1, transform: 'translate3d(0,0,0)' }
            ],
            { duration: 520, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }
          ),
          line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
            duration: 700,
            delay: 160,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'forwards'
          })
        ];

    const timer = setTimeout(finish, reduceMotion ? 260 : 1200);
    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      root.remove();
    };
  });
}
