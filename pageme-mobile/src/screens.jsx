// screens.jsx — LCD screen contents per app state

import React from 'react';
import { safeFormatTime, safeFormatDate } from './utils.js';
import { readJsonStorage, writeJsonStorage } from './storage.js';
import {
  calendarSyncSummary, futureOneTimeSelection, localDateInputValue,
  normalizeFocusSchedule, oneTimeScheduleError,
} from './focus-schedule.js';

export function LcdLine({ children, dim = false, align = "left", inverse = false, blink = false, style = {} }) {
  return (
    <div className={"lcd-line" + (blink ? " lcd-blink" : "")} style={{
      textAlign: align,
      opacity: dim ? 0.55 : 1,
      background: inverse ? "var(--lcd-fg)" : "transparent",
      color: inverse ? "var(--lcd-bg)" : "var(--lcd-fg)",
      padding: inverse ? "1px 4px" : 0,
      ...style,
    }}>{children}</div>
  );
}

export function StatusBar({ signal = 4, battery = 0.7, soundOn = true, msgUnread = 0, time = "", pagerMode = true, lockMins = 0 }) {
  const bars = [0,1,2,3,4].map((i) => i < signal);
  return (
    <div className="lcd-status">
      <div className="lcd-status-left">
        <span className="lcd-icon">
          {bars.map((on, i) => (
            <span key={i} className="lcd-bar" style={{
              height: 3 + i*1.5 + "px",
              opacity: on ? 1 : 0.18,
            }} />
          ))}
        </span>
        {pagerMode && <span className="lcd-icon-text">PGR</span>}
        {lockMins > 0 && <span className="lcd-icon-text lcd-blink" style={{ marginLeft: 4 }}>⏳{lockMins}m</span>}
        {soundOn ? <span className="lcd-icon-text">♪</span> : <span className="lcd-icon-text">·</span>}
        {msgUnread > 0 && <span className="lcd-icon-text">✉{msgUnread}</span>}
      </div>
      <div className="lcd-status-right">
        <span className="lcd-icon-text">{time}</span>
        <span className="lcd-batt">
          <span className="lcd-batt-fill" style={{ width: Math.max(0, Math.min(1, battery))*100 + "%" }} />
        </span>
      </div>
    </div>
  );
}

export function BootScreen({ stage }) {
  return (
    <div className="lcd-page lcd-center">
      {stage === 0 && (
        <>
          <div className="lcd-huge">PageMe</div>
          <LcdLine align="center" dim>v2.4 — PAGER OS</LcdLine>
        </>
      )}
      {stage === 1 && (
        <>
          <LcdLine align="center">SELF TEST</LcdLine>
          <LcdLine align="center" dim>━━━━━━━━━━</LcdLine>
          <LcdLine align="center">MEM ........ OK</LcdLine>
          <LcdLine align="center">RF  ........ OK</LcdLine>
          <LcdLine align="center">LCD ........ OK</LcdLine>
        </>
      )}
      {stage === 2 && (
        <>
          <LcdLine align="center">READY</LcdLine>
          <LcdLine align="center" dim>CAP CODE {window.localStorage.getItem("pageme_cap_code") || "PGR-001"}</LcdLine>
          <LcdLine align="center" dim style={{fontSize:"0.85em"}}>PAGER MODE: ACTIVE</LcdLine>
        </>
      )}
    </div>
  );
}

export function HomeScreen({ now, msgUnread, lastFrom, focusLockUntil = 0 }) {
  const date = safeFormatDate(now);
  const time = safeFormatTime(now, true);
  const isFocused = focusLockUntil > now.getTime();

  let countdownEl = null;
  if (isFocused) {
    const msLeft = Math.max(0, focusLockUntil - now.getTime());
    const totalSecs = Math.ceil(msLeft / 1000);
    const mm = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const ss = String(totalSecs % 60).padStart(2, '0');
    countdownEl = (
      <div style={{ textAlign: "center", margin: "4px 0" }}>
        <LcdLine align="center" dim style={{ fontSize: "0.75em", letterSpacing: "0.15em" }}>━ FOCUS ENDS IN ━</LcdLine>
        <div className="lcd-clock">{mm}:{ss}</div>
      </div>
    );
  }

  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" dim style={{ fontSize: "1.0em" }}>{date}</LcdLine>
      {!isFocused && <div className="lcd-clock">{time}</div>}
      {countdownEl}
      {msgUnread > 0 ? (
        <LcdLine align="center" style={{ fontSize: "1.1em" }}>▸ {msgUnread} NEW PAGE{msgUnread>1?"S":""}</LcdLine>
      ) : (
        <LcdLine align="center" dim>NO NEW PAGES</LcdLine>
      )}
      {lastFrom && <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>LAST FROM: {lastFrom}</LcdLine>}
      <LcdLine align="center" dim style={{ fontSize: "0.78em", marginTop: 8, letterSpacing: "0.1em" }}>
        ━ SELECT DIRECTLY ━
      </LcdLine>
    </div>
  );
}

export function MenuScreen({ items, selected }) {
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ MAIN MENU ━</LcdLine>
      {items.map((item, i) => (
        <div key={item.id} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
          <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <span className="lcd-menu-badge">[{item.badge}]</span>
          )}
        </div>
      ))}
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SELECT ▶ OPEN</span>
      </div>
    </div>
  );
}

