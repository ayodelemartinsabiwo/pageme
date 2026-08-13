// device.jsx — Full-screen mobile pager chassis (phone IS the pager)

import React from 'react';
import { getTorchLabel } from './screens.jsx';

export const LCD_PALETTES = {
  green:     { bg: "#1a2410", fg: "#9bbf3a", glow: "#b8e040", dark: "#0d1408" },
  amber:     { bg: "#241a08", fg: "#f0a830", glow: "#ffc764", dark: "#0e0902" },
  grayscale: { bg: "#1a1a1a", fg: "#c8c8c8", glow: "#ffffff", dark: "#0a0a0a" },
};

export const FONT_MAP = {
  pixel:   { msg: "'DotGothic16','VT323',monospace",   chrome: "'Silkscreen',monospace" },
  lcd:     { msg: "'VT323',monospace",                  chrome: "'Share Tech Mono',monospace" },
  segment: { msg: "'Share Tech Mono',monospace",        chrome: "'Share Tech Mono',monospace" },
};

export const HOUSING_PALETTES = {
  black:  { shell: "#1a1a1c", shellLight: "#2c2c2e", shellDark: "#0a0a0b", trim: "#3a3a3c", label: "#7a7a7e" },
  beige:  { shell: "#c9bfa3", shellLight: "#dcd3b9", shellDark: "#9a8f72", trim: "#7d7458", label: "#3a3424" },
  purple: { shell: "#3a2a5a", shellLight: "#5a4490", shellDark: "#1f1638", trim: "#7a5cb0", label: "#cdb8f0" },
  red:    { shell: "#7a1818", shellLight: "#a82828", shellDark: "#3e0a0a", trim: "#c44040", label: "#ffd0d0" },
};

