// config.js — centralised configuration constants for PageMe
// Keep backend URLs here so they are never scattered across files.

export const PAGEME_SCRIPT_URL =
  import.meta.env?.VITE_PAGEME_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbz76J8Oaz3ZolAbw7UWCwr35uZnrW6UI8J5wNb2ykdDr5P2-SH0h0bYx8Lr32fYt4XoEw/exec";

export const REQUIRE_SERVER_SESSION =
  import.meta.env?.VITE_PAGEME_REQUIRE_SERVER_SESSION !== 'false';