export function InboxScreen({ items, selected, viewMode = "categories", category = "", contact = "" }) {
  if (items.length === 0) {
    return (
      <div className="lcd-page lcd-center">
        <LcdLine align="center" dim>━ INBOX ━</LcdLine>
        <LcdLine align="center" dim>(empty)</LcdLine>
      </div>
    );
  }
  const start = Math.max(0, Math.min(items.length - 4, selected - 1));
  const visible = items.slice(start, start + 4);

  let title = `INBOX  ${selected + 1}/${items.length}`;
  if (viewMode === "contacts") {
    title = `${category.toUpperCase()}  ${selected + 1}/${items.length}`;
  } else if (viewMode === "messages") {
    title = `${contact.toUpperCase()}  ${selected + 1}/${items.length}`;
  }

  let footLeft = "▲▼";
  let footRight = "SELECT ▶ VIEW";
  if (viewMode === "contacts") {
    footLeft = "BACK=◀ ▲▼";
    footRight = "SELECT ▶ OPEN";
  } else if (viewMode === "messages") {
    footLeft = "BACK=◀ ▲▼";
    footRight = "SELECT ▶ READ";
  }

  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>{title}</LcdLine>
      {visible.map((item, i) => {
        const idx = start + i;
        if (viewMode === "categories" || viewMode === "contacts") {
          return (
            <div key={item.name} className={"lcd-inbox-row" + (idx === selected ? " selected" : "")}>
              <span className="lcd-inbox-mark">
                {idx === selected ? "▶" : (item.unread > 0 ? "•" : " ")}
              </span>
              <span className="lcd-inbox-from">{item.name}</span>
              <span className="lcd-inbox-time" style={{ fontFamily: "var(--lcd-chrome-font)" }}>
                {item.unread > 0 ? `[${item.unread} NEW]` : `[${item.total}]`}
              </span>
            </div>
          );
        }

        // Messages mode
        const m = item;
        let srcTag = "✉ SMS";
        if (m.source) {
          const src = m.source.toLowerCase();
          if (src === "call" || src === "phone" || src === "dialer") srcTag = "📞 CAL";
          else if (src === "whatsapp") srcTag = "💬 WHA";
          else if (src === "slack") srcTag = "💬 SLA";
          else if (src === "email" || src === "gmail" || src === "outlook" || src === "mail") srcTag = "✉ MAL";
          else if (src === "msgr" || src === "messenger" || src === "orca") srcTag = "💬 MSG";
          else if (src === "alarm" || src === "clock" || src === "deskclock") srcTag = "⏰ ALM";
          else if (src === "google" || src === "googlequicksearchbox") srcTag = "☀ GGL";
          else if (src === "sms" || src === "messages" || src === "messaging") srcTag = "✉ SMS";
          else {
            let abbr = m.source.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase();
            if (abbr.length < 3) {
              abbr = (abbr + "APP").substring(0, 3);
            }
            srcTag = "📱 " + abbr;
          }
        }
        return (
          <div key={m.id} className={"lcd-inbox-row" + (idx === selected ? " selected" : "")}>
            <span className="lcd-inbox-mark">
              {idx === selected ? "▶" : (m.read ? " " : "•")}
            </span>
            <span className="lcd-inbox-from">{m.text.substring(0, 16) || "(no content)"}</span>
            <span className="lcd-source-tag">{srcTag}</span>
            <span className="lcd-inbox-time">{m.time}</span>
          </div>
        );
      })}
      <div className="lcd-page-foot">
        <span>{footLeft}</span><span>{footRight}</span>
      </div>
    </div>
  );
}

export function ReadScreen({ msg, codeMeaning }) {
  if (!msg) return null;
  const isCode = msg.type === "code";
  const srcLabel = "VIA " + (msg.source || "SMS").toUpperCase();
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>FROM: {msg.from}</LcdLine>
      <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>
        {msg.number} • {srcLabel}
      </LcdLine>
      <LcdLine align="center" dim style={{ fontSize: "0.82em" }}>{msg.date} {msg.time}</LcdLine>
      <div className="lcd-msg-body">
        {isCode ? (
          <>
            <div className="lcd-code">{msg.text}</div>
            {codeMeaning && <LcdLine align="center" dim style={{ fontSize: "0.95em" }}>"{codeMeaning}"</LcdLine>}
          </>
        ) : (
          <div className="lcd-text-msg">{msg.text}</div>
        )}
      </div>
      <div className="lcd-page-foot">
        <span>BACK ◀</span>{msg.canReply ? <span>SEND ▶ REPLY</span> : <span>NO REPLY</span>}
      </div>
    </div>
  );
}

export function ComposeScreen({ to, body, field, mode, cursor = { to: 0, body: 0 } }) {
  const editableValue = (value, active, position, placeholder) => {
    if (!active) return value || <span className="lcd-dim">{placeholder}</span>;
    if (!value) return <><span className="lcd-cursor">_</span><span className="lcd-dim">{placeholder}</span></>;
    const point = Math.max(0, Math.min(value.length, position));
    return <>{value.slice(0, point)}<span className="lcd-cursor">_</span>{value.slice(point)}</>;
  };
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>NEW PAGE</LcdLine>
      <div className="lcd-form-row">
        <span className="lcd-form-lbl">TO:</span>
        <span className="lcd-form-val">
          {editableValue(to, field === "to", cursor.to, "(name/number)")}
        </span>
      </div>
      <div className="lcd-form-row">
        <span className="lcd-form-lbl">{mode === "code" ? "CODE:" : "MSG:"}</span>
        <span className="lcd-form-val" style={{
          fontFamily: mode === "code" ? "var(--lcd-segment-font)" : "var(--lcd-msg-font)",
          letterSpacing: mode === "code" ? "0.04em" : 0,
        }}>
          {editableValue(body, field === "body", cursor.body, mode === "code" ? "(numbers only)" : "(type message)")}
        </span>
      </div>
      <div className="lcd-page-foot">
        <span>MENU=MODE</span><span>SEND ▶</span>
      </div>
    </div>
  );
}

export function SendingScreen({ to, sentOk }) {
  return (
    <div className="lcd-page lcd-center">
      {!sentOk ? (
        <>
          <LcdLine align="center">TRANSMITTING</LcdLine>
          <LcdLine align="center" dim>━ ━ ━ ━ ━ ━</LcdLine>
          <LcdLine align="center" dim>TO {to}</LcdLine>
        </>
      ) : (
        <>
          <LcdLine align="center" inverse>✓ PAGE SENT</LcdLine>
          <LcdLine align="center" dim>TO {to}</LcdLine>
        </>
      )}
    </div>
  );
}

