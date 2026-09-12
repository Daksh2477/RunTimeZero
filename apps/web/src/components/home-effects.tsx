'use client';

import { useEffect, useRef, useState } from 'react';

export function HomeEffects() {
  const trail = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const media = matchMedia('(pointer: fine) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    const update = () => setAvailable(media.matches);
    update(); media.addEventListener('change', update);
    try { setEnabled(localStorage.getItem('algacarbon.algae-trail') !== 'off'); } catch { /* Session-only preference. */ }
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const home = document.querySelector('.home');
    if (!home || !('IntersectionObserver' in window)) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (media.matches) continue;
        // Animate only on arrival. Content is visible in CSS, without JS,
        // or if observation/animation fails; no hidden-until-hydrated state.
        const animation = entry.target.animate([
          { opacity: .25, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 580, easing: 'cubic-bezier(.2,.65,.3,1)' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: .08 });
    home.querySelectorAll('.home-section-heading, .home-steps article, .audience-explorer, .home-trust-list article, .home-faq details, .home-final, .home-launch-card').forEach(el => observer.observe(el));
    const stop = () => { for (const animation of animations) animation.cancel(); animations.clear(); };
    const onPreference = () => { if (media.matches) stop(); };
    home.addEventListener('focusin', stop);
    media.addEventListener('change', onPreference);
    return () => { observer.disconnect(); stop(); home.removeEventListener('focusin', stop); media.removeEventListener('change', onPreference); };
  }, []);

  useEffect(() => {
    const home = document.querySelector<HTMLElement>('.home');
    const dots = Array.from(trail.current?.children ?? []) as HTMLElement[];
    if (!available || !enabled || !home || !dots.length) return;
    let last = 0, index = 0;
    const animations = new Map<HTMLElement, Animation>();
    const stop = () => { animations.forEach(animation => animation.cancel()); animations.clear(); };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || performance.now() - last < 55) return;
      if ((event.target as Element).closest('button, a, input, textarea, select, summary')) return;
      last = performance.now();
      const dot = dots[index % dots.length]!;
      const spread = (index % 3 - 1) * 10;
      index += 1;
      animations.get(dot)?.cancel();
      dot.style.left = `${event.clientX + 12}px`;
      dot.style.top = `${event.clientY + 14}px`;
      const animation = dot.animate([
        { opacity: .6, transform: 'translate(0, 0) scale(.65) rotate(0deg)' },
        { opacity: 0, transform: `translate(${spread}px, -26px) scale(1.15) rotate(65deg)` },
      ], { duration: 720, easing: 'ease-out' });
      animations.set(dot, animation);
      animation.onfinish = () => { if (animations.get(dot) === animation) animations.delete(dot); };
    };
    home.addEventListener('pointermove', move, { passive: true });
    home.addEventListener('pointerleave', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { stop(); home.removeEventListener('pointermove', move); home.removeEventListener('pointerleave', stop); document.removeEventListener('visibilitychange', stop); };
  }, [available, enabled]);

  return <>
    {available && <button className="home-trail-toggle" type="button" aria-pressed={enabled} onClick={() => { const next = !enabled; setEnabled(next); try { localStorage.setItem('algacarbon.algae-trail', next ? 'on' : 'off'); } catch { /* Session-only preference. */ } }}><span aria-hidden="true">✳</span> Algae trail {enabled ? 'on' : 'off'}</button>}
    <div className="home-algae-trail" ref={trail} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
  </>;
}
