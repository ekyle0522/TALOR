/* TALOR project page: page behaviour (navigation, hero, scroll story, controls). */
(function () {
  "use strict";

  const U = window.TU;
  const C = window.TC;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ------------------------------------------------------------ navigation, progress, hero parallax
  function setupScroll() {
    const nav = $("#nav");
    const bar = $(".nav-progress span");
    const toTop = $("#to-top");
    const hero = $(".hero");
    const heroInner = $(".hero-inner");
    const spectrum = $("#hero-spectrum");
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      nav.classList.toggle("is-scrolled", y > 8);
      bar.style.transform = `scaleX(${max > 0 ? U.clamp(y / max, 0, 1) : 0})`;
      toTop.classList.toggle("is-on", y > window.innerHeight * 0.9);
      if (!U.reducedMotion() && hero) {
        const p = U.clamp(y / (hero.offsetHeight * 0.85), 0, 1);
        heroInner.style.transform = `translateY(${(p * 46).toFixed(1)}px)`;
        heroInner.style.opacity = (1 - p * 0.75).toFixed(3);
        spectrum.style.setProperty("--spread", `${(p * 42).toFixed(1)}px`);
      }
      U.tooltip.hide();
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: U.reducedMotion() ? "auto" : "smooth" }));

    // highlight the nav link of the section in view
    const links = $$(".nav-links a");
    const linkFor = { results: "results", explorer: "results", doco: "doco", cost: "cost", method: "method", cite: "cite" };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const target = linkFor[e.target.id];
          links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${target}`));
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      Object.keys(linkFor).forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
      const heroIo = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) links.forEach((a) => a.classList.remove("is-active"));
      }, { rootMargin: "-45% 0px -50% 0px" });
      heroIo.observe(hero);
    }
  }

  // ------------------------------------------------------------ hero: the scissors cut the head spectrum
  function setupHero() {
    const fig = $("#hero-spectrum");
    new C.HeroSpectrum(fig);
    const emblem = $(".scissors-hero");
    if (U.reducedMotion()) {
      fig.classList.add("is-cutting", "is-cut");
      return;
    }
    const start = () => {
      emblem.classList.add("is-snipping");
      window.setTimeout(() => emblem.classList.remove("is-snipping"), 1100);
      window.setTimeout(() => fig.classList.add("is-cutting"), 450);
      window.setTimeout(() => fig.classList.add("is-cut"), 1750);
    };
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => window.setTimeout(r, 600))]).then(() => window.setTimeout(start, 150));
    $(".hero-emblem").addEventListener("click", () => {
      emblem.classList.remove("is-snipping");
      void emblem.getBoundingClientRect();
      emblem.classList.add("is-snipping");
      window.setTimeout(() => emblem.classList.remove("is-snipping"), 1100);
    });
  }

  // ------------------------------------------------------------ reveal on scroll and count-up numbers
  function setupReveal() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
  }

  function setupCounters() {
    $$(".count[data-count]").forEach((el) => {
      const target = parseFloat(el.dataset.count);
      const digits = Number(el.dataset.decimals || 0);
      const prefix = el.dataset.prefix || "";
      const final = el.textContent;
      if (U.reducedMotion() || !Number.isFinite(target)) return;
      el.textContent = prefix + (0).toFixed(digits);
      U.onceVisible(el, () => {
        U.tween(1400, (e) => { el.textContent = prefix + (target * e).toFixed(digits); }, {
          easing: U.ease.out, onDone: () => { el.textContent = final; },
        });
      }, 0.6);
    });
  }

  // ------------------------------------------------------------ teaser: scroll story
  function setupTeaser() {
    const root = $("#teaser-scrolly");
    const chart = new C.Teaser($("#teaser-chart"));
    const steps = $$(".step", root);
    const dots = $$(".step-dots button", root);
    let current = -1;

    function activate(i) {
      if (i === current) return;
      current = i;
      steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
      dots.forEach((d, k) => d.classList.toggle("is-active", k === i));
      chart.setStep(i);
    }
    activate(0);
    dots.forEach((d) => d.addEventListener("click", () => {
      const i = Number(d.dataset.goto);
      activate(i);
      steps[i].scrollIntoView({ block: "center", behavior: U.reducedMotion() ? "auto" : "smooth" });
    }));
    if (!("IntersectionObserver" in window)) return;
    let io = null;
    function observe() {
      if (io) io.disconnect();
      const narrow = window.innerWidth <= 1000;
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) activate(Number(e.target.dataset.step)); });
      }, { rootMargin: narrow ? "-62% 0px -30% 0px" : "-46% 0px -46% 0px" });
      steps.forEach((s) => io.observe(s));
    }
    observe();
    window.addEventListener("resize", U.debounce(observe, 200));
  }

  // ------------------------------------------------------------ explorer: dumbbell + heat map with shared controls
  function setupExplorer() {
    const state = { suite: "imagenet-c", ood: "mean", sort: "orig" };
    const dumbbell = new C.Dumbbell($("#dumbbell-chart"), $("#dumbbell-meta"), state);
    const heatmap = new C.Heatmap($("#heatmap-chart"), $("#heatmap-meta"), state);
    const update = (patch) => {
      Object.assign(state, patch);
      dumbbell.update(patch);
      heatmap.update(patch);
    };
    segmented($("#bench-tabs"), "suite", (v) => update({ suite: v }));
    segmented($("#sort-tabs"), "sort", (v) => update({ sort: v }));
    $("#ood-select").addEventListener("change", (e) => update({ ood: e.target.value }));
  }

  function segmented(group, key, onChange) {
    const buttons = $$("button", group);
    buttons.forEach((b) => b.addEventListener("click", () => {
      if (b.getAttribute("aria-pressed") === "true") return;
      buttons.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      onChange(b.dataset[key]);
    }));
  }

  // ------------------------------------------------------------ DOCO x TALOR radar
  function setupRadar() {
    const el = $("#radar-chart");
    const radar = new C.Radar(el);
    U.onceVisible(el, () => radar.grow(), 0.35);
    segmented($("#radar-tabs"), "suite", (v) => radar.setSuite(v));
    $$("#radar-legend button").forEach((b) => b.addEventListener("click", () => {
      b.setAttribute("aria-pressed", String(radar.toggle(b.dataset.series)));
    }));
  }

  // ------------------------------------------------------------ cost
  function setupCost() {
    const time = new C.TimeChart($("#time-chart"));
    const memory = new C.MemoryChart($("#memory-chart"));
    U.onceVisible($("#time-chart"), () => time.grow(), 0.3);
    U.onceVisible($("#memory-chart"), () => memory.grow(), 0.4);
  }

  // ------------------------------------------------------------ method
  function setupMethod() {
    const split = new C.SplitChart($("#split-chart"), $("#tau-out"));
    const slider = $("#tau-slider");
    slider.addEventListener("input", () => split.setTau(Number(slider.value)));
    ["fig3a", "fig3b", "fig3c"].forEach((id, i) => {
      const el = document.getElementById(id);
      const chart = new C.Fig3(el, ["logit", "rel", "cca"][i]);
      U.onceVisible(el, () => window.setTimeout(() => chart.draw(), i * 120), 0.35);
    });

    const box = $("#lightbox");
    const closeBtn = $(".lightbox-close", box);
    let opener = null;
    const close = () => {
      box.hidden = true;
      document.body.style.overflow = "";
      if (opener) opener.focus();
    };
    $(".pipeline-zoom").addEventListener("click", (e) => {
      opener = e.currentTarget;
      box.hidden = false;
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    });
    box.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
  }

  // ------------------------------------------------------------ citation
  function setupCopy() {
    $$(".copy").forEach((btn) => btn.addEventListener("click", async () => {
      const text = document.getElementById(btn.dataset.copy).textContent;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (err) {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
        document.body.removeChild(area);
      }
      btn.textContent = ok ? "Copied" : "Press Ctrl+C";
      btn.classList.toggle("is-done", ok);
      window.setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("is-done"); }, 1800);
    }));
  }

  function init() {
    setupScroll();
    setupHero();
    setupReveal();
    setupCounters();
    setupTeaser();
    setupExplorer();
    setupRadar();
    setupCost();
    setupMethod();
    setupCopy();
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".chart")) U.tooltip.hide();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
