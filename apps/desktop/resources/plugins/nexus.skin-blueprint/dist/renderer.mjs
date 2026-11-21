/**
 * 蓝图皮肤：工程网格与跟随指针的十字准星，强调坐标感与秩序。
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
      'background-image:linear-gradient(color-mix(in srgb, var(--nh-color-border) 62%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--nh-color-border) 62%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--nh-color-accent) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--nh-color-accent) 10%, transparent) 1px, transparent 1px)',
      'background-size:28px 28px, 28px 28px, 140px 140px, 140px 140px',
      'mask-image:radial-gradient(ellipse at 50% 42%, black 12%, color-mix(in srgb, black 42%, transparent) 52%, transparent 88%)',
      '-webkit-mask-image:radial-gradient(ellipse at 50% 42%, black 12%, color-mix(in srgb, black 42%, transparent) 52%, transparent 88%)',
      'opacity:0.72'
    ].join(';');

    const tint = document.createElement('div');
    tint.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:radial-gradient(ellipse at 72% 18%, color-mix(in srgb, var(--nh-color-accent) 9%, transparent), transparent 56%)'
    ].join(';');

    const cross = document.createElement('div');
    cross.style.cssText = 'position:absolute;inset:0;opacity:0.55;transition:opacity 180ms ease';

    const vertical = document.createElement('div');
    vertical.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:1px',
      'height:100%',
      'background:linear-gradient(to bottom, transparent, color-mix(in srgb, var(--nh-color-accent) 55%, transparent) 24%, color-mix(in srgb, var(--nh-color-accent) 55%, transparent) 76%, transparent)',
      'transform:translate3d(-100px,0,0)'
    ].join(';');

    const horizontal = document.createElement('div');
    horizontal.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:1px',
      'background:linear-gradient(to right, transparent, color-mix(in srgb, var(--nh-color-accent) 55%, transparent) 24%, color-mix(in srgb, var(--nh-color-accent) 55%, transparent) 76%, transparent)',
      'transform:translate3d(0,-100px,0)'
    ].join(';');

    cross.append(vertical, horizontal);
    root.append(tint, grid, cross);
    element.appendChild(root);

    let frameId;
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

    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', move);
      root.remove();
    };
  });
}
