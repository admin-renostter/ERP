/* Extraido de docs/arquitetura-erp.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
// Hover interativo nos módulos
document.querySelectorAll('.module').forEach(m => {
  m.addEventListener('mouseenter', () => {
    const name = m.querySelector('.module-name').textContent;
    console.log('→ Hover:', name);
  });
});

// Animação de entrada dos cards
const obs = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.module, .flow-wrap, .matrix').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(10px)';
  el.style.transition = `all 0.5s ease ${i * 0.03}s`;
  obs.observe(el);
});
