/**
 * 蓝图皮肤：高对比工程网格、扫描线与跟随指针的十字准星。
 */
export function activate(ctx) {
  return ctx.skins.register('blueprint', (element) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:absolute',
      'inset:0',
      'overflow:hidden',
      'background:var(--nh-color-bg-base)',
      'pointer-events:none'
    ].join(';');

    const grid = document.createElement('div');
    grid.style.cssText = [
      'position:absolute',
      'inset:-2px',
      'background-image:linear-gradient(color-mix(in srgb, var(--nh-color-border) 82%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--nh-color-border) 82%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--nh-color-accent) 24%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--nh-color-accent) 24%, transparent) 1px, transparent 1px), linear-gradient(45deg, color-mix(in srgb, var(--nh-color-accent) 10%, transparent) 1px, transparent 1px)',
      'background-size:28px 28px, 28px 28px, 140px 140px, 140px 140px, 140px 140px',
      'mask-image:radial-gradient(ellipse at 50% 46%, black 22%, color-mix(in srgb, black 48%, transparent) 60%, transparent 94%)',
      '-webkit-mask-image:radial-gradient(ellipse at 50% 46%, black 22%, color-mix(in srgb, black 48%, transparent) 60%, transparent 94%)',
      'opacity:0.9'
    ].join(';');

    const tint = document.createElement('div');
    tint.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 76% 14%, color-mix(in srgb, var(--nh-color-accent) 20%, transparent), transparent 56%)'
    ].join(';');

    const scan = document.createElement('div');
    scan.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'top:-24%',
      'height:24%',
      'background:linear-gradient(to bottom, transparent, color-mix(in srgb, var(--nh-color-accent) 20%, transparent), transparent)',
      'opacity:0.62',
      'will-change:transform',
      'transform:translate3d(0,-20%,0)'
    ].join(';');

    const cross = document.createElement('div');
    cross.style.cssText = 'position:absolute;inset:0;opacity:0.78';

    const vertical = document.createElement('div');
    vertical.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:1px',
      'height:100%',
      'background:linear-gradient(to bottom, transparent, color-mix(in srgb, var(--nh-color-accent) 86%, transparent) 18%, color-mix(in srgb, var(--nh-color-accent) 86%, transparent) 82%, transparent)',
      'transform:translate3d(-100px,0,0)'
    ].join(';');

    const horizontal = document.createElement('div');
    horizontal.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:1px',
      'background:linear-gradient(to right, transparent, color-mix(in srgb, var(--nh-color-accent) 86%, transparent) 18%, color-mix(in srgb, var(--nh-color-accent) 86%, transparent) 82%, transparent)',
      'transform:translate3d(0,-100px,0)'
    ].join(';');

    cross.append(vertical, horizontal);
    root.append(tint, grid, scan, cross);
    element.appendChild(root);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frameId;
    let scanAnimation;
    let pointerX = -100;
    let pointerY = -100;

    const applyPointer = () => {
      frameId = undefined;
      vertical.style.transform = `translate3d(${pointerX}px,0,0)`;
      horizontal.style.transform = `translate3d(0,${pointerY}px,0)`;
    };

    const move = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frameId === undefined) frameId = requestAnimationFrame(applyPointer);
    };

    const startScan = () => {
      if (scanAnimation) return;
      scanAnimation = scan.animate(
        [
          { transform: 'translate3d(0,-120%,0)' },
          { transform: 'translate3d(0,520%,0)' }
        ],
        { duration: 15000, iterations: Infinity, easing: 'linear' }
      );
    };

    const stopScan = () => {
      scanAnimation?.cancel();
      scanAnimation = undefined;
    };

    const onMotionChange = () => {
      if (media.matches) stopScan();
      else startScan();
    };

    window.addEventListener('pointermove', move, { passive: true });
    const entrance = media.matches
      ? undefined
      : root.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 500,
          easing: 'ease-out'
        });

    if (!media.matches) startScan();
    media.addEventListener('change', onMotionChange);

    return () => {
      media.removeEventListener('change', onMotionChange);
      window.removeEventListener('pointermove', move);
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      entrance?.cancel();
      stopScan();
      root.remove();
    };
  });
}
