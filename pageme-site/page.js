(() => {
  const config = window.PAGEME_SITE_CONFIG || {};
  const view = document.querySelector("[data-status-view]");
  const title = document.getElementById("status-title");
  const copy = document.querySelector("[data-status-copy]");
  const time = document.querySelector("[data-status-time]");
  const actions = document.querySelector("[data-status-actions]");
  const retry = document.querySelector("[data-status-retry]");
  const openApp = document.querySelector("[data-open-app]");
  const token = new URLSearchParams(window.location.search).get("s") || "";

  const setState = ({ heading, message, endTime = "", actionable = false, retryable = false }) => {
    title.textContent = heading;
    copy.textContent = message;
    time.hidden = !endTime;
    time.textContent = endTime;
    actions.hidden = !actionable;
    retry.hidden = !retryable;
    view.setAttribute("aria-busy", "false");
  };

  const formattedEnd = (value) => {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return `Available for pages until ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };

  const loadStatus = async () => {
    view.setAttribute("aria-busy", "true");
    retry.hidden = true;
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
      setState({ heading: "Invalid status link", message: "This link is incomplete or was changed. Ask the sender for a new PageMe status link." });
      return;
    }
    if (!config.apiUrl) {
      setState({ heading: "PageMe is unavailable", message: "The status service is not configured. Please try again later.", retryable: true });
      return;
    }
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "resolveStatusLinkPublic", token }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result?.status === "success" && result.active === true) {
        openApp.href = window.location.href;
        setState({
          heading: "They are using PageMe",
          message: "Need them? Open PageMe and send a short, direct page without pulling them into a distracting feed.",
          endTime: formattedEnd(result.focusEndsAt || result.expiresAt),
          actionable: true,
        });
        return;
      }
      if (result?.linkState === "expired" || result?.code === "STATUS_LINK_EXPIRED") {
        setState({ heading: "Pager status ended", message: "This private status link has expired or was switched off. Ask the sender for a new one if you still need them." });
        return;
      }
      if (result?.code === "FEATURE_UNAVAILABLE") {
        setState({ heading: "Status sharing is paused", message: "PageMe messaging is still available, but status links are temporarily paused.", retryable: true });
        return;
      }
      setState({ heading: "Invalid status link", message: "PageMe could not find this private status link. Ask the sender for a new one." });
    } catch (_) {
      setState({
        heading: navigator.onLine ? "PageMe could not be reached" : "You are offline",
        message: navigator.onLine ? "The status service did not respond. Please try again." : "Reconnect to the internet, then try this status link again.",
        retryable: true,
      });
    }
  };

  retry.addEventListener("click", loadStatus);
  loadStatus();
})();
