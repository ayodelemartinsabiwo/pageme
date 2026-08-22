(function () {
  "use strict";

  const chapters = Array.isArray(window.PAGEME_GUIDE) ? window.PAGEME_GUIDE : [];
  const chapterNav = document.querySelector("[data-guide-chapters]");
  const chapterSelect = document.querySelector("[data-guide-select]");
  const title = document.querySelector("[data-guide-title]");
  const kicker = document.querySelector("[data-guide-kicker]");
  const progress = document.querySelector("[data-guide-progress]");
  const image = document.querySelector("[data-guide-image]");
  const hotspots = document.querySelector("[data-guide-hotspots]");
  const instructions = document.querySelector("[data-guide-instructions]");
  const note = document.querySelector("[data-guide-note]");
  const previous = document.querySelector("[data-guide-prev]");
  const next = document.querySelector("[data-guide-next]");
  if (!chapters.length || !chapterNav || !chapterSelect) return;

  const flatSteps = chapters.flatMap((chapter, chapterIndex) => chapter.steps.map((step, stepIndex) => ({ chapter, chapterIndex, step, stepIndex })));
  const defaultHash = `${chapters[0].id}/${chapters[0].steps[0].id}`;
  let activeInstruction = 0;

  const hashFor = (chapter, step) => `${chapter.id}/${step.id}`;
  const findSelection = () => {
    const requested = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    return flatSteps.find((item) => hashFor(item.chapter, item.step) === requested) || flatSteps[0];
  };

  chapters.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guide-chapter-button";
    button.dataset.chapterId = chapter.id;
    button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>${chapter.title}`;
    button.addEventListener("click", () => { window.location.hash = hashFor(chapter, chapter.steps[0]); });
    chapterNav.appendChild(button);

    const option = document.createElement("option");
    option.value = chapter.id;
    option.textContent = `${index + 1}. ${chapter.title}`;
    chapterSelect.appendChild(option);
  });

  chapterSelect.addEventListener("change", () => {
    const chapter = chapters.find((item) => item.id === chapterSelect.value);
    if (chapter) window.location.hash = hashFor(chapter, chapter.steps[0]);
  });

  function setActiveInstruction(index, focusInstruction) {
    const items = Array.from(instructions.querySelectorAll("li"));
    const markers = Array.from(hotspots.querySelectorAll("button"));
    activeInstruction = Math.max(0, Math.min(index, items.length - 1));
    items.forEach((item, itemIndex) => item.classList.toggle("is-active", itemIndex === activeInstruction));
    markers.forEach((marker, markerIndex) => {
      const active = markerIndex === activeInstruction;
      marker.classList.toggle("is-active", active);
      marker.setAttribute("aria-pressed", String(active));
    });
    if (focusInstruction && items[activeInstruction]) items[activeInstruction].focus({ preventScroll: false });
  }

  function render() {
    const selected = findSelection();
    const { chapter, step, chapterIndex, stepIndex } = selected;
    const overallIndex = flatSteps.indexOf(selected);
    activeInstruction = 0;

    document.title = `${step.title} - PageMe User Guide`;
    kicker.textContent = `${String(chapterIndex + 1).padStart(2, "0")} / ${chapter.title}`;
    title.textContent = step.title;
    progress.textContent = `${stepIndex + 1} / ${chapter.steps.length}`;
    progress.setAttribute("aria-label", `Step ${stepIndex + 1} of ${chapter.steps.length} in ${chapter.title}`);
    chapterSelect.value = chapter.id;
    chapterNav.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.chapterId === chapter.id;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    image.src = `assets/guide/${step.image}`;
    image.alt = step.alt;
    image.loading = overallIndex === 0 ? "eager" : "lazy";
    hotspots.replaceChildren();
    instructions.replaceChildren();

    step.instructions.forEach((text, index) => {
      const item = document.createElement("li");
      item.tabIndex = 0;
      item.innerHTML = `<span>${index + 1}</span><p>${text}</p>`;
      item.addEventListener("click", () => setActiveInstruction(index, false));
      item.addEventListener("focus", () => setActiveInstruction(index, false));
      instructions.appendChild(item);

      const point = step.hotspots[index] || step.hotspots[step.hotspots.length - 1] || { x: 50, y: 50 };
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "guide-hotspot";
      marker.style.left = `${point.x}%`;
      marker.style.top = `${point.y}%`;
      marker.textContent = String(index + 1);
      marker.setAttribute("aria-label", `Instruction ${index + 1}: ${text}`);
      marker.setAttribute("aria-pressed", "false");
      marker.addEventListener("click", () => setActiveInstruction(index, true));
      hotspots.appendChild(marker);
    });

    note.hidden = !step.note;
    note.textContent = step.note || "";
    previous.disabled = overallIndex === 0;
    next.disabled = overallIndex === flatSteps.length - 1;
    previous.dataset.target = overallIndex > 0 ? hashFor(flatSteps[overallIndex - 1].chapter, flatSteps[overallIndex - 1].step) : "";
    next.dataset.target = overallIndex < flatSteps.length - 1 ? hashFor(flatSteps[overallIndex + 1].chapter, flatSteps[overallIndex + 1].step) : "";
    setActiveInstruction(0, false);
  }

  [previous, next].forEach((button) => button.addEventListener("click", () => {
    if (!button.disabled && button.dataset.target) window.location.hash = button.dataset.target;
  }));

  window.addEventListener("hashchange", render);
  if (!window.location.hash || !flatSteps.some((item) => hashFor(item.chapter, item.step) === decodeURIComponent(window.location.hash.slice(1)))) {
    window.history.replaceState(null, "", `#${defaultHash}`);
  }
  render();
})();
