/* TALOR project page: small DOM, SVG, number-format and animation helpers. No dependencies. */
(function (global) {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const motionQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function reducedMotion() {
    return Boolean(motionQuery && motionQuery.matches);
  }

  function setAttrs(node, attrs) {
    if (!attrs) return node;
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === "text") node.textContent = String(value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    return node;
  }

  function svg(tag, attrs, parent) {
    const node = setAttrs(document.createElementNS(SVGNS, tag), attrs);
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, attrs, parent) {
    const node = setAttrs(document.createElement(tag), attrs);
    if (parent) parent.appendChild(node);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------------------------------------------------------------- scales
  function linear(d0, d1, r0, r1) {
    const f = (x) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
    f.invert = (y) => d0 + ((y - r0) / (r1 - r0)) * (d1 - d0);
    return f;
  }

  function log(d0, d1, r0, r1) {
    const l0 = Math.log(d0);
    const l1 = Math.log(d1);
    const f = (x) => r0 + ((Math.log(x) - l0) / (l1 - l0)) * (r1 - r0);
    f.invert = (y) => Math.exp(l0 + ((y - r0) / (r1 - r0)) * (l1 - l0));
    return f;
  }

  function niceStep(span, count) {
    const raw = span / Math.max(1, count);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    return (n >= 7.5 ? 10 : n >= 3.5 ? 5 : n >= 1.5 ? 2 : 1) * pow;
  }

  function ticks(lo, hi, count) {
    const step = niceStep(hi - lo, count);
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      out.push(Math.round(v * 1e6) / 1e6);
    }
    return out;
  }

  // ---------------------------------------------------------------- numbers
  // Round like Python's format(): half to even when the scaled value is exactly halfway.
  function roundTo(x, digits) {
    const m = Math.pow(10, digits);
    const y = x * m;
    let r = Math.round(y);
    if (Math.abs(y % 1) === 0.5 && r % 2 !== 0) r -= 1;
    return r / m;
  }

  function fmt(x, digits) {
    const d = digits === undefined ? 1 : digits;
    const v = roundTo(x, d);
    return (Object.is(v, -0) ? 0 : v).toFixed(d);
  }

  // Same convention as the README: "+x.x", typographic minus for losses, "±0.0" for ties.
  function fmtSigned(x, digits) {
    const d = digits === undefined ? 1 : digits;
    if (x > 0) return "+" + fmt(x, d);
    if (x < 0) return "\u2212" + fmt(-x, d);
    return "\u00b1" + (0).toFixed(d);
  }

  function fmtInt(x) {
    return Math.round(x).toLocaleString("en-US");
  }

  // ---------------------------------------------------------------- animation
  const ease = {
    linear: (t) => t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
  };

  // Calls onFrame(easedT, rawT) on every animation frame; jumps to the end for reduced motion.
  function tween(duration, onFrame, options) {
    const opts = options || {};
    const easing = opts.easing || ease.inOut;
    let cancelled = false;
    let start = null;
    if (reducedMotion() || duration <= 0) {
      onFrame(1, 1);
      if (opts.onDone) opts.onDone();
      return { cancel() {} };
    }
    function frame(now) {
      if (cancelled) return;
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      onFrame(easing(t), t);
      if (t < 1) global.requestAnimationFrame(frame);
      else if (opts.onDone) opts.onDone();
    }
    global.requestAnimationFrame(frame);
    return { cancel() { cancelled = true; } };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      global.clearTimeout(timer);
      timer = global.setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // Calls callback() once the element is at least `threshold` visible.
  function onceVisible(node, callback, threshold) {
    if (!("IntersectionObserver" in global)) {
      callback();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        callback();
      }
    }, { threshold: threshold === undefined ? 0.2 : threshold });
    io.observe(node);
  }

  // Calls callback(width) when the element's width changes (debounced).
  function watchWidth(node, callback) {
    let last = node.clientWidth;
    const run = debounce(() => {
      const w = node.clientWidth;
      if (w > 0 && Math.abs(w - last) > 1) {
        last = w;
        callback(w);
      }
    }, 140);
    if ("ResizeObserver" in global) new ResizeObserver(run).observe(node);
    else global.addEventListener("resize", run);
  }

  // ---------------------------------------------------------------- tooltip
  // `owner` is the chart that shows the tooltip. When something else hides it (a scroll,
  // a tap outside the charts) or another chart takes it over, owner.clearHover() lets
  // the chart drop its highlight.
  const tooltip = {
    el: null,
    owner: null,
    show(content, x, y, owner) {
      if (!this.el) this.el = document.getElementById("tooltip");
      if (!this.el) return;
      if (this.owner && this.owner !== owner) this.release();
      this.owner = owner || null;
      this.el.innerHTML = content;
      this.el.classList.add("is-on");
      this.move(x, y);
    },
    move(x, y) {
      if (!this.el) return;
      const pad = 14;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      let left = x + pad;
      let top = y + pad;
      if (left + w > global.innerWidth - 8) left = x - w - pad;
      if (top + h > global.innerHeight - 8) top = y - h - pad;
      this.el.style.left = Math.max(8, left) + "px";
      this.el.style.top = Math.max(8, top) + "px";
    },
    hide(owner) {
      if (!this.el) return;
      if (owner && this.owner && owner !== this.owner) return;
      if (!owner) this.release();
      this.el.classList.remove("is-on");
      this.owner = null;
    },
    release() {
      const prev = this.owner;
      this.owner = null;
      if (prev && typeof prev.clearHover === "function") prev.clearHover();
    },
  };

  // Mouse (and hovering pen): the readout follows the pointer and goes away on leave.
  // Touch: there is no hover, so a tap shows the readout and it stays until the next tap,
  // a scroll or a tap outside the charts. pointercancel fires when a swipe turns into a scroll.
  function bindPointer(node, onPoint, onLeave) {
    node.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") onPoint(e); });
    node.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") onPoint(e); });
    node.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") onLeave(e); });
    node.addEventListener("pointercancel", (e) => onLeave(e));
  }

  // SVG point of a pointer event in the coordinates of `svgNode` (viewBox units).
  function localPoint(svgNode, event) {
    const rect = svgNode.getBoundingClientRect();
    const vb = svgNode.viewBox.baseVal;
    const sx = vb && vb.width ? vb.width / rect.width : 1;
    const sy = vb && vb.height ? vb.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
  }

  global.TU = {
    svg, html, clear, linear, log, ticks, roundTo, fmt, fmtSigned, fmtInt,
    ease, tween, lerp, clamp, debounce, onceVisible, watchWidth, tooltip, bindPointer, localPoint, reducedMotion,
  };
})(window);
