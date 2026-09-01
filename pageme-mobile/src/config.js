// config.js — centralised configuration constants for PageMe
// Keep backend URLs here so they are never scattered across files.

export const PAGEME_SCRIPT_URL =
  import.meta.env?.VITE_PAGEME_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbw2uz6k9hZmXZAfBK_47yK1Sy8CP55c8sQ9x8sjl21L9KbLM-oQ1mLA1t-l66mWLS4L0A/exec";

export const REQUIRE_SERVER_SESSION =
  import.meta.env?.VITE_PAGEME_REQUIRE_SERVER_SESSION !== 'false';
