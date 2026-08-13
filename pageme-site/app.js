(function () {
  "use strict";

  const config = window.PAGEME_SITE_CONFIG || {};
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const header = document.querySelector("[data-header]");
  const downloadAvailable = config.downloadAvailable === true && Boolean(config.downloadUrl);

  document.querySelectorAll("[data-download-link]").forEach((link) => {
    const label = link.querySelector("[data-download-label]");
    if (downloadAvailable) {
      link.href = config.downloadUrl;
      const resolvedUrl = new URL(link.href, window.location.href);
      if (resolvedUrl.origin === window.location.origin) {
        link.setAttribute("download", "PageMe-Android.apk");
      } else {
        link.removeAttribute("download");
      }
      link.removeAttribute("aria-disabled");
      link.classList.remove("is-disabled");
      if (label && link.dataset.availableLabel) label.textContent = link.dataset.availableLabel;
      return;
    }

    link.removeAttribute("href");
    link.removeAttribute("download");
    link.setAttribute("aria-disabled", "true");
    link.classList.add("is-disabled");
    if (label && link.dataset.unavailableLabel) label.textContent = link.dataset.unavailableLabel;
  });
  document.querySelectorAll("[data-release-version]").forEach((node) => {
    if (config.version) node.textContent = config.version;
  });
  document.querySelectorAll("[data-release-size]").forEach((node) => {
    if (config.size) node.textContent = config.size;
  });
  document.querySelectorAll("[data-release-hash]").forEach((node) => {
    if (config.sha256) node.textContent = config.sha256;
  });
  document.querySelectorAll("[data-release-checksum]").forEach((node) => {
    node.hidden = !downloadAvailable || !config.sha256;
  });
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      const label = navToggle.querySelector(".sr-only");
      if (label) label.textContent = open ? "Close navigation" : "Open navigation";
    });
    nav.addEventListener("click", (event) => {
      if (!event.target.closest("a")) return;
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open navigation");
    });
  }

  const updateHeader = () => header && header.classList.toggle("scrolled", window.scrollY > 16);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const states = {
    inbox: {
      index: "01 / INBOX",
      title: "Messages become pages.",
      copy: "PageMe groups alerts by app and sender so a busy chat stays one readable conversation.",
      detail: "Reply-capable WhatsApp and SMS pages can be answered from PageMe without opening the distracting source app.",
      screen: '<div class="lcd-list"><div class="lcd-row active"><span>SMS / 3003</span><span>1</span></div><div class="lcd-row"><span>WHATSAPP / TOYIN</span><span>3</span></div><div class="lcd-row"><span>PAGEME / BEN-001</span><span>1</span></div></div>'
    },
    compose: {
      index: "02 / COMPOSE",
      title: "Send the message. Keep the boundary.",
      copy: "Compose a PageMe message or reply to a captured conversation from the pager interface.",
      detail: "The themed keyboard includes cursor navigation, so editing stays practical without sending you back to the full phone experience.",
      screen: '<div class="lcd-list"><div class="lcd-row"><span>TO:</span><span>BEN-001</span></div><div class="lcd-row"><span>MSG:</span><span>ON MY WAY</span></div><div class="lcd-row active"><span>SEND PAGE</span><span>></span></div></div>'
    },
    focus: {
      index: "03 / FOCUS",
      title: "A timer that changes the environment.",
      copy: "Choose a duration and PageMe holds the focused interface until the session ends.",
      detail: "Allowed study apps remain available. The emergency exit gives temporary access and automatically returns to PageMe afterward.",
      screen: '<p class="lcd-date">FOCUS ACTIVE</p><p class="lcd-clock">42:18</p><p class="lcd-message">PAGES HELD</p><p class="lcd-hint">STAY WITH IT</p>'
    },
    schedule: {
      index: "04 / SCHEDULE",
      title: "Focus can arrive on schedule.",
      copy: "Set a one-time or weekly activation, or scan calendar events that match your chosen keywords.",
      detail: "Calendar reminders can simply notify you or start a focus session, depending on the action you choose.",
      screen: '<div class="lcd-list"><div class="lcd-row"><span>NEXT:</span><span>18:30</span></div><div class="lcd-row"><span>MODE:</span><span>WEEKLY</span></div><div class="lcd-row active"><span>FOCUS</span><span>60 MIN</span></div></div>'
    }
  };

  const demoScreen = document.querySelector("[data-demo-screen]");
  const demoIndex = document.querySelector("[data-demo-index]");
  const demoTitle = document.querySelector("[data-demo-title]");
  const demoCopy = document.querySelector("[data-demo-copy]");
  const demoDetail = document.querySelector("[data-demo-detail]");

  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      const state = states[button.dataset.demo];
      if (!state || !demoScreen) return;
      document.querySelectorAll("[data-demo]").forEach((item) => item.classList.toggle("active", item === button));
      demoScreen.innerHTML = state.screen;
      demoIndex.textContent = state.index;
      demoTitle.textContent = state.title;
      demoCopy.textContent = state.copy;
      demoDetail.textContent = state.detail;
    });
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((node) => node.classList.add("visible"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    reveals.forEach((node) => observer.observe(node));
  }
})();
