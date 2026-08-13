// horizontal.jsx — Real-pager horizontal/landscape chassis

import React from 'react';
import { LCD_PALETTES, HOUSING_PALETTES, FONT_MAP, TorchIcon } from './device.jsx';

function getTorchLabel() {
  try {
    const locale = (navigator.language || navigator.userLanguage || "en-GB").toLowerCase();
    if (locale.endsWith("-us") || locale.endsWith("-ca") || locale.startsWith("en-us") || locale.startsWith("en-ca")) {
      return "FLASH";
    }
  } catch (e) {}
  return "TORCH";
}

const __HORIZ_STYLE = `
  .hpager-stage {
    position: relative;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1;
  }
  .hpager {
    --shell: var(--h-shell, #1a1a1c);
    --shell-l: var(--h-shell-l, #2c2c2e);
    --shell-d: var(--h-shell-d, #0a0a0b);
    --label: var(--h-label, #7a7a7e);
    position: relative;
    width: min(95vw, 185vh, 1100px);
    max-height: calc(100vh - 32px);
    max-height: calc(100dvh - 32px);
    aspect-ratio: 16 / 7.2;
    border-radius: 28px 28px 22px 22px;
    background: radial-gradient(120% 80% at 30% 0%, var(--shell-l), var(--shell) 45%, var(--shell-d) 110%);
    box-shadow:
      inset 0 2px 0 rgba(255,255,255,.08),
      inset 0 -8px 18px rgba(0,0,0,.55),
      inset 4px 0 8px rgba(0,0,0,.35),
      inset -4px 0 8px rgba(0,0,0,.35),
      0 24px 60px rgba(0,0,0,.6);
    padding: 18px 24px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 10px;
    transition: transform .04s linear;
    container-type: size;
  }
  .hpager::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='1.3' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>");
    opacity: 0.22; mix-blend-mode: overlay; pointer-events: none;
  }
  .hpager.vibrating { animation: hvib .07s linear infinite; }
  @keyframes hvib {
    0%{transform:translate(0,0)rotate(0)} 25%{transform:translate(-3px,1px)rotate(-.4deg)}
    50%{transform:translate(3px,-1px)rotate(.4deg)} 75%{transform:translate(-1px,-2px)rotate(-.2deg)}
    100%{transform:translate(0,0)rotate(0)}
  }
  .hpager-clip {
    position: absolute; top: 16%; right: -22px; width: 22px; height: 50%;
    background: linear-gradient(90deg, var(--shell-d), var(--shell));
    border-radius: 0 8px 8px 0;
    box-shadow: 0 4px 10px rgba(0,0,0,.4);
  }
  .hpager-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 6px;
  }
  .hpager .speaker-grille { display: grid; grid-template-columns: repeat(10, 4px); gap: 3px; }
  .hpager .speaker-grille i {
    width: 4px; height: 4px; background: var(--shell-d); border-radius: 50%;
    box-shadow: inset 0 1px 0 rgba(0,0,0,.6);
  }
  .hpager-wordmark {
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: 12px; letter-spacing: 0.22em; color: var(--label);
  }
  .hpager-led {
    width: 8px; height: 8px; border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ff6464, #8a0000 60%, #2a0000);
    box-shadow: 0 0 6px rgba(255,60,60,.7);
  }
  .hpager-led.blink { box-shadow: 0 0 10px rgba(255,60,60,.95); }
  .hpager-screen-row {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    min-height: 0;
  }
  .hpager-bezel {
    border-radius: 10px;
    background: linear-gradient(180deg, #050505, #0a0a0a);
    box-shadow: inset 0 4px 8px rgba(0,0,0,.85);
    padding: 8px;
    display: flex;
    min-height: 0;
  }
  .hpager-bezel .lcd {
    flex: 1;
    border-radius: 5px;
    font-size: clamp(14px, 1.6vw, 20px);
  }
  .hpager-buttons {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1.2cqw;
    padding: 2.5cqh 1cqw 1cqh;
  }
  .hpager-btn {
    appearance: none; border: 0;
    border-radius: 2cqh;
    background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
    color: var(--label);
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: min(12px, 2.4cqh); letter-spacing: 0.1em;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.18),
      inset 0 -2px 4px rgba(0,0,0,.5),
      0 0.6cqh 0 rgba(0,0,0,.55),
      0 0.8cqh 1.6cqh rgba(0,0,0,.4);
    padding: 2.2cqh 0.8cqw;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8cqh;
    user-select: none; touch-action: manipulation;
  }
  .hpager-btn:active { transform: translateY(0.4cqh); box-shadow: inset 0 2px 4px rgba(0,0,0,.7); }
  .hpager-btn .glyph { font-family: 'Share Tech Mono', monospace; font-size: min(18px, 3.2cqh); }
  .hpager-btn.send { background: radial-gradient(120% 100% at 50% 0%, #4a3a1a, #2a1a08 80%); color: #f0a830; }
  .hpager-absolute-buttons {
    position: absolute;
    bottom: 2cqh;
    right: 2.5cqw;
    display: flex;
    gap: 1cqw;
  }
  .rotate-hint {
    position: fixed;
    inset: 0;
    background: rgba(5,5,7,0.92);
    backdrop-filter: blur(8px);
    z-index: 200;
    display: none;
    flex-direction: column;
    align-items: center; justify-content: center;
    padding: 32px;
    color: #e8e6df;
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
    gap: 16px;
  }
  @media (orientation: portrait) and (max-width: 900px) {
    .rotate-hint.armed { display: flex; }
  }
  .rotate-hint .icon {
    width: 64px; height: 64px;
    border: 2px solid #9bbf3a; border-radius: 10px;
    position: relative;
    animation: rotateIcon 2s ease-in-out infinite;
  }
  .rotate-hint .icon::after {
    content: ""; position: absolute; right: -3px; top: 26%; width: 4px; height: 18px;
    background: #9bbf3a; border-radius: 2px;
  }
  @keyframes rotateIcon {
    0%,40% { transform: rotate(0); }
    60%,100% { transform: rotate(-90deg); }
  }
  .rotate-hint h2 { margin: 0; font-size: 18px; letter-spacing: 0.05em; color: #f4f1e8; }
  .rotate-hint p { margin: 0; font-size: 13px; color: rgba(232,230,223,.6); max-width: 320px; line-height: 1.4; }
  .hpager-menu-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1.2cqw;
    padding: 0 1cqw;
  }
  .hpager-menu-btn {
    appearance: none; border: 0;
    border-radius: 1.5cqh;
    background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
    color: var(--label);
    font-family: 'Silkscreen', monospace; font-weight: 700;
    font-size: min(10px, 2.0cqh); letter-spacing: 0.05em;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.18),
      inset 0 -1.5px 3px rgba(0,0,0,.5),
      0 0.4cqh 0 rgba(0,0,0,.55),
      0 0.6cqh 1.2cqh rgba(0,0,0,.4);
    padding: 1.5cqh 0.8cqw;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
    user-select: none; touch-action: manipulation;
  }
  .hpager-menu-btn:active { transform: translateY(0.3cqh); box-shadow: inset 0 2px 3px rgba(0,0,0,.7); }
  .hpager-btn.active {
    background: radial-gradient(120% 100% at 50% 0%, #f0a830, #2a1a08 80%) !important;
    color: #fff !important;
    text-shadow: 0 0 4px #ffc764;
  }
  @keyframes hSoftSlowPulse {
    0%, 100% {
      background: radial-gradient(120% 100% at 50% 0%, var(--shell-l), var(--shell) 70%, var(--shell-d) 120%);
    }
    50% {
      background: radial-gradient(120% 100% at 50% 0%, #443c22, #b88d2d 70%, #221a05 120%);
      color: #ffda73;
    }
  }
  .hpager-menu-btn.focus-timer-btn {
    animation: hSoftSlowPulse 4s ease-in-out infinite;
  }
`;

