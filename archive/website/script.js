/**
 * Nexus 宣传页脚本：主题切换、首屏粒子网络、滚动进场、卡片指针聚光。
 * 遵循 prefers-reduced-motion。
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 主题 */
  var KEY = 'nexus-site-theme';
  var toggle = document.getElementById('themeToggle');
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  var current = function () {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  };
  var applyTheme = function (theme) {
    root.setAttribute('data-theme', theme);
    if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  };
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  }
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  if (!stored && mq.addEventListener) {
    mq.addEventListener('change', function (event) { applyTheme(event.matches ? 'light' : 'dark'); });
  }

  /* 滚动进场 */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], [data-reveal-group]'));
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* 卡片指针聚光 */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    Array.prototype.slice.call(document.querySelectorAll('.tile, .dl')).forEach(function (el) {
      el.addEventListener('pointermove', function (event) {
        var rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', event.clientX - rect.left + 'px');
        el.style.setProperty('--my', event.clientY - rect.top + 'px');
      });
    });
  }

  /* 首屏粒子网络 */
  var hero = document.querySelector('.hero');
  var canvas = document.querySelector('.bg-fx');
  if (!hero || !canvas || reduced) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var width = 0, height = 0, points = [], running = true;
  var pointer = { x: -9999, y: -9999 };
  var colors = { accent: '#7fb6ff', idle: '#a9cbff' };
  var palette = function () {
    var s = getComputedStyle(root);
    return {
      accent: s.getPropertyValue('--accent').trim() || '#7fb6ff',
      idle: s.getPropertyValue('--accent-2').trim() || '#a9cbff'
    };
  };
  colors = palette();
  var resize = function () {
    var rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(80, Math.round((width * height) / 18000));
    points = [];
    for (var i = 0; i < count; i += 1) {
      points.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.26, vy: (Math.random() - 0.5) * 0.26, r: 1 + Math.random() * 1.4 });
    }
  };
  var draw = function () {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    var link = 128;
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      var dxm = p.x - pointer.x, dym = p.y - pointer.y, dm = Math.hypot(dxm, dym);
      if (dm < 120 && dm > 0.01) { p.x += (dxm / dm) * 0.6; p.y += (dym / dm) * 0.6; }
      for (var j = i + 1; j < points.length; j += 1) {
        var q = points[j], d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < link) {
          ctx.globalAlpha = (1 - d / link) * 0.28;
          ctx.strokeStyle = colors.accent; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = p.r > 1.8 ? colors.idle : colors.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  };
  hero.addEventListener('pointermove', function (event) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
  }, { passive: true });
  hero.addEventListener('pointerleave', function () { pointer.x = -9999; pointer.y = -9999; });
  window.addEventListener('visibilitychange', function () { running = !document.hidden; if (running) requestAnimationFrame(draw); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);
  new MutationObserver(function () { colors = palette(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
  requestAnimationFrame(draw);
})();