const __DEVICE_STYLE = `
  .pager-stage {
    position: relative;
    width: 100%;
    max-width: 480px;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    z-index: 1;
    display: flex;
    flex-direction: column;
  }
  @media (min-width: 720px) and (min-height: 600px) {
    .pager-stage {
      min-height: 0;
      height: min(900px, 92vh);
      border-radius: 36px;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.05);
    }
  }

  .pager {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(140% 100% at 50% 0%, var(--shell-l), var(--shell) 40%, var(--shell-d) 110%);
    padding: max(env(safe-area-inset-top), 14px) 16px max(env(safe-area-inset-bottom), 16px);
    transition: transform .04s linear;
    overflow: hidden;
  }
  .pager::before {
    content: ""; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='1.3' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>");
    opacity: 0.18; mix-blend-mode: overlay; pointer-events: none;
  }

  .pager-header {
    position: relative;
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px 12px;
    flex-shrink: 0;
  }
  .speaker-grille { display: grid; grid-template-columns: repeat(8, 4px); gap: 3px; }
  .speaker-grille i {
    display: block; width: 4px; height: 4px;
    background: var(--shell-d); border-radius: 50%;
    box-shadow: inset 0 1px 0 rgba(0,0,0,.6), 0 .5px 0 rgba(255,255,255,.05);
  }
  .pager-wordmark {
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: 11px; letter-spacing: 0.22em; color: var(--label);
    text-shadow: 0 -1px 0 rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.04);
  }
  .pager-led {
    width: 8px; height: 8px; border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ff6464, #8a0000 60%, #2a0000);
    box-shadow: 0 0 6px rgba(255,60,60,.7), inset 0 0 1px rgba(255,255,255,.5);
  }
  .pager-led.blink { background: radial-gradient(circle at 30% 30%, #ff6464, #8a0000 60%, #2a0000); box-shadow: 0 0 10px rgba(255,60,60,.95); }

  /* LCD (occupies top portion) */
  .lcd-bezel {
    position: relative;
    flex: 1 1 auto;
    min-height: 240px;
    border-radius: 14px;
    background: linear-gradient(180deg, #050505, #0a0a0a);
    box-shadow:
      inset 0 4px 8px rgba(0,0,0,.85),
      inset 0 -2px 4px rgba(255,255,255,.04),
      0 1px 0 rgba(255,255,255,.06);
    padding: 8px;
    display: flex;
  }
  .lcd {
    position: relative;
    flex: 1;
    border-radius: 6px;
    background: var(--lcd-bg);
    color: var(--lcd-fg);
    overflow: hidden;
    font-family: var(--lcd-msg-font);
    font-size: var(--lcd-size);
    line-height: 1.2;
    transition: filter .15s, background .2s, color .2s;
    box-shadow: inset 0 0 14px rgba(0,0,0,.55);
  }
  .lcd.backlit {
    filter:
      drop-shadow(0 0 0.5px var(--lcd-glow))
      drop-shadow(0 0 6px color-mix(in oklab, var(--lcd-glow) 50%, transparent));
  }
  .lcd:not(.backlit) { filter: brightness(.7) saturate(.8); }
  .lcd::before {
    content: ""; position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(0,0,0,0.18) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.18) 1px, transparent 1px);
    background-size: 3px 3px, 3px 3px;
    pointer-events: none; mix-blend-mode: multiply; opacity: .45;
  }
  .lcd::after {
    content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,.08), transparent 60%),
      radial-gradient(140% 100% at 50% 100%, rgba(0,0,0,.18), transparent 60%);
    pointer-events: none;
  }
  .lcd-inner {
    position: relative;
    width: 100%; height: 100%;
    padding: 12px 14px;
    box-sizing: border-box;
    display: flex; flex-direction: column;
    z-index: 1;
    overflow: hidden;
  }

  /* Status bar */
  .lcd-status {
    display: flex; justify-content: space-between; align-items: center;
    font-family: var(--lcd-chrome-font);
    font-size: 0.88em;
    border-bottom: 1px dashed currentColor;
    padding-bottom: 4px; margin-bottom: 6px;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .lcd-status-left, .lcd-status-right { display: flex; align-items: center; gap: 6px; }
  .lcd-icon { display: inline-flex; align-items: flex-end; gap: 1px; height: 11px; }
  .lcd-bar { display: inline-block; width: 2px; background: currentColor; }
  .lcd-icon-text { display: inline-block; }
  .lcd-batt {
    position: relative; display: inline-block;
    width: 20px; height: 9px;
    border: 1px solid currentColor; border-radius: 1px; overflow: hidden;
  }
  .lcd-batt::after {
    content: ""; position: absolute; right: -3px; top: 2px;
    width: 2px; height: 5px; background: currentColor;
  }
  .lcd-batt-fill { display: block; height: 100%; background: currentColor; transition: width .4s; }

  /* Pages */
  .lcd-page {
    flex: 1; display: flex; flex-direction: column; gap: 3px;
    min-height: 0; position: relative;
    overflow: hidden;
  }
  .lcd-center { justify-content: center; align-items: stretch; gap: 6px; }
  .lcd-page-foot {
    margin-top: auto;
    display: flex; justify-content: space-between;
    font-family: var(--lcd-chrome-font);
    font-size: 0.88em;
    opacity: .65;
    border-top: 1px dashed currentColor;
    padding-top: 4px;
    flex-shrink: 0;
  }
  .lcd-line { font-family: var(--lcd-msg-font); }
  .lcd-blink { animation: lcdBlink 1s steps(2,end) infinite; }
  @keyframes lcdBlink { 50% { opacity: 0; } }
  .lcd-cursor { animation: lcdBlink .8s steps(2,end) infinite; }
  .lcd-dim { opacity: .5; }

  .lcd-huge {
    font-family: var(--lcd-chrome-font); font-weight: 700;
    font-size: 2.4em; text-align: center; letter-spacing: 0.06em;
  }
  .lcd-clock {
    font-family: var(--lcd-segment-font);
    font-size: clamp(2.8em, 16vw, 3.6em);
    text-align: center; letter-spacing: 0.06em;
    line-height: 1; margin: 4px 0;
  }
  .lcd-code {
    font-family: var(--lcd-segment-font);
    font-size: clamp(2.4em, 12vw, 3em);
    text-align: center; letter-spacing: 0.08em; line-height: 1.1;
  }
  .lcd-text-msg {
    font-family: var(--lcd-msg-font);
    font-size: 1.35em; line-height: 1.3;
    text-align: center; padding: 6px 4px;
    word-break: break-word;
  }

  .lcd-menu-row, .lcd-inbox-row, .lcd-code-row, .lcd-set-row {
    display: flex; align-items: baseline; gap: 8px;
    padding: 3px 4px;
    font-family: var(--lcd-msg-font);
    font-size: 1.15em;
  }
  .lcd-menu-row.selected, .lcd-inbox-row.selected, .lcd-code-row.selected, .lcd-set-row.selected {
    background: var(--lcd-fg); color: var(--lcd-bg);
  }
  .lcd-menu-arrow { width: 12px; }
  .lcd-menu-badge { margin-left: auto; opacity: .8; font-size: 0.85em; }
  .lcd-inbox-from { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lcd-inbox-time { opacity: .8; font-family: var(--lcd-chrome-font); font-size: 0.82em; flex-shrink: 0; }
  .lcd-inbox-mark { width: 12px; flex-shrink: 0; }
  .lcd-source-tag {
    font-family: var(--lcd-chrome-font); font-size: 0.7em;
    border: 1px solid currentColor; padding: 0 4px; border-radius: 2px;
    opacity: .8; margin-left: 4px;
  }

  .lcd-code-num { font-family: var(--lcd-segment-font); width: 64px; flex-shrink: 0; }
  .lcd-code-mean { flex: 1; min-width: 0; opacity: .9; font-size: 0.92em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .lcd-set-lbl { flex: 1; min-width: 0; }
  .lcd-set-val { font-family: var(--lcd-chrome-font); font-size: 0.85em; opacity: .8; flex-shrink: 0; }
  .lcd-set-row.selected .lcd-set-val { opacity: 1; }

  .lcd-form-row { display: flex; gap: 6px; padding: 3px 0; align-items: baseline; }
  .lcd-form-lbl { font-family: var(--lcd-chrome-font); font-size: 0.82em; opacity: .7; min-width: 42px; flex-shrink: 0; }
  .lcd-form-val { flex: 1; word-break: break-word; min-width: 0; }

  .lcd-msg-body { padding: 8px 0; flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; min-height: 0; }
  .lcd-incoming-from { font-family: var(--lcd-chrome-font); font-weight: 700; font-size: 1.5em; text-align: center; letter-spacing: 0.05em; }

  /* Vibration */
  .pager.vibrating { animation: vib .07s linear infinite; }
  @keyframes vib {
    0%   { transform: translate(0,0) rotate(0); }
    20%  { transform: translate(-3px,1px) rotate(-.5deg); }
    40%  { transform: translate(3px,-1px) rotate(.5deg); }
    60%  { transform: translate(-1px,-3px) rotate(-.3deg); }
    80%  { transform: translate(1px,3px) rotate(.3deg); }
    100% { transform: translate(0,0) rotate(0); }
  }

  /* D-pad + buttons */
  .pager-controls {
    flex-shrink: 0;
    margin-top: 14px;
    padding: 14px 12px 12px;
    border-radius: 18px;
    background: linear-gradient(180deg, var(--shell-d), var(--shell));
    box-shadow:
      inset 0 2px 4px rgba(0,0,0,.65),
      inset 0 -1px 0 rgba(255,255,255,.03);
    display: flex; flex-direction: column; gap: 10px;
  }
  .pager-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .pager-row.dpad {
    grid-template-columns: 1fr 1.4fr 1fr;
    align-items: stretch;
  }
  .pager-btn {
    appearance: none; border: 0;
    border-radius: 12px;
    background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
    color: var(--label);
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: 11px; letter-spacing: 0.1em;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.18),
      inset 0 -2px 4px rgba(0,0,0,.5),
      0 3px 0 rgba(0,0,0,.55),
      0 4px 8px rgba(0,0,0,.4);
    transition: transform .05s, box-shadow .05s, color .1s;
    user-select: none; -webkit-user-select: none;
    text-shadow: 0 -1px 0 rgba(0,0,0,.4);
    padding: 14px 6px;
    line-height: 1;
    min-height: 56px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px;
    touch-action: manipulation;
  }
  .pager-btn:hover { color: #fff; }
  .pager-btn:active, .pager-btn.pressed {
    transform: translateY(3px);
    box-shadow: inset 0 2px 4px rgba(0,0,0,.7);
  }
  .pager-btn .glyph { font-family: 'Share Tech Mono', monospace; font-size: 18px; line-height: 1; }
  .pager-btn.tall { min-height: 76px; }
  .pager-btn.send {
    background: radial-gradient(120% 100% at 50% 0%, #4a3a1a, #2a1a08 80%);
    color: #f0a830;
  }
  .pager-btn.send:hover { color: #ffc764; }

  /* Soft keyboard */
  .pager-keyboard {
    position: fixed; left: 0; right: 0; bottom: 0;
    background: #111218;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 10px 8px max(14px, env(safe-area-inset-bottom));
    z-index: 50;
    font-family: system-ui, -apple-system, sans-serif;
    color: #eee;
    box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
  }
  .pager-keyboard-hd {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,.45);
    margin-bottom: 8px;
    padding: 0 6px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .pager-keyboard-hd .close { padding: 4px 8px; cursor: pointer; font-weight: 500; }
  .pager-keyboard-rows { display: flex; flex-direction: column; gap: 7px; }
  .pager-keyboard-row { display: flex; gap: 6px; justify-content: center; }
  .pager-key {
    appearance: none;
    border: none;
    background: #252733;
    color: #fff;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 19px;
    font-weight: 500;
    height: 52px;
    padding: 0;
    border-radius: 8px;
    cursor: pointer;
    flex: 1; min-width: 0;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: background 0.1s ease, transform 0.05s ease;
    touch-action: manipulation;
  }
  .pager-key:active { background: #333647; transform: scale(0.96); }
  .pager-key.wide { flex: 1.5; background: #1a1b24; }
  .pager-key.xwide { flex: 2.5; }
  .pager-key.danger { color: #ff6b6b; background: #1a1b24; }
  .pager-key.go { background: #9bbf3a; color: #1a2410; font-weight: 700; flex: 1.6; }
  .pager-key.go:active { background: #b8e040; }
  .pager-key.active { background: #9bbf3a !important; color: #1a2410 !important; }
  .pager-keyboard-nav { margin-top: 2px; }
  .pager-key.nav {
    height: 40px;
    background: #181a22;
    color: #b8d66c;
    display: grid;
    place-items: center;
  }
  .pager-key-nav-icon {
    display: block;
    width: 7px;
    height: 7px;
    box-sizing: border-box;
    border: solid currentColor;
    border-width: 0 1px 1px 0;
    transform-origin: 50% 50%;
  }
  .pager-key-nav-icon.up { transform: rotate(-135deg); }
  .pager-key-nav-icon.down { transform: rotate(45deg); }
  .pager-key-nav-icon.left { transform: rotate(135deg); }
  .pager-key-nav-icon.right { transform: rotate(-45deg); }
  @media (max-height: 720px) {
    .pager-keyboard { padding-top: 7px; }
    .pager-keyboard-hd { margin-bottom: 5px; }
    .pager-keyboard-rows { gap: 5px; }
    .pager-key { height: 45px; }
    .pager-key.nav { height: 34px; }
  }

  .pager-menu-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    margin-bottom: 4px;
  }
  .pager-menu-btn {
    appearance: none; border: 0;
    border-radius: 8px;
    background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
    color: var(--label);
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: 8px; letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.15),
      inset 0 -1.5px 3px rgba(0,0,0,.5),
      0 2px 0 rgba(0,0,0,.55),
      0 3px 6px rgba(0,0,0,.3);
    transition: transform .05s, box-shadow .05s, color .1s;
    user-select: none; -webkit-user-select: none;
    padding: 6px 1px;
    line-height: 1.2;
    min-height: 38px;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    touch-action: manipulation;
  }
  .pager-menu-btn:hover { color: #fff; }
  .pager-menu-btn:active {
    transform: translateY(2px);
    box-shadow: inset 0 2px 3px rgba(0,0,0,.7);
  }
  .pager-btn.active {
    background: radial-gradient(120% 100% at 50% 0%, #f0a830, #2a1a08 80%) !important;
    color: #fff !important;
    text-shadow: 0 0 4px #ffc764;
  }
  @keyframes softSlowPulse {
    0%, 100% {
      background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.15),
        inset 0 -1.5px 3px rgba(0,0,0,.5),
        0 2px 0 rgba(0,0,0,.55),
        0 3px 6px rgba(0,0,0,.3);
    }
    50% {
      background: radial-gradient(120% 100% at 50% 0%, #443c22, #b88d2d 70%, #221a05 120%);
      box-shadow:
        0 0 12px rgba(184, 141, 45, 0.45),
        inset 0 1px 0 rgba(255,255,255,.3),
        0 2px 0 rgba(184,141,45,.55);
      color: #ffda73;
    }
  }
  .pager-menu-btn.focus-timer-btn {
    animation: softSlowPulse 4s ease-in-out infinite;
  }
`;