export function HorizontalPagerChassis({
  housing = "black", lcdColor = "green", font = "lcd",
  backlight = true, vibrating = false, ledBlink = false,
  primaryAction = "select", children, onButton, torchOn = false, timerActive = false,
}) {
  const pal = HOUSING_PALETTES[housing] || HOUSING_PALETTES.black;
  const lcd = LCD_PALETTES[lcdColor] || LCD_PALETTES.green;
  const fonts = FONT_MAP[font] || FONT_MAP.lcd;

  const cssVars = {
    "--h-shell": pal.shell, "--h-shell-l": pal.shellLight, "--h-shell-d": pal.shellDark,
    "--h-label": pal.label,
    "--lcd-bg": lcd.bg, "--lcd-fg": lcd.fg, "--lcd-glow": lcd.glow,
    "--lcd-msg-font": fonts.msg, "--lcd-chrome-font": fonts.chrome,
    "--lcd-segment-font": "'Share Tech Mono', monospace",
    "--lcd-size": "16px",
  };

  const PRIMARY = {
    select: { glyph: "▶", label: "SELECT" }, open: { glyph: "▶", label: "OPEN" },
    read:   { glyph: "✉", label: "READ" },   send: { glyph: "▶", label: "SEND" },
    menu:   { glyph: "☰", label: "MENU" },
  }[primaryAction] || { glyph: "▶", label: "SELECT" };

  return (
    <>
      <style>{__HORIZ_STYLE}</style>
      <div className="hpager-stage" style={cssVars}>
        <div className={"hpager" + (vibrating ? " vibrating" : "")}>
          <div className="hpager-clip" />
          <div className="hpager-top">
            <div className="speaker-grille">
              {Array.from({ length: 30 }).map((_, i) => <i key={i} />)}
            </div>
            <div className="hpager-wordmark">PAGE·ME</div>
            <div className={"hpager-led" + (ledBlink ? " blink" : "")} />
          </div>
          <div className="hpager-screen-row">
            <div className="hpager-bezel">
              <div className={"lcd" + (backlight ? " backlit" : "")}>
                <div className="lcd-inner">{children}</div>
              </div>
            </div>
          </div>
          <div className="hpager-menu-row">
            <button className="hpager-menu-btn" onClick={() => onButton("go_inbox")}>INBOX</button>
            <button className="hpager-menu-btn" onClick={() => onButton("go_compose")}>COMPOSE</button>
            <button className="hpager-menu-btn" onClick={() => onButton("go_codes")}>CODE BOOK</button>
            <button className={"hpager-menu-btn" + (!timerActive ? " focus-timer-btn" : "")} onClick={() => onButton("go_timer")}>FOCUS TIMER</button>
            <button className="hpager-menu-btn" onClick={() => onButton("go_settings")}>SETTINGS</button>
          </div>
          <div className="hpager-buttons">
            <button className="hpager-btn" onClick={() => onButton("esc")}><span className="glyph">←</span>BACK</button>
            <button className="hpager-btn" onClick={() => onButton("up")}><span className="glyph">▲</span>UP</button>
            <button className="hpager-btn" onClick={() => onButton("down")}><span className="glyph">▼</span>DOWN</button>
            <button className={"hpager-btn" + (torchOn ? " active" : "")} onClick={() => onButton("torch")}>
              <span className="glyph" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}><TorchIcon active={torchOn} /></span>
              {getTorchLabel()}
            </button>
            <button className="hpager-btn send" onClick={() => onButton("send")}>
              <span className="glyph">{PRIMARY.glyph}</span>{PRIMARY.label}
            </button>
          </div>
          <div className="hpager-absolute-buttons">
            <button className="hpager-btn" style={{ padding: "1.2cqh 2cqw", minWidth: 0 }} onClick={() => onButton("read")}>
              <span className="glyph">✉</span>READ
            </button>
            <button className="hpager-btn" style={{ padding: "1.2cqh 2cqw", minWidth: 0 }}
              onMouseDown={(e) => { e.preventDefault(); onButton("power_down"); }}
              onMouseUp={(e) => { e.preventDefault(); onButton("power_up"); }}
              onTouchStart={(e) => { e.preventDefault(); onButton("power_down"); }}
              onTouchEnd={(e) => { e.preventDefault(); onButton("power_up"); }}
            >
              <span className="glyph" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "20px", width: "20px" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function RotateHint() {
  return (
    <div className="rotate-hint armed">
      <div className="icon" />
      <h2>ROTATE YOUR DEVICE</h2>
      <p>The Real Pager view is horizontal — turn your phone sideways to use it. Or switch back to Mobile in Tweaks.</p>
    </div>
  );
}