export function CodesScreen({ codes, selected }) {
  const start = Math.max(0, Math.min(codes.length - 5, selected - 2));
  const visible = codes.slice(start, start + 5);
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>CODE BOOK  {selected+1}/{codes.length}</LcdLine>
      {visible.map((c, i) => {
        const idx = start + i;
        return (
          <div key={c.code} className={"lcd-code-row" + (idx === selected ? " selected" : "")}>
            <span className="lcd-menu-arrow">{idx === selected ? "▶" : " "}</span>
            <span className="lcd-code-num">{c.code}</span>
            <span className="lcd-code-mean">{c.meaning}</span>
          </div>
        );
      })}
      <div className="lcd-page-foot">
        <span>▲▼</span><span>SELECT ▶ USE</span>
      </div>
    </div>
  );
}

export function SettingsScreen({ items, selected }) {
  const start = Math.max(0, Math.min(Math.max(0, items.length - 7), selected - 3));
  const visible = items.slice(start, start + 7);
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ SETTINGS ━</LcdLine>
      {visible.map((it, i) => {
        const itemIndex = start + i;
        return (
        <div key={it.id} className={"lcd-set-row" + (itemIndex === selected ? " selected" : "")}>
          <span className="lcd-menu-arrow">{itemIndex === selected ? "▶" : " "}</span>
          <span className="lcd-set-lbl">{it.label}</span>
          <span className="lcd-set-val">
            {typeof it.value === "boolean" ? (it.value ? "ON" : "OFF") : it.value}
          </span>
        </div>
        );
      })}
      <div className="lcd-page-foot">
        <span>▲▼</span><span>SELECT=TOGGLE</span>
      </div>
    </div>
  );
}

export function ClearInboxScreen({ count, selected }) {
  const options = ["CANCEL", "CLEAR ALL"];
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ CLEAR INBOX? ━</LcdLine>
      <LcdLine align="center" dim>{count} {count === 1 ? "PAGE" : "PAGES"} WILL BE REMOVED</LcdLine>
      <div style={{ marginTop: 8 }}>
        {options.map((label, i) => (
          <div key={label} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
            <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="lcd-page-foot"><span>ESC BACK</span><span>SEND SELECT</span></div>
    </div>
  );
}

export function IncomingOverlay({ msg, codeMeaning }) {
  if (!msg) return null;
  const srcLabel = msg.source === "call" ? "MISSED CALL"
                  : msg.source === "slack" ? "CHAT"
                  : "TEXT";
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>★ INCOMING ★</LcdLine>
      <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>{srcLabel} FROM</LcdLine>
      <div className="lcd-incoming-from">{msg.from}</div>
      <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>{msg.number}</LcdLine>
      {msg.type === "code" ? (
        <div className="lcd-code" style={{ fontSize: "1.6em", marginTop: 4 }}>{msg.text}</div>
      ) : (
        <div className="lcd-text-msg" style={{ marginTop: 4 }}>{msg.text}</div>
      )}
      {codeMeaning && <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>"{codeMeaning}"</LcdLine>}
      <LcdLine align="center" dim style={{ marginTop: 8, fontSize: "0.85em" }}>READ ▶</LcdLine>
    </div>
  );
}

export function AboutScreen() {
  const capCode = window.localStorage.getItem("pageme_cap_code") || "PGR-001";
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ WHY PAGE·ME ━</LcdLine>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4px 0" }}>
        <LcdLine align="left" style={{ fontSize: "0.90em", lineHeight: "1.3" }}>
          • Reclaim your focus.<br/>
          • Stop endless feeds &amp; scrolling.<br/>
          • Chats arrive as pages only.<br/>
          • Reply in code. Breathe.<br/>
          • Quiet your mind.
        </LcdLine>
        <div style={{ borderTop: "1px solid rgba(155,191,58,0.25)", marginTop: 6, paddingTop: 4 }}>
          <LcdLine align="center" style={{ fontSize: "0.95em" }}>MY UCN: {capCode}</LcdLine>
        </div>
      </div>
      <div className="lcd-page-foot">
        <span>BACK ◀</span><span>PAGE·ME v2.4</span>
      </div>
    </div>
  );
}

export function TimerScreen({ options, selected, activeLockUntil }) {
  const activeMins = activeLockUntil && activeLockUntil > Date.now()
    ? Math.ceil((activeLockUntil - Date.now()) / (60 * 1000))
    : 0;
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ FOCUS TIMER ━</LcdLine>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {options.map((opt, i) => {
          const isActive = activeMins > 0 && opt.duration > 0 && Math.abs(opt.duration - activeMins * 60 * 1000) < 65000;
          return (
            <div key={opt.id} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
              <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
              <span style={{ flex: 1 }}>{opt.label}</span>
              {isActive && <span className="lcd-menu-badge">[ACTV]</span>}
            </div>
          );
        })}
      </div>
      {activeMins > 0 && (
        <LcdLine align="center" dim style={{ fontSize: "0.78em", margin: "2px 0" }}>
          LOCK: {activeMins} MINS REMAINING
        </LcdLine>
      )}
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SELECT ▶ SET</span>
      </div>
    </div>
  );
}

