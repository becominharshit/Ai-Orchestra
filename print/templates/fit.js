// Runs inside headless Chrome before the PDF is printed.
// 1. Every [data-fit] element shrinks until it fits its width in at most data-fit lines (default 1).
// 2. Every [data-fitbox] container then shrinks all its [data-fit] children together until the
//    content fits the container height.
// TODO(student): warn in the console when any text had to shrink below 70% of its design size.
(function () {
  function lines(el) {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return Math.round(el.scrollHeight / lh);
  }
  function fit(el) {
    const max = parseInt(el.dataset.fit || '1', 10);
    let size = parseFloat(getComputedStyle(el).fontSize);
    const min = size * 0.4;
    let guard = 300;
    while (guard-- > 0 && size > min && (el.scrollWidth > el.clientWidth + 0.5 || lines(el) > max)) {
      size *= 0.97;
      el.style.fontSize = size + 'px';
    }
  }
  function contentHeight(box) {
    const kids = [...box.children].filter((k) => k.offsetParent !== null);
    if (!kids.length) return 0;
    const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
    const bot = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
    return bot - top;
  }
  function fitBox(box) {
    const kids = [...box.querySelectorAll('[data-fit]')];
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    let guard = 100;
    while (guard-- > 0 && contentHeight(box) > box.clientHeight + 0.5) {
      kids.forEach((k) => { k.style.fontSize = parseFloat(getComputedStyle(k).fontSize) * 0.97 + 'px'; });
      if (gap) box.style.rowGap = (parseFloat(getComputedStyle(box).rowGap) * 0.97) + 'px';
    }
  }
  window.__fitAll = function () {
    document.querySelectorAll('[data-fit]').forEach(fit);
    document.querySelectorAll('[data-fitbox]').forEach(fitBox);
    return true;
  };
})();