export function TorchIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
      {/* Handle */}
      <rect x="4" y="10" width="8" height="4" rx="1" />
      {/* Flared Head */}
      <path d="M12 9 L17 6 L17 18 L12 15 Z" fill={active ? "currentColor" : "none"} opacity={active ? 0.35 : 1} />
      {/* Switch on top */}
      <rect x="6" y="8" width="3" height="1.5" rx="0.5" fill="currentColor" />
      {/* Beams */}
      {active && (
        <>
          <line x1="20" y1="7" x2="23" y2="4" strokeWidth="2.5" />
          <line x1="21" y1="12" x2="24" y2="12" strokeWidth="2.5" />
          <line x1="20" y1="17" x2="23" y2="20" strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}

export function PagerChassis({
  housing = "black", lcdColor = "green", font = "lcd",
  backlight = true, vibrating = false, ledBlink = false,
  primaryAction = "select",
  children, onButton, torchOn = false, timerActive = false,
}) {
  const PRIMARY = {
    select: { glyph: "▶", label: "SELECT", cls: "send" },
    menu:   { glyph: "☰", label: "MENU",   cls: "send" },
    open:   { glyph: "▶", label: "OPEN",   cls: "send" },
    read:   { glyph: "✉", label: "READ",   cls: "send" },
    send:   { glyph: "▶", label: "SEND",   cls: "send" },
  }[primaryAction] || { glyph: "▶", label: "SELECT", cls: "send" };
  const pal = HOUSING_PALETTES[housing] || HOUSING_PALETTES.black;
  const lcd = LCD_PALETTES[lcdColor] || LCD_PALETTES.green;
  const fonts = FONT_MAP[font] || FONT_MAP.lcd;

  const cssVars = {
    "--shell": pal.shell, "--shell-l": pal.shellLight, "--shell-d": pal.shellDark,
    "--trim": pal.trim, "--label": pal.label,
    "--lcd-bg": lcd.bg, "--lcd-fg": lcd.fg, "--lcd-glow": lcd.glow,
    "--lcd-msg-font": fonts.msg, "--lcd-chrome-font": fonts.chrome,
    "--lcd-segment-font": "'Share Tech Mono', monospace",
    "--lcd-size": "16px",
  };

  return (
    <>
      <style>{__DEVICE_STYLE}</style>
      <div className="pager-stage" style={cssVars}>
        <div className={"pager" + (vibrating ? " vibrating" : "")}>
          <div className="pager-header">
            <div className="speaker-grille">
              {Array.from({ length: 24 }).map((_, i) => <i key={i} />)}
            </div>
            <div className="pager-wordmark">PAGE·ME</div>
            <div className={"pager-led" + (ledBlink ? " blink" : "")} />
          </div>

          <div className="lcd-bezel">
            <div className={"lcd" + (backlight ? " backlit" : "")}>
              <div className="lcd-inner">{children}</div>
            </div>
          </div>

          <div className="pager-controls">
            <div className="pager-menu-row">
              <button className="pager-menu-btn" onClick={() => onButton("go_inbox")}>INBOX</button>
              <button className="pager-menu-btn" onClick={() => onButton("go_compose")}>COMPOSE</button>
              <button className="pager-menu-btn" onClick={() => onButton("go_codes")}>CODE<br/>BOOK</button>
              <button className={"pager-menu-btn" + (!timerActive ? " focus-timer-btn" : "")} onClick={() => onButton("go_timer")}>FOCUS<br/>TIMER</button>
              <button className="pager-menu-btn" onClick={() => onButton("go_settings")}>SETTINGS</button>
            </div>
            <div className="pager-row dpad">
              <button className="pager-btn" onClick={() => onButton("esc")}>
                <span className="glyph">←</span>BACK
              </button>
              <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 8 }}>
                <button className="pager-btn" style={{ minHeight: 36 }} onClick={() => onButton("up")}>
                  <span className="glyph">▲</span>
                </button>
                <button className="pager-btn" style={{ minHeight: 36 }} onClick={() => onButton("down")}>
                  <span className="glyph">▼</span>
                </button>
              </div>
              <button className={"pager-btn" + (torchOn ? " active" : "")} onClick={() => onButton("torch")}>
                <span className="glyph" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}><TorchIcon active={torchOn} /></span>{getTorchLabel()}
              </button>
            </div>
            <div className="pager-row" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
              <button className="pager-btn" onClick={() => onButton("read")}>
                <span className="glyph">✉</span>READ
              </button>
              <button className={"pager-btn " + PRIMARY.cls + " tall"} onClick={() => onButton("send")}>
                <span className="glyph">{PRIMARY.glyph}</span>{PRIMARY.label}
              </button>
              <button className="pager-btn"
                onMouseDown={(e) => { e.preventDefault(); onButton("power_down"); }}
                onMouseUp={(e) => { e.preventDefault(); onButton("power_up"); }}
                onTouchStart={(e) => { e.preventDefault(); onButton("power_down"); }}
                onTouchEnd={(e) => { e.preventDefault(); onButton("power_up"); }}
              >
                <span className="glyph" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "18px", width: "18px" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function Keyboard({ mode, onKey, onClose, showNavigation = false }) {
  const [capsState, setCapsState] = React.useState("shift-once");
  const [showSym, setShowSym] = React.useState(false);
  const lastShiftClick = React.useRef(0);

  if (mode === "code") {
    const layout = [
      ["1","2","3"],
      ["4","5","6"],
      ["7","8","9"],
      ["*","0","#"],
      ["DEL","SEND"],
    ];
    return (
      <div className="pager-keyboard" data-noncommentable="">
        <div className="pager-keyboard-hd">
          <span>★ NUMERIC PAD</span>
          <span className="close" onClick={onClose}>✕ HIDE</span>
        </div>
        <div className="pager-keyboard-rows">
          {layout.map((row, i) => (
            <div key={i} className="pager-keyboard-row">
              {row.map((k) => (
                <button key={k}
                  className={"pager-key" + (k === "DEL" ? " danger wide" : "") + (k === "SEND" ? " go" : "")}
                  onClick={() => onKey(k)}>{k}</button>
              ))}
            </div>
          ))}
          {showNavigation && <KeyboardNavigation onKey={onKey} />}
        </div>
      </div>
    );
  }

  // QWERTY Layout
  const row1 = showSym ? ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"] : ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const row2 = showSym ? ["-", "_", "=", "+", "[", "]", "{", "}", ";", ":"] : ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const row3Keys = showSym ? ["'", "\"", ",", ".", "/", "?", "\\", "|"] : ["Z", "X", "C", "V", "B", "N", "M"];
  const row4 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  const transformKey = (k) => {
    if (k.length === 1 && !showSym) {
      return capsState !== "lowercase" ? k.toUpperCase() : k.toLowerCase();
    }
    return k;
  };

  const handleShiftClick = () => {
    const now = Date.now();
    if (now - lastShiftClick.current < 300) {
      setCapsState("caps-lock");
    } else {
      if (capsState === "caps-lock") {
        setCapsState("lowercase");
      } else if (capsState === "lowercase") {
        setCapsState("shift-once");
      } else {
        setCapsState("lowercase");
      }
    }
    lastShiftClick.current = now;
  };

  const handleKeyClick = (k) => {
    onKey(k);
    if (capsState === "shift-once" && /^[A-Z]$/i.test(k)) {
      setCapsState("lowercase");
    }
  };

  return (
    <div className="pager-keyboard" data-noncommentable="">
      <div className="pager-keyboard-hd">
        <span>★ QWERTY PAD ({showSym ? "SYMBOLS" : (capsState === "caps-lock" ? "LOCK" : (capsState === "shift-once" ? "CAPS" : "lc"))})</span>
        <span className="close" onClick={onClose}>✕ HIDE</span>
      </div>
      <div className="pager-keyboard-rows">
        {/* Row 1 */}
        <div className="pager-keyboard-row">
          {row1.map((k) => (
            <button key={k} className="pager-key" onClick={() => handleKeyClick(transformKey(k))}>
              {transformKey(k)}
            </button>
          ))}
        </div>
        {/* Row 2 */}
        <div className="pager-keyboard-row">
          {row2.map((k) => (
            <button key={k} className="pager-key" onClick={() => handleKeyClick(transformKey(k))}>
              {transformKey(k)}
            </button>
          ))}
        </div>
        {/* Row 3: Shift, keys, Backspace */}
        <div className="pager-keyboard-row">
          <button className={"pager-key wide" + (capsState !== "lowercase" ? " active" : "")} onClick={handleShiftClick}>
            {capsState === "caps-lock" ? "⇪" : "⇧"}
          </button>
          {row3Keys.map((k) => (
            <button key={k} className="pager-key" onClick={() => handleKeyClick(transformKey(k))}>
              {transformKey(k)}
            </button>
          ))}
          <button className="pager-key danger wide" onClick={() => onKey("DEL")}>
            ⌫
          </button>
        </div>
        {/* Row 4: Symbols toggle, numbers */}
        <div className="pager-keyboard-row">
          <button className="pager-key wide" onClick={() => setShowSym(!showSym)}>
            {showSym ? "ABC" : "?123"}
          </button>
          {row4.map((k) => (
            <button key={k} className="pager-key" onClick={() => onKey(k)}>{k}</button>
          ))}
        </div>
        {/* Row 5: Space, Send */}
        <div className="pager-keyboard-row">
          <button className="pager-key xwide" onClick={() => onKey("SPC")}>SPACE</button>
          <button className="pager-key go" onClick={() => onKey("SEND")}>SEND</button>
        </div>
        {showNavigation && <KeyboardNavigation onKey={onKey} />}
      </div>
    </div>
  );
}

function KeyboardNavigation({ onKey }) {
  return (
    <div className="pager-keyboard-row pager-keyboard-nav" aria-label="Text navigation">
      <button className="pager-key nav" aria-label="Previous field" onClick={() => onKey("UP")}><span className="pager-key-nav-icon up" aria-hidden="true" /></button>
      <button className="pager-key nav" aria-label="Next field" onClick={() => onKey("DOWN")}><span className="pager-key-nav-icon down" aria-hidden="true" /></button>
      <button className="pager-key nav" aria-label="Move cursor left" onClick={() => onKey("LEFT")}><span className="pager-key-nav-icon left" aria-hidden="true" /></button>
      <button className="pager-key nav" aria-label="Move cursor right" onClick={() => onKey("RIGHT")}><span className="pager-key-nav-icon right" aria-hidden="true" /></button>
    </div>
  );
}
