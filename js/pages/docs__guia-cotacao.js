/* Extraido de docs/guia-cotacao.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
// Smooth scroll + active TOC highlight
const tocLinks = document.querySelectorAll('.toc a');
const sections = Array.from(tocLinks).map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const id = '#' + entry.target.id;
    const link = document.querySelector(`.toc a[href="${id}"]`);
    if (link) {
      if (entry.isIntersecting) {
        tocLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });

sections.forEach(s => observer.observe(s));