export function FocusLockedScreen({ activeLockUntil }) {
  const activeMins = activeLockUntil && activeLockUntil > Date.now()
    ? Math.ceil((activeLockUntil - Date.now()) / (60 * 1000))
    : 0;
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse blink>★ FOCUS LOCKED ★</LcdLine>
      <div style={{ padding: "4px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" style={{ fontSize: "0.95em", lineHeight: "1.4" }}>
          EXIT AND UNPIN BLOCKED<br/>
          TO KEEP YOU FOCUSING.
        </LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.95em", marginTop: 4 }}>
          REMAINING LOCK TIME:
        </LcdLine>
        <div className="lcd-code" style={{ fontSize: "1.8em", marginTop: 6 }}>
          {activeMins} MINS
        </div>
      </div>
      <LcdLine align="center" dim style={{ fontSize: "0.78em" }}>
        RELEASE PWR TO RETURN
      </LcdLine>
    </div>
  );
}

export function CustomTimerScreen({ val }) {
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ LOCK MINUTES ━</LcdLine>
      <div style={{ padding: "12px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>ENTER MINUTES (1-999):</LcdLine>
        <div className="lcd-code" style={{ fontSize: "2.2em", marginTop: 8 }}>
          {val || <span className="lcd-dim">0</span>}
          <span className="lcd-cursor">_</span>
        </div>
      </div>
      <div className="lcd-page-foot">
        <span>ESC ◀</span><span>SELECT ▶ SET</span>
      </div>
    </div>
  );
}

export function WelcomeScreen({ name, capCode }) {
  const firstName = name.trim().split(" ")[0] || "User";
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ WELCOME ━</LcdLine>
      <div style={{ padding: "4px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="lcd-huge" style={{ fontSize: "1.8em", textAlign: "center" }}>
          Hi {firstName}!
        </div>
        <LcdLine align="center" dim style={{ marginTop: 4 }}>
          Your Pager is active.
        </LcdLine>
        <LcdLine align="center" style={{ fontSize: "1.15em", color: "var(--lcd-fg)", margin: "4px 0" }}>
          UCN: {capCode}
        </LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.82em" }}>
          (Save this code. It has been)
        </LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.82em" }}>
          (emailed to you for storage)
        </LcdLine>
      </div>
      <div className="lcd-page-foot">
        <span>PRESS ANY BUTTON ▶</span>
      </div>
    </div>
  );
}

export function PinBlockerScreen() {
  const fullName = window.localStorage.getItem("pageme_user_name") || "";
  const firstName = fullName.trim().split(" ")[0];
  const greeting = firstName ? `Hi ${firstName}, P` : "P";
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>★ ACTIVATE PIN ★</LcdLine>
      <div style={{ padding: "8px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" style={{ fontSize: "1.0em", lineHeight: "1.4" }}>
          {greeting}ageMe needs to stay pinned to make You stay Focused.
        </LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.8em", marginTop: 8 }}>
          (Press SELECT button on pad below)
        </LcdLine>
      </div>
      <div className="lcd-page-foot">
        <span /><span>SELECT ▶</span>
      </div>
    </div>
  );
}

export function PinPromptScreen() {
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ PIN PAGER ━</LcdLine>
      <div style={{ padding: "8px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" style={{ fontSize: "0.88em", lineHeight: "1.5" }}>
          ANDROID WILL SHOW A<br/>SYSTEM LOCK DIALOG.<br/>THIS IS NORMAL.
        </LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.78em", marginTop: 8 }}>
          (Tap "Got it" in the Android<br/>dialog to activate lock mode)
        </LcdLine>
      </div>
      <div className="lcd-page-foot">
        <span>ESC ▶ BACK</span><span>SEND ▶ CONFIRM</span>
      </div>
    </div>
  );
}

export function getTorchLabel() {
  try {
    const locale = (navigator.language || navigator.userLanguage || "en-GB").toLowerCase();
    if (locale.endsWith("-us") || locale.endsWith("-ca") || locale.startsWith("en-us") || locale.startsWith("en-ca")) {
      return "FLASH";
    }
  } catch (e) {}
  return "TORCH";
}

export function FocusSoundChoiceScreen({ selectedIndex }) {
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ FOCUS SOUND ━</LcdLine>
      <div style={{ padding: "8px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" style={{ fontSize: "0.82em", lineHeight: "1.3" }}>
          PLAY SOOTHING RETRO<br/>
          SOUND DURING LOCK?
        </LcdLine>
        <div style={{ marginTop: 6 }}>
          <div className={"lcd-menu-row" + (selectedIndex === 0 ? " selected" : "")}>
            <span className="lcd-menu-arrow">{selectedIndex === 0 ? "▶" : " "}</span>
            <span>YES, PLAY SOUND</span>
          </div>
          <div className={"lcd-menu-row" + (selectedIndex === 1 ? " selected" : "")}>
            <span className="lcd-menu-arrow">{selectedIndex === 1 ? "▶" : " "}</span>
            <span>NO, KEEP SILENT</span>
          </div>
        </div>
      </div>
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SEND ▶ START</span>
      </div>
    </div>
  );
}

export function FocusPagesChoiceScreen({ selectedIndex }) {
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse>━ FOCUS PAGES ━</LcdLine>
      <div style={{ padding: "8px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <LcdLine align="center" style={{ fontSize: "0.82em", lineHeight: "1.3" }}>
          HOW SHOULD PAGES<br/>ARRIVE DURING LOCK?
        </LcdLine>
        <div style={{ marginTop: 6 }}>
          <div className={"lcd-menu-row" + (selectedIndex === 0 ? " selected" : "")}>
            <span className="lcd-menu-arrow">{selectedIndex === 0 ? "▶" : " "}</span>
            <span>NORMALLY (ALERT+FLASH)</span>
          </div>
          <div className={"lcd-menu-row" + (selectedIndex === 1 ? " selected" : "")}>
            <span className="lcd-menu-arrow">{selectedIndex === 1 ? "▶" : " "}</span>
            <span>SILENTLY (INBOX ONLY)</span>
          </div>
        </div>
      </div>
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SEND ▶ LOCK</span>
      </div>
    </div>
  );
}

export function StudyAppsScreen({ apps, selected }) {
  if (!apps || apps.length === 0) {
    return (
      <div className="lcd-page lcd-center">
        <LcdLine align="center" inverse>━ STUDY APPS ━</LcdLine>
        <LcdLine align="center" dim>(no apps configured)</LcdLine>
        <LcdLine align="center" dim style={{ fontSize: "0.78em", marginTop: 8 }}>
          SETTINGS ▶ STUDY APPS
        </LcdLine>
      </div>
    );
  }
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ STUDY APPS ━</LcdLine>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "8px 0" }}>
        {apps.map((app, i) => (
          <div key={app.packageName} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
            <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
            <span style={{ flex: 1 }}>{app.name.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SEND ▶ LAUNCH</span>
      </div>
    </div>
  );
}

export function EmergencyScreen({ options, selected }) {
  return (
    <div className="lcd-page">
      <LcdLine align="center" inverse>━ EMERGENCY ━</LcdLine>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4px 0" }}>
        {(options || []).map((opt, i) => (
          <div key={opt.id} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
            <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
            <span style={{ flex: 1 }}>{opt.label}</span>
          </div>
        ))}
      </div>
      <div className="lcd-page-foot">
        <span>▲▼ NAV</span><span>SEND ▶ SELECT</span>
      </div>
    </div>
  );
}

export function StudyConfigOverlay({ onSave, onCancel }) {
  const ucn = localStorage.getItem("pageme_cap_code") || "";
  const studyKey = `pageme_study_apps_${ucn}`;
  const SOCIAL_BLOCKLIST = new Set([
    "com.instagram.android", "com.facebook.katana", "com.facebook.lite",
    "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.ss.android.ugc.aweme",
    "com.linkedin.android", "com.twitter.android", "com.snapchat.android",
    "com.reddit.frontpage", "com.pinterest", "com.tumblr", "com.bereal.ft",
    "com.bumble.app", "com.tinder", "com.badoo.mobile", "com.vkontakte.android",
    "com.x.android",
  ]);
  const [apps, setApps] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState(() =>
    readJsonStorage(studyKey, []).map(a => a.packageName).filter(Boolean)
  );
  const [usagePermGranted, setUsagePermGranted] = React.useState(true);
  const [overlayPermGranted, setOverlayPermGranted] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (window.Capacitor) {
          const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
          if (NotificationReceiverPlugin) {
            if (typeof NotificationReceiverPlugin.checkUsageStatsPermission === 'function') {
              const uRes = await NotificationReceiverPlugin.checkUsageStatsPermission();
              setUsagePermGranted(!!uRes.granted);
            }
            if (typeof NotificationReceiverPlugin.checkOverlayPermission === 'function') {
              const oRes = await NotificationReceiverPlugin.checkOverlayPermission();
              setOverlayPermGranted(!!oRes.granted);
            }
            if (typeof NotificationReceiverPlugin.getInstalledApps === 'function') {
              const res = await NotificationReceiverPlugin.getInstalledApps();
              const fetched = (res.apps || []).filter(a => !SOCIAL_BLOCKLIST.has(a.packageName));
              const savedApps = readJsonStorage(studyKey, []);
              const fetchedPkgs = new Set(fetched.map(a => a.packageName));
              const orphans = savedApps
                .filter(a => !fetchedPkgs.has(a.packageName))
                .map(a => ({ ...a, _orphan: true }));
              setApps([...fetched, ...orphans]);
            }
          }
        }
      } catch (e) { console.error("getInstalledApps failed", e); }
      setLoading(false);
    }
    load();
  }, []);

  const toggle = (pkg) => {
    setSelected(prev =>
      prev.includes(pkg) ? prev.filter(p => p !== pkg)
        : prev.length >= 3 ? prev
        : [...prev, pkg]
    );
  };

  const save = () => {
    const data = selected.map(pkg => ({
      name: (apps.find(a => a.packageName === pkg) || {}).name || pkg,
      packageName: pkg,
    }));
    writeJsonStorage(studyKey, data);
    onSave(data);
  };

  const overlayStyle = {
    position: "fixed", inset: 0, zIndex: 999,
    background: "#0d1408", display: "flex", flexDirection: "column",
    padding: "32px 24px 40px", color: "#e8e6df", overflowY: "auto",
  };
  const btnBase = {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px",
    padding: "14px 20px", borderRadius: "12px", border: 0, cursor: "pointer",
    marginBottom: "10px",
  };

  return (
    <div style={overlayStyle}>
      <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: "11px", letterSpacing: "0.22em", color: "#9bbf3a", marginBottom: "8px" }}>STUDY MODE</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", marginBottom: "4px" }}>Study App Access</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "rgba(232,230,223,0.6)", marginBottom: "16px", lineHeight: "1.5" }}>
        Choose up to 3 apps you can launch during a study session.<br/>
        Social media &amp; doom-scroll apps are excluded.
      </div>

      {(!usagePermGranted || !overlayPermGranted) && (
        <div style={{
          background: "rgba(235, 94, 40, 0.12)",
          border: "1px solid rgba(235, 94, 40, 0.35)",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "16px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "12px",
          lineHeight: "1.4"
        }}>
          <div style={{ color: "#eb5e28", fontWeight: "bold", marginBottom: "6px" }}>Permissions Required for Watchdog Enforcement</div>
          <div style={{ color: "rgba(232, 230, 223, 0.8)", marginBottom: "10px" }}>
            To enforce study lock and prevent usage of notifications/other apps, please grant the following permissions:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {!usagePermGranted && (
              <button onClick={async () => {
                const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
                if (NRP && typeof NRP.requestUsageStatsPermission === 'function') {
                  await NRP.requestUsageStatsPermission();
                  setTimeout(async () => {
                    const res = await NRP.checkUsageStatsPermission();
                    setUsagePermGranted(!!res.granted);
                  }, 2000);
                }
              }} style={{
                background: "#eb5e28", color: "#0d1408", border: 0, padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace"
              }}>
                Grant Usage Access
              </button>
            )}
            {!overlayPermGranted && (
              <button onClick={async () => {
                const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
                if (NRP && typeof NRP.requestOverlayPermission === 'function') {
                  await NRP.requestOverlayPermission();
                  setTimeout(async () => {
                    const res = await NRP.checkOverlayPermission();
                    setOverlayPermGranted(!!res.granted);
                  }, 2000);
                }
              }} style={{
                background: "#eb5e28", color: "#0d1408", border: 0, padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace"
              }}>
                Grant Display Over Other Apps
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "rgba(155,191,58,0.8)", marginBottom: "8px" }}>
        {selected.length}/3 selected
      </div>
      {loading && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "rgba(232,230,223,0.5)", marginBottom: "12px" }}>Loading installed apps…</div>}
      {!loading && !window.Capacitor && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "rgba(232,230,223,0.45)", marginBottom: "16px", padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,0.03)" }}>
          App list is only available on device.
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {apps.map(app => {
          const isSel = selected.includes(app.packageName);
          const isOff = !isSel && selected.length >= 3;
          return (
            <div key={app.packageName} onClick={() => !isOff && toggle(app.packageName)} style={{
              display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px",
              background: isSel ? "rgba(155,191,58,0.12)" : "rgba(255,255,255,0.03)",
              border: "1px solid " + (isSel ? "rgba(155,191,58,0.5)" : "rgba(255,255,255,0.07)"),
              borderRadius: "8px", cursor: isOff ? "not-allowed" : "pointer", opacity: isOff ? 0.4 : 1,
            }}>
              <div style={{
                width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
                border: "2px solid " + (isSel ? "#9bbf3a" : "rgba(255,255,255,0.25)"),
                background: isSel ? "#9bbf3a" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isSel && <span style={{ color: "#0d1408", fontSize: "11px", fontWeight: "bold" }}>✓</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>{app.name}</span>
                {app._orphan && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "rgba(232,230,223,0.4)" }}>PREVIOUSLY SELECTED</span>}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={save} style={{ ...btnBase, background: "#9bbf3a", color: "#0d1408" }}>Save Study Apps</button>
      <button onClick={onCancel} style={{ ...btnBase, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(232,230,223,0.6)", fontWeight: 400, fontSize: "13px" }}>Cancel</button>
    </div>
  );
}

export function FocusAutomationOverlay({
  initialConfig, status, onSave, onCancel, onRequestHome,
  onRequestCalendar, onRequestReminderNotifications, onRequestExactAlarm,
  onRequestAutoLaunch, onSyncCalendar, onCancelActivation,
}) {
  const [config, setConfig] = React.useState(() => normalizeFocusSchedule(initialConfig));
  const [saving, setSaving] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const closeTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(closeTimer.current), []);
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const update = (key, value) => setConfig(current => ({ ...current, [key]: value }));
  const toggleDay = (day) => update("weekdays",
    config.weekdays.includes(day) ? config.weekdays.filter(value => value !== day) : [...config.weekdays, day].sort());
  const todayDate = React.useMemo(() => localDateInputValue(), []);
  const effectiveDate = config.date && config.date >= todayDate ? config.date : todayDate;
  const configForSubmit = () => normalizeFocusSchedule({ ...config, date: effectiveDate });
  const field = {
    width: "100%", boxSizing: "border-box", borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.18)", background: "#151c10", color: "#f4f1e8",
    padding: "11px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: "14px",
  };
  const section = {
    borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "16px", marginTop: "16px",
  };
  const button = {
    borderRadius: "6px", border: 0, padding: "12px 14px", cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
  };
  const save = async () => {
    const calendarTakeover = config.calendarEnabled && config.calendarAction === "activate";
    const takeoverEnabled = config.enabled || calendarTakeover;
    if ((config.enabled || config.calendarEnabled) && !status.exactAlarmAllowed) {
      setMessage("Allow precise alarms before saving an active automation");
      return;
    }
    if (config.calendarEnabled && !status.calendarPermission) {
      setMessage("Allow calendar access before saving calendar reminders");
      return;
    }
    if (config.calendarEnabled && !calendarTakeover && !status.reminderNotificationsAllowed) {
      setMessage("Allow reminder notifications before saving calendar reminders");
      return;
    }
    if (takeoverEnabled && !status.launcherDefault) {
      setMessage("Allow PageMe as Home before saving an active automation");
      return;
    }
    if (takeoverEnabled && !status.autoLaunchAllowed) {
      setMessage("Allow automatic launch before saving an active automation");
      return;
    }
    setSaving(true); setMessage("");
    try {
      const candidate = configForSubmit();
      const validationError = oneTimeScheduleError(candidate);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const result = await onSave(candidate);
      const next = result?.nextTriggerAt > Date.now()
        ? ` Next: ${new Date(result.nextTriggerAt).toLocaleString()}`
        : "";
      setMessage(`Automation saved.${next}`);
      closeTimer.current = setTimeout(onCancel, 1000);
    } catch (error) {
      setMessage(error?.message || "Could not save automation");
    } finally {
      setSaving(false);
    }
  };
  const cancelScheduledActivation = async () => {
    setSaving(true); setMessage("");
    try {
      const cancelled = normalizeFocusSchedule({ ...config, enabled: false });
      await onCancelActivation(cancelled);
      setConfig(cancelled);
      setMessage("Scheduled activation cancelled. Calendar reminders were not changed.");
      closeTimer.current = setTimeout(onCancel, 1000);
    } catch (error) {
      setMessage(error?.message || "Could not cancel scheduled activation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#0d1408", color: "#e8e6df", overflowY: "auto", padding: "28px 22px 36px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: 11, color: "#9bbf3a", marginBottom: 8 }}>FOCUS AUTOMATION</div>
        <h2 style={{ margin: "0 0 6px", fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}>Schedule PageMe</h2>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(232,230,223,0.62)", lineHeight: 1.5 }}>
          Next automation: {status.nextTriggerAt > Date.now() ? new Date(status.nextTriggerAt).toLocaleString() : "not scheduled"}
        </div>

        <div style={section}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
            Scheduled activation
            <input type="checkbox" checked={config.enabled} onChange={event => setConfig(current => {
              const updated = { ...current, enabled: event.target.checked };
              return event.target.checked ? futureOneTimeSelection(updated) : updated;
            })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {[{ id: "weekly", label: "Weekly" }, { id: "once", label: "One time" }].map(option => (
              <button key={option.id} onClick={() => setConfig(current => {
                const updated = {
                  ...current,
                  mode: option.id,
                  date: option.id === "once" && (!current.date || current.date < todayDate) ? todayDate : current.date,
                };
                return option.id === "once" ? futureOneTimeSelection(updated) : updated;
              })} style={{ ...button, background: config.mode === option.id ? "#9bbf3a" : "#20281a", color: config.mode === option.id ? "#0d1408" : "#e8e6df" }}>{option.label}</button>
            ))}
          </div>
          {config.mode === "once" && <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>Date<input type="date" min={todayDate} value={effectiveDate} onChange={event => update("date", event.target.value)} style={{ ...field, marginTop: 6 }} /></label>}
          <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>Start time<input type="time" value={config.time} onChange={event => update("time", event.target.value)} style={{ ...field, marginTop: 6 }} /></label>
          {config.mode === "weekly" && <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginTop: 12 }}>{days.map((label, day) => <button key={day} onClick={() => toggleDay(day)} aria-label={`Day ${day}`} style={{ ...button, padding: "10px 0", background: config.weekdays.includes(day) ? "#9bbf3a" : "#20281a", color: config.weekdays.includes(day) ? "#0d1408" : "#e8e6df" }}>{label}</button>)}</div>}
          <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>Focus duration<select value={config.durationMinutes} onChange={event => update("durationMinutes", Number(event.target.value))} style={{ ...field, marginTop: 6 }}>{[15,30,45,60,90,120,180,240].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
        </div>

        <div style={section}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
            Calendar reminders
            <input type="checkbox" checked={config.calendarEnabled} onChange={event => update("calendarEnabled", event.target.checked)} />
          </label>
          <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>Event title keywords<input value={config.calendarKeyword} onChange={event => update("calendarKeyword", event.target.value)} placeholder="focus,study" style={{ ...field, marginTop: 6 }} /></label>
          <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>Reminder lead time<select value={config.calendarLeadMinutes} onChange={event => update("calendarLeadMinutes", Number(event.target.value))} style={{ ...field, marginTop: 6 }}>{[0,5,10,15,30,60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
          <label style={{ display: "block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>When the reminder is due<select value={config.calendarAction} onChange={event => update("calendarAction", event.target.value)} style={{ ...field, marginTop: 6 }}><option value="remind">Send reminder only</option><option value="activate">Activate PageMe</option></select></label>
          <div style={{ marginTop: 7, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.45, color: "rgba(232,230,223,0.55)" }}>
            {config.calendarAction === "activate" ? "Matching events start PageMe for the selected focus duration." : "Matching events show a reminder and do not pin or take over the phone."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            <button onClick={onRequestCalendar} style={{ ...button, background: status.calendarPermission ? "#26321e" : "#eb5e28", color: status.calendarPermission ? "#9bbf3a" : "#0d1408" }}>{status.calendarPermission ? "Calendar access granted" : "Allow calendar"}</button>
            <button onClick={async () => {
              setSyncing(true); setMessage("");
              try {
                const candidate = configForSubmit();
                const validationError = oneTimeScheduleError(candidate);
                if (validationError) {
                  setMessage(validationError);
                  return;
                }
                const result = await onSyncCalendar(candidate);
                setMessage(calendarSyncSummary(result));
              } catch (error) {
                setMessage(error?.message || "Calendar sync failed");
              } finally {
                setSyncing(false);
              }
            }} disabled={!status.calendarPermission || !config.calendarEnabled || syncing} style={{ ...button, background: "#26321e", color: "#e8e6df", opacity: status.calendarPermission && config.calendarEnabled ? 1 : 0.45 }}>{syncing ? "Scanning..." : "Scan calendar now"}</button>
          </div>
        </div>

        <div style={section}>
          {(config.enabled || config.calendarEnabled) && !status.exactAlarmAllowed && <button onClick={() => { setMessage("Opening Android precise alarm access..."); onRequestExactAlarm(); }} style={{ ...button, width: "100%", marginBottom: 8, background: "#eb5e28", color: "#0d1408" }}>Allow precise alarms</button>}
          {config.calendarEnabled && config.calendarAction !== "activate" && !status.reminderNotificationsAllowed && <button onClick={onRequestReminderNotifications} style={{ ...button, width: "100%", marginBottom: 8, background: "#eb5e28", color: "#0d1408" }}>Allow reminder notifications</button>}
          {(config.enabled || (config.calendarEnabled && config.calendarAction === "activate")) && !status.launcherDefault && <button onClick={onRequestHome} style={{ ...button, width: "100%", marginBottom: 8, background: "#eb5e28", color: "#0d1408" }}>Allow PageMe as Home</button>}
          {(config.enabled || (config.calendarEnabled && config.calendarAction === "activate")) && !status.autoLaunchAllowed && <button onClick={() => { setMessage("Opening Android automatic launch access..."); onRequestAutoLaunch(); }} style={{ ...button, width: "100%", marginBottom: 8, background: "#eb5e28", color: "#0d1408" }}>Allow automatic launch</button>}
          {message && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#9bbf3a", margin: "8px 0" }}>{message}</div>}
          <button onClick={save} disabled={saving} style={{ ...button, width: "100%", background: "#9bbf3a", color: "#0d1408", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save automation"}</button>
          {initialConfig?.enabled && <button onClick={cancelScheduledActivation} disabled={saving} style={{ ...button, width: "100%", marginTop: 8, background: "#2b1712", border: "1px solid rgba(235,94,40,0.55)", color: "#ff9b76", opacity: saving ? 0.6 : 1 }}>Cancel scheduled activation</button>}
          <button onClick={onCancel} style={{ ...button, width: "100%", marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(232,230,223,0.7)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function EmergencyContactOverlay({ initialContact, onSave, onCancel }) {
  const [name, setName] = React.useState((initialContact || {}).name || "");
  const [number, setNumber] = React.useState((initialContact || {}).number || "");
  const [suggestions, setSuggestions] = React.useState([]);
  const [showSugg, setShowSugg] = React.useState(false);
  const [contactsAllowed, setContactsAllowed] = React.useState(null);
  const [permPending, setPermPending] = React.useState(false);
  const searchTimeout = React.useRef(null);

  React.useEffect(() => {
    let mounted = true;
    const plugin = window.Capacitor?.Plugins?.NotificationReceiverPlugin;
    if (!plugin || typeof plugin.checkContactsPermission !== 'function') {
      setContactsAllowed(false);
      return () => { mounted = false; };
    }
    plugin.checkContactsPermission()
      .then(result => { if (mounted) setContactsAllowed(!!result?.granted); })
      .catch(() => { if (mounted) setContactsAllowed(false); });
    return () => { mounted = false; clearTimeout(searchTimeout.current); };
  }, []);

  const allowContacts = async () => {
    const plugin = window.Capacitor?.Plugins?.NotificationReceiverPlugin;
    if (!plugin || typeof plugin.requestContactsPermission !== 'function') return;
    setPermPending(true);
    try {
      const result = await plugin.requestContactsPermission();
      setContactsAllowed(!!result?.granted);
    } finally {
      setPermPending(false);
    }
  };

  const searchContacts = (q) => {
    clearTimeout(searchTimeout.current);
    if (!contactsAllowed || !q || q.length < 1) { setSuggestions([]); setShowSugg(false); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        if (window.Capacitor) {
          const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
          if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.searchContacts === 'function') {
            const res = await NotificationReceiverPlugin.searchContacts({ query: q });
            if (res.permissionRequired) {
              setContactsAllowed(false);
              setSuggestions([]);
              setShowSugg(false);
            } else {
              setPermPending(false);
              setSuggestions(res.contacts || []);
              setShowSugg((res.contacts || []).length > 0);
            }
          }
        }
      } catch (e) { setSuggestions([]); }
    }, 250);
  };

  const pickSuggestion = (c) => {
    setName(c.name);
    setNumber(c.number);
    setSuggestions([]);
    setShowSugg(false);
  };

  const save = () => {
    const contact = { name: name.trim(), number: number.trim() };
    const ucn = localStorage.getItem("pageme_cap_code") || "";
    writeJsonStorage(`pageme_emergency_contact_${ucn}`, contact);
    onSave(contact);
  };

  const overlayStyle = {
    position: "fixed", inset: 0, zIndex: 999,
    background: "#0d1408", display: "flex", flexDirection: "column",
    padding: "32px 24px 40px", color: "#e8e6df", overflowY: "auto",
  };
  const inputStyle = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: "14px",
    padding: "10px 12px", borderRadius: "8px",
    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const btnBase = {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px",
    padding: "14px 20px", borderRadius: "12px", border: 0, cursor: "pointer",
    marginBottom: "10px", width: "100%",
  };

  return (
    <div style={overlayStyle}>
      <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: "11px", letterSpacing: "0.22em", color: "#9bbf3a", marginBottom: "8px" }}>EMERGENCY SOS</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", marginBottom: "4px" }}>Emergency Contact</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "rgba(232,230,223,0.6)", marginBottom: "24px", lineHeight: "1.5" }}>
        Start typing a contact name — matching contacts appear below.<br/>
        Tap a match to auto-fill the number. Trigger: ESC × 3.
      </div>
      {contactsAllowed === false && (
        <button onClick={allowContacts} disabled={permPending} style={{ ...btnBase, background: "#26321e", color: "#e8e6df", marginBottom: "16px" }}>
          {permPending ? "Waiting for permission..." : "Use phone contacts"}
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(232,230,223,0.7)" }}>Contact Name</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); searchContacts(e.target.value); }}
            onFocus={() => { if (suggestions.length) setShowSugg(true); }}
            placeholder="e.g. Mom"
            maxLength={50}
            style={inputStyle}
            autoComplete="off"
          />
          {showSugg && suggestions.length > 0 && (
            <div style={{
              width: "100%", zIndex: 10,
              background: "#0c1207", border: "1px solid rgba(155,191,58,0.4)",
              borderRadius: "8px", marginTop: "4px", overflowY: "auto", maxHeight: "220px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
            }}>
              {suggestions.map((c, i) => (
                <div key={i} onMouseDown={() => pickSuggestion(c)} onClick={() => pickSuggestion(c)}
                  style={{
                    padding: "12px 14px", cursor: "pointer",
                    borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    display: "flex", flexDirection: "column", gap: "2px",
                    background: "transparent",
                  }}
                  onTouchStart={e => e.currentTarget.style.background = "rgba(155,191,58,0.12)"}
                  onTouchEnd={e => { pickSuggestion(c); e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "#f4f1e8" }}>{c.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(155,191,58,0.7)" }}>{c.number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(232,230,223,0.7)" }}>Phone Number</label>
          <input
            type="tel"
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder="Auto-fills when contact selected"
            maxLength={20}
            style={inputStyle}
          />
        </div>
      </div>
      <button onClick={save} disabled={!number.trim()} style={{ ...btnBase, marginTop: "20px", background: number.trim() ? "#9bbf3a" : "rgba(155,191,58,0.3)", color: "#0d1408" }}>Save Contact</button>
      <button onClick={onCancel} style={{ ...btnBase, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(232,230,223,0.6)", fontWeight: 400, fontSize: "13px" }}>Cancel</button>
    </div>
  );
}

export function AlarmOverlay({ info, selected }) {
  const actions = info?.actions?.length
    ? info.actions
    : [{ label: "STOP / CANCEL", index: -1 }];
  return (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" inverse blink>━ ALARM ━</LcdLine>
      <LcdLine align="center" style={{ marginTop: 8, fontSize: "1.1em" }}>{info?.from || "ALARM"}</LcdLine>
      {info?.text ? <LcdLine align="center" dim style={{ fontSize: "0.85em" }}>{info.text}</LcdLine> : null}
      <div style={{ marginTop: 10 }}>
        {actions.map((act, i) => (
          <div key={i} className={"lcd-menu-row" + (i === selected ? " selected" : "")}>
            <span className="lcd-menu-arrow">{i === selected ? "▶" : " "}</span>
            <span>{act.label}</span>
          </div>
        ))}
      </div>
      <div className="lcd-page-foot"><span>ESC DISMISS</span><span>SEND SELECT</span></div>
    </div>
  );
}
