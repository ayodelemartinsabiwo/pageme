// app.jsx — main PageMe app: activation gate → pager mode

import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { blip, pageAlert, buttonClick, bootChime, startFocusSound, stopFocusSound } from './audio.js';
import { PAGER_CODES, SEED_INBOX, INCOMING_QUEUE } from './data.jsx';
import {
  cycle, getAppSourceCategory, getInboxCategoryItems, getInboxContacts,
  getInboxMessages, nowFormat, safeFormatTime, safeFormatDate,
} from './utils.js';
import { postPageMe } from './api.js';
import { PAGEME_SCRIPT_URL, REQUIRE_SERVER_SESSION } from './config.js';
import { readJsonStorage, writeJsonStorage } from './storage.js';
import { clearSessionTokenSecure, getSessionToken } from './identity.js';
import { DUPLICATE_PAGE_WINDOW_MS, inboxStorageKey, normalizeInbox, pageContentKey } from './inbox.js';
import {
  createClientMessageId, mergeNetworkMessages, messageCursorStorageKey,
  isRetryableMessageError, MESSAGE_SYNC_INTERVAL_MS, newIncomingNetworkMessages, normalizeUcn,
  pruneExpiredNetworkMessages,
} from './messaging.js';
import { shouldSyncPagerMode } from './lifecycle.js';
import { shouldStartLora } from './lora.js';
import { DEFAULT_FOCUS_SCHEDULE, focusScheduleSummary, normalizeFocusSchedule } from './focus-schedule.js';
import { deleteBeforeTextCursor, insertTextAtCursor, moveTextCursor } from './compose-editing.js';
import {
  STATUS_SHARE_SETTING_KEY,
  askToShareStatus, buildStatusShareMessage, buildStatusShareText, clearStoredStatus, readStoredStatus,
  shouldOfferFocusShare, statusTokenFromUrl, writeStoredStatus,
} from './status-sharing.js';
import { ActivationScreen } from './activation.jsx';
import { PagerChassis, Keyboard } from './device.jsx';
import { HorizontalPagerChassis, RotateHint } from './horizontal.jsx';
import {
  StatusBar, BootScreen, HomeScreen, MenuScreen, InboxScreen,
  ReadScreen, ComposeScreen, SendingScreen, CodesScreen,
  SettingsScreen, IncomingOverlay, AboutScreen, TimerScreen,
  FocusLockedScreen, CustomTimerScreen, WelcomeScreen,
  PinBlockerScreen, PinPromptScreen, FocusSoundChoiceScreen,
  FocusPagesChoiceScreen, StudyAppsScreen, EmergencyScreen,
  StudyConfigOverlay, EmergencyContactOverlay, AlarmOverlay, ClearInboxScreen,
  DeleteAccountScreen, FocusAutomationOverlay, MessageActionsScreen, BlockedUsersScreen,
  StatusShareScreen,
} from './screens.jsx';
import {
  useTweaks, TweaksPanel, TweakSection, TweakRadio,
  TweakToggle, TweakSlider, TweakButton,
} from './tweaks-panel.jsx';
import { LcdLine } from './screens.jsx';

const TWEAK_DEFAULTS = {
  lcdColor: "green",
  housing: "black",
  font: "lcd",
  backlight: true,
  sound: false,
  battery: 0.78,
  formFactor: "mobile",
};

const MENU_ITEMS_BASE = [
  { id: "inbox",    label: "INBOX" },
  { id: "compose",  label: "COMPOSE" },
  { id: "codes",    label: "CODE BOOK" },
  { id: "study",    label: "STUDY APPS" },
  { id: "timer",    label: "FOCUS TIMER" },
  { id: "share_status", label: "SHARE STATUS" },
  { id: "settings", label: "SETTINGS" },
];

async function copyText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await Clipboard.write({ string: value });
    return true;
  } catch (_) {}
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; }
    catch (_) {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try { copied = document.execCommand("copy"); }
  catch (_) {}
  textarea.remove();
  return copied;
}

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const [reAuthNeeded] = React.useState(() => {
    if (localStorage.getItem("pageme_activated") !== "true") return false;
    if (!localStorage.getItem("pageme_cap_code")) return false;
    if (REQUIRE_SERVER_SESSION && !getSessionToken()) return true;
    const last = parseInt(localStorage.getItem("pageme_last_active") || "0", 10);
    return Date.now() - last >= SEVEN_DAYS_MS;
  });
  const [activated, setActivated] = React.useState(() => {
    if (localStorage.getItem("pageme_activated") !== "true") return false;
    if (!localStorage.getItem("pageme_cap_code")) return false;
    if (REQUIRE_SERVER_SESSION && !getSessionToken()) return false;
    const last = parseInt(localStorage.getItem("pageme_last_active") || "0", 10);
    return Date.now() - last < SEVEN_DAYS_MS;
  });
  const [screen, setScreen] = React.useState("boot");
  const [bootStage, setBootStage] = React.useState(0);
  const [now, setNow] = React.useState(new Date());
  const [powerHoldProgress, setPowerHoldProgress] = React.useState(0);
  const powerHoldInterval = React.useRef(null);
  const previousScreen = React.useRef("home");

  const timerOptions = [
    { id: "off",    label: "OFF",        duration: 0 },
    { id: "15m",    label: "15 MINUTES", duration: 15 * 60 * 1000 },
    { id: "30m",    label: "30 MINUTES", duration: 30 * 60 * 1000 },
    { id: "1h",     label: "1 HOUR",     duration: 60 * 60 * 1000 },
    { id: "2h",     label: "2 HOURS",    duration: 120 * 60 * 1000 },
    { id: "4h",     label: "4 HOURS",    duration: 240 * 60 * 1000 },
    { id: "custom", label: "CUSTOM...",  duration: -1 },
  ];

  const [focusLockUntil, setFocusLockUntil] = React.useState(() => {
    const val = localStorage.getItem("pageme_focus_lock_until");
    return val ? parseInt(val, 10) : 0;
  });
  const [timerSel, setTimerSel] = React.useState(0);
  const [customTimerVal, setCustomTimerVal] = React.useState("");
  const [isPinned, setIsPinned] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  const [pendingDuration, setPendingDuration] = React.useState(0);
  const [choiceSel, setChoiceSel] = React.useState(0);
  const [focusSoundEnabled, setFocusSoundEnabled] = React.useState(() =>
    localStorage.getItem("pageme_focus_sound_enabled") === "true"
  );
  const [focusSilentPages, setFocusSilentPages] = React.useState(() =>
    localStorage.getItem("pageme_focus_silent_pages") === "true"
  );
  const [askShareStatus, setAskShareStatus] = React.useState(() => askToShareStatus());
  const [activeStatusLink, setActiveStatusLink] = React.useState(() => readStoredStatus());
  const [statusShareContext, setStatusShareContext] = React.useState(null);
  const [statusShareSel, setStatusShareSel] = React.useState(0);
  const [statusShareBusy, setStatusShareBusy] = React.useState(false);
  const [statusShareError, setStatusShareError] = React.useState("");
  const [inboundStatusToken, setInboundStatusToken] = React.useState("");
  const [deepLinkAccess, setDeepLinkAccess] = React.useState(false);
  const [focusAutomation, setFocusAutomation] = React.useState(() => normalizeFocusSchedule(
    readJsonStorage("pageme_focus_schedule", DEFAULT_FOCUS_SCHEDULE)
  ));
  const [focusAutomationStatus, setFocusAutomationStatus] = React.useState({
    nextTriggerAt: 0, calendarPermission: false, exactAlarmAllowed: true,
    autoLaunchAllowed: false, reminderNotificationsAllowed: false, launcherDefault: false,
  });
  const torchTimeoutRef = React.useRef(null);
  const torchBusyRef = React.useRef(false);

  const [studyApps, setStudyApps] = React.useState(() => {
    const ucn = localStorage.getItem("pageme_cap_code") || "";
    const key = `pageme_study_apps_${ucn}`;
    if (!localStorage.getItem(key) && localStorage.getItem("pageme_study_apps")) {
      localStorage.setItem(key, localStorage.getItem("pageme_study_apps"));
    }
    return readJsonStorage(key, []);
  });
  const [studySel, setStudySel] = React.useState(0);
  const [emergSel, setEmergSel] = React.useState(0);
  const [emergContact, setEmergContact] = React.useState(() => {
    const ucn = localStorage.getItem("pageme_cap_code") || "";
    const key = `pageme_emergency_contact_${ucn}`;
    if (!localStorage.getItem(key) && localStorage.getItem("pageme_emergency_contact")) {
      localStorage.setItem(key, localStorage.getItem("pageme_emergency_contact"));
    }
    return readJsonStorage(key, {});
  });
  const escPressLog = React.useRef([]);
  const recentMessages = React.useRef([]);
  const firstActivation = React.useRef(true);
  const pinRequestPending = React.useRef(false);
  const pinVerificationTimer = React.useRef(null);
  const nativePagerModeWasActive = React.useRef(
    localStorage.getItem("pageme_activated") === "true"
  );
  const [alarmInfo, setAlarmInfo] = React.useState(null);
  const [alarmSel, setAlarmSel] = React.useState(0);
  const [clearInboxSel, setClearInboxSel] = React.useState(0);
  const [deleteAccountSel, setDeleteAccountSel] = React.useState(0);
  const [accountDeleting, setAccountDeleting] = React.useState(false);
  const [messageActionSel, setMessageActionSel] = React.useState(0);
  const [messageActionBusy, setMessageActionBusy] = React.useState(false);
  const [blockedUcns, setBlockedUcns] = React.useState([]);
  const [blockedSel, setBlockedSel] = React.useState(0);
  const [blockedLoading, setBlockedLoading] = React.useState(false);
  const [blockedBusy, setBlockedBusy] = React.useState(false);
  const clearInboxReturnScreen = React.useRef("inbox");
  const [studyAppActive, setStudyAppActive] = React.useState(() =>
    localStorage.getItem("pageme_study_app_active") === "true"
  );
  const [emergencyUntil, setEmergencyUntil] = React.useState(() =>
    parseInt(localStorage.getItem("pageme_emergency_until") || "0", 10)
  );

  React.useEffect(() => {
    if (!window.Capacitor) return;
    const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
    if (!NRP || typeof NRP.getPagerModeState !== 'function') return;
    NRP.getPagerModeState()
      .then((state) => {
        nativePagerModeWasActive.current = !!state?.active;
        if (!state?.active || state.bypassRelaunch) return;
        const hasProfile = !!localStorage.getItem("pageme_cap_code");
        const hasSession = !REQUIRE_SERVER_SESSION || !!getSessionToken();
        if (!hasProfile || !hasSession) return;
        localStorage.setItem("pageme_last_active", String(Date.now()));
        setActivated(true);
        setScreen("boot");
        setBootStage(0);
      })
      .catch((error) => console.error("Unable to restore scheduled Pager Mode", error));
  }, []);

  const updateFocusSoundEnabled = (val) => {
    setFocusSoundEnabled(val);
    localStorage.setItem("pageme_focus_sound_enabled", val ? "true" : "false");
  };
  const updateFocusSilentPages = (val) => {
    setFocusSilentPages(val);
    localStorage.setItem("pageme_focus_silent_pages", val ? "true" : "false");
  };

  const checkPinStatus = React.useCallback(async () => {
    if (!window.Capacitor) return;
    const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
    if (!NRP || typeof NRP.isAppPinned !== 'function') return;
    try {
      const res = await NRP.isAppPinned();
      const pinned = !!res.isPinned;
      setIsPinned(pinned);
      if (res.pagerModeActive === false || res.bypassRelaunch) return;
      if (pinned) {
        pinRequestPending.current = false;
        if (pinVerificationTimer.current) clearTimeout(pinVerificationTimer.current);
        setScreen(s => s === "pin-prompt" ? "home" : s);
      } else if (activated) {
        const inEmergency = parseInt(localStorage.getItem("pageme_emergency_until") || "0", 10) > Date.now();
        const studyActive = localStorage.getItem("pageme_study_app_active") === "true";
        if (!inEmergency && !studyActive && !pinRequestPending.current && typeof NRP.pinApp === 'function') {
          pinRequestPending.current = true;
          await NRP.pinApp();
          if (pinVerificationTimer.current) clearTimeout(pinVerificationTimer.current);
          pinVerificationTimer.current = setTimeout(async () => {
            try {
              const verified = await NRP.isAppPinned();
              if (verified?.isPinned) {
                pinRequestPending.current = false;
                setIsPinned(true);
                setScreen(s => s === "pin-prompt" ? "home" : s);
              } else if (verified?.pagerModeActive !== false && !verified?.bypassRelaunch) {
                setScreen("pin-prompt");
              }
            } catch (error) {
              console.error("Unable to verify screen pinning", error);
              setScreen("pin-prompt");
            }
          }, 1800);
        }
      }
    } catch (e) {
      pinRequestPending.current = false;
      console.error("Error checking pin status", e);
      if (activated) setScreen("pin-prompt");
    }
  }, [activated]);

  React.useEffect(() => () => {
    if (pinVerificationTimer.current) clearTimeout(pinVerificationTimer.current);
  }, []);

  const updateFocusLock = (newLock) => {
    setFocusLockUntil(newLock);
    localStorage.setItem("pageme_focus_lock_until", String(newLock));
    if (window.Capacitor) {
      const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
      if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.setFocusLockUntil === 'function') {
        NotificationReceiverPlugin.setFocusLockUntil({ lockUntil: newLock });
      }
    }
  };

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!activated) return;
    setScreen("boot"); setBootStage(0);
    const t1 = setTimeout(() => setBootStage(1), 900);
    const t2 = setTimeout(() => { setBootStage(2); bootChime({ enabled: t.sound }); }, 1900);
    const t3 = setTimeout(async () => {
      firstActivation.current = false;
      const showWelcome = localStorage.getItem("pageme_show_welcome") === "true";
      if (!showWelcome && window.Capacitor) {
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (NRP && typeof NRP.enableLauncher === 'function') NRP.enableLauncher();
      }
      if (!showWelcome) localStorage.setItem("pageme_last_active", String(Date.now()));
      setScreen(current => current === "boot" ? (showWelcome ? "welcome" : "home") : current);
    }, 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated]);

  React.useEffect(() => {
    localStorage.setItem("pageme_activated", activated ? "true" : "false");
    if (window.Capacitor) {
      const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
      if (NotificationReceiverPlugin
          && typeof NotificationReceiverPlugin.setPagerModeActive === 'function'
          && shouldSyncPagerMode(activated, nativePagerModeWasActive.current)) {
        NotificationReceiverPlugin.setPagerModeActive({ active: activated });
      }
    }
    nativePagerModeWasActive.current = activated;
  }, [activated]);

  const initialInboxKey = inboxStorageKey(localStorage.getItem("pageme_cap_code") || "");
  const [inbox, setInbox] = React.useState(() => {
    if (initialInboxKey) return normalizeInbox(readJsonStorage(initialInboxKey, []));
    return window.Capacitor ? [] : SEED_INBOX;
  });
  const inboxScopeRef = React.useRef(initialInboxKey);
  const skipInboxPersistRef = React.useRef(false);
  const inboxRef = React.useRef(inbox);
  const messageSyncBusyRef = React.useRef(false);
  const [inboxSel, setInboxSel] = React.useState(0);
  const [readingId, setReadingId] = React.useState(null);
  const [inboxViewMode, setInboxViewMode] = React.useState("categories");
  const [inboxCategory, setInboxCategory] = React.useState("");
  const [inboxContact, setInboxContact] = React.useState("");
  const [toastMessage, setToastMessage] = React.useState("");

  const showToast = React.useCallback((msg) => {
    setToastMessage(msg);
    if (window.__toastTimeout) clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => setToastMessage(""), 3000);
  }, []);

  const recordProductEvent = React.useCallback(async (event, context = "", statusToken = "") => {
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!capCode || !sessionToken) return false;
    try {
      const response = await postPageMe({
        action: "recordProductEvent", capCode, sessionToken, event, context, statusToken,
      }, { timeoutMs: 5000 });
      return response?.status === "success";
    } catch (_) {
      return false;
    }
  }, []);

  const rememberStatusLink = React.useCallback((status) => {
    if (!writeStoredStatus(status)) return null;
    const stored = readStoredStatus();
    setActiveStatusLink(stored);
    return stored;
  }, []);

  const ensureStatusLink = React.useCallback(async ({ context, focusEndsAt = 0 }) => {
    const now = Date.now();
    const storedExpiry = Date.parse(activeStatusLink?.expiresAt || "");
    const storedFocusEnd = Date.parse(activeStatusLink?.focusEndsAt || "");
    const canReuse = activeStatusLink && storedExpiry > now
      && (context === "focus"
        ? activeStatusLink.context === "focus" && Math.abs(storedFocusEnd - Number(focusEndsAt)) < 1000
        : activeStatusLink.context !== "focus");
    if (canReuse) return activeStatusLink;

    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!capCode || !sessionToken) throw new Error("Sign in again before sharing your PageMe status.");
    const response = await postPageMe({
      action: "createStatusLink", capCode, sessionToken, context,
      focusEndsAt: focusEndsAt ? new Date(focusEndsAt).toISOString() : "",
    });
    if (response?.status !== "success" || !response.token || !response.url) {
      throw new Error(response?.error || "Status sharing is unavailable. Pager Mode can still start normally.");
    }
    const stored = rememberStatusLink({
      token: response.token, url: response.url, context: response.context || context,
      expiresAt: response.expiresAt, focusEndsAt: response.focusEndsAt || "",
    });
    if (!stored) throw new Error("PageMe could not safely retain the status link on this device.");
    return stored;
  }, [activeStatusLink, rememberStatusLink]);

  const shareStatus = React.useCallback(async ({ context, focusEndsAt = 0 }) => {
    const status = await ensureStatusLink({ context, focusEndsAt });
    const message = buildStatusShareMessage({ context, focusEndsAt });
    const text = buildStatusShareText({ context, focusEndsAt, url: status.url });
    recordProductEvent("share_sheet_opened", context, status.token);
    if (window.Capacitor) {
      await Share.share({ title: "My PageMe status", text: message, url: status.url, dialogTitle: "Share PageMe status" });
      return status;
    }
    if (navigator.share) {
      await navigator.share({ title: "My PageMe status", text: message, url: status.url });
      return status;
    }
    if (!(await copyText(status.url))) throw new Error("The link could not be copied on this device.");
    showToast("STATUS LINK COPIED");
    return status;
  }, [ensureStatusLink, recordProductEvent, showToast]);

  const copyStatusLink = React.useCallback(async ({ context, focusEndsAt = 0 }) => {
    const status = await ensureStatusLink({ context, focusEndsAt });
    const text = buildStatusShareText({ context, focusEndsAt, url: status.url });
    if (!(await copyText(text))) throw new Error("The ready-to-send status message could not be copied on this device.");
    showToast("STATUS MESSAGE COPIED");
    return status;
  }, [ensureStatusLink, showToast]);

  const revokeActiveStatus = React.useCallback((context = "") => {
    const status = activeStatusLink || readStoredStatus();
    clearStoredStatus();
    setActiveStatusLink(null);
    if (!status) return;
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!capCode || !sessionToken) return;
    postPageMe({
      action: "revokeStatusLink", capCode, sessionToken, token: status.token,
      context: context || status.context,
    }, { timeoutMs: 5000 }).catch(() => {});
  }, [activeStatusLink]);

  const previousStatusActivation = React.useRef(activated);
  React.useEffect(() => {
    if (previousStatusActivation.current && !activated) revokeActiveStatus();
    previousStatusActivation.current = activated;
  }, [activated, revokeActiveStatus]);

  const openStatusComposer = React.useCallback(async (token) => {
    const normalizedToken = String(token || "");
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!normalizedToken || !capCode || !sessionToken) {
      if (normalizedToken) localStorage.setItem("pageme_pending_status_token", normalizedToken);
      return false;
    }
    try {
      const response = await postPageMe({
        action: "resolveStatusLinkAuthenticated", token: normalizedToken,
        capCode, sessionToken,
      });
      if (response?.status !== "success" || !normalizeUcn(response.toUcn)) {
        localStorage.removeItem("pageme_pending_status_token");
        showToast(response?.error || "THIS STATUS LINK IS UNAVAILABLE");
        return false;
      }
      openCompose();
      setCompTo(normalizeUcn(response.toUcn));
      setCompCursor({ to: normalizeUcn(response.toUcn).length, body: 0 });
      setInboundStatusToken(normalizedToken);
      setDeepLinkAccess(!activated);
      setScreen("compose");
      localStorage.removeItem("pageme_pending_status_token");
      return true;
    } catch (_) {
      localStorage.setItem("pageme_pending_status_token", normalizedToken);
      showToast("STATUS LINK COULD NOT REACH PAGEME");
      return false;
    }
  }, [activated, showToast]);

  React.useEffect(() => {
    if (!window.Capacitor) return undefined;
    let disposed = false;
    let listener = null;
    const receiveUrl = (url) => {
      const token = statusTokenFromUrl(url);
      if (token && !disposed) openStatusComposer(token);
    };
    CapacitorApp.getLaunchUrl().then(result => receiveUrl(result?.url)).catch(() => {});
    CapacitorApp.addListener("appUrlOpen", event => receiveUrl(event?.url))
      .then(handle => { listener = handle; })
      .catch(() => {});
    return () => {
      disposed = true;
      if (listener && typeof listener.remove === "function") listener.remove();
    };
  }, [openStatusComposer]);

  React.useEffect(() => {
    const pending = localStorage.getItem("pageme_pending_status_token") || "";
    if (pending && getSessionToken()) openStatusComposer(pending);
  }, [activated, openStatusComposer]);

  React.useEffect(() => {
    inboxRef.current = inbox;
  }, [inbox]);

  const unread = inbox.filter((m) => !m.read).length;
  const [menuSel, setMenuSel] = React.useState(0);
  const menuItems = MENU_ITEMS_BASE
    .filter(m => m.id !== "study" || studyApps.length > 0)
    .map((m) => m.id === "inbox" ? { ...m, badge: unread } : m);

  const [codeSel, setCodeSel] = React.useState(0);
  const [compTo, setCompTo] = React.useState("");
  const [compBody, setCompBody] = React.useState("");
  const [compMode, setCompMode] = React.useState("text");
  const [compField, setCompField] = React.useState("to");
  const [compReplyKey, setCompReplyKey] = React.useState("");
  const [compClientMessageId, setCompClientMessageId] = React.useState("");
  const [compCursor, setCompCursor] = React.useState({ to: 0, body: 0 });
  const [showKb, setShowKb] = React.useState(false);
  const [sentOk, setSentOk] = React.useState(false);
  const [setSel, setSetSel] = React.useState(0);

  const loadFocusAutomation = React.useCallback(async () => {
    let config = normalizeFocusSchedule(readJsonStorage("pageme_focus_schedule", DEFAULT_FOCUS_SCHEDULE));
    let status = {
      nextTriggerAt: 0, calendarPermission: false, exactAlarmAllowed: true,
      autoLaunchAllowed: false, reminderNotificationsAllowed: false, launcherDefault: false,
    };
    if (window.Capacitor) {
      const { FocusSchedulePlugin, LauncherPlugin } = window.Capacitor.Plugins;
      if (FocusSchedulePlugin) {
        const result = await FocusSchedulePlugin.getConfig();
        config = normalizeFocusSchedule(JSON.parse(result.config || "{}"));
        status = { ...status, ...result };
        status.launcherDefault = !!result.homeTakeoverAllowed;
        if (result.focusLockUntil > Date.now()) {
          setFocusLockUntil(result.focusLockUntil);
          localStorage.setItem("pageme_focus_lock_until", String(result.focusLockUntil));
        }
      }
      if (LauncherPlugin) {
        const home = await LauncherPlugin.checkLauncherDefault();
        status.launcherDefault = status.launcherDefault || !!home.isSelected || !!home.isDefault;
      }
    }
    writeJsonStorage("pageme_focus_schedule", config);
    setFocusAutomation(config);
    setFocusAutomationStatus(status);
    return { config, status };
  }, []);

  React.useEffect(() => {
    if (activated) loadFocusAutomation().catch(error => console.error("Unable to load focus automation", error));
  }, [activated, loadFocusAutomation]);

  React.useEffect(() => {
    const handleLauncherDefaultChanged = (event) => {
      const isDefault = event?.detail?.isDefault === true;
      setFocusAutomationStatus(current => ({ ...current, launcherDefault: isDefault }));
      loadFocusAutomation().catch(() => {});
    };
    window.addEventListener("pagemeLauncherDefaultChanged", handleLauncherDefaultChanged);
    return () => window.removeEventListener("pagemeLauncherDefaultChanged", handleLauncherDefaultChanged);
  }, [loadFocusAutomation]);

  React.useEffect(() => {
    const activateScheduledFocus = async () => {
      localStorage.setItem("pageme_last_active", String(Date.now()));
      setActivated(true);
      setScreen("boot");
      setBootStage(0);
      try { await loadFocusAutomation(); } catch (error) { console.error("Unable to enter scheduled focus", error); }
    };
    window.addEventListener("pagemeScheduledFocusActivated", activateScheduledFocus);
    return () => window.removeEventListener("pagemeScheduledFocusActivated", activateScheduledFocus);
  }, [loadFocusAutomation]);

  React.useEffect(() => {
    if (!activated) return;
    const refresh = () => {
      if (document.visibilityState === "visible") loadFocusAutomation().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activated, loadFocusAutomation]);

  const emergOptions = [
    { id: "sos",  label: "CALL 112 / 911" },
    ...(emergContact.number ? [{ id: "trusted", label: "CALL " + (emergContact.name || emergContact.number).toUpperCase() }] : []),
    { id: "exit", label: "EXIT PAGER — 10 MIN" },
    { id: "back", label: "BACK TO PAGER" },
  ];
  const settingsItems = [
    { id: "backlight", label: "BACKLIGHT",    value: !!t.backlight },
    { id: "sound",     label: "ALERT TONE",   value: !!t.sound },
    { id: "ask_share_status", label: "ASK TO SHARE", value: askShareStatus },
    { id: "clear_inbox", label: "CLEAR INBOX", value: inbox.length ? `${inbox.length} PAGES` : "EMPTY" },
    { id: "focus_automation", label: "FOCUS SCHEDULE", value: focusScheduleSummary(focusAutomation, focusAutomationStatus.nextTriggerAt) },
    { id: "lcdColor",  label: "SCREEN",       value: t.lcdColor.toUpperCase() },
    { id: "housing",   label: "CASE",         value: t.housing.toUpperCase() },
    { id: "font",      label: "FONT",         value: t.font.toUpperCase() },
    { id: "study_apps",label: "STUDY APPS",   value: studyApps.length ? studyApps.length + " SET" : "CONFIGURE" },
    { id: "emergency_contact", label: "EMERGENCY SOS", value: emergContact.name || "NOT SET" },
    { id: "blocked_ucns", label: "BLOCKED UCNs", value: blockedUcns.length ? `${blockedUcns.length} BLOCKED` : "MANAGE" },
    { id: "about",     label: "ABOUT PAGEME", value: "VIEW" },
    { id: "delete_account", label: "DELETE ACCOUNT", value: "PERMANENT" },
    { id: "deactivate",label: "RE-RUN SETUP", value: "START" },
  ];

  const [incoming, setIncoming] = React.useState(null);
  const [vibrating, setVibrating] = React.useState(false);
  const [ledBlink, setLedBlink] = React.useState(false);
  const incomingIdx = React.useRef(0);

  const triggerIncoming = React.useCallback((msgIn) => {
    const normalizedFrom = (msgIn.from || "PAGE").trim();
    const normalizedText = (msgIn.text || "").trim();
    const nowTs = Date.now();
    recentMessages.current = recentMessages.current.filter(r => nowTs - r.ts < DUPLICATE_PAGE_WINDOW_MS);
    const sig = pageContentKey({
      source: msgIn.source || "sms",
      from: normalizedFrom,
      senderKey: msgIn.senderKey || "",
      number: msgIn.number || "",
      text: normalizedText,
    });
    if (recentMessages.current.some(r => r.sig === sig)) return;
    recentMessages.current.push({ sig, ts: nowTs });

    const stamp = nowFormat(new Date());
    const msg = {
      id: "p" + nowTs,
      from: normalizedFrom, number: msgIn.number, text: normalizedText,
      type: msgIn.type, source: msgIn.source || "sms",
      time: stamp.time, date: stamp.date, read: false,
      canReply: !!msgIn.canReply,
      replyKey: msgIn.replyKey || "",
      senderKey: msgIn.senderKey || "",
    };
    setInbox((prev) => normalizeInbox([msg, ...prev]));

    const isFocused = focusLockUntil > Date.now();
    if (isFocused && focusSilentPages) return;

    setIncoming(msg);
    setLedBlink(true);
    pageAlert({ enabled: t.sound });
    setScreen((curr) => {
      if (curr === "home" || curr === "incoming" || curr === "boot") return "incoming";
      return curr;
    });
  }, [t.sound, focusLockUntil, focusSilentPages]);
  const triggerIncomingRef = React.useRef(triggerIncoming);

  React.useEffect(() => {
    triggerIncomingRef.current = triggerIncoming;
  }, [triggerIncoming]);

  const syncNetworkMessages = React.useCallback(async () => {
    if (!activated || messageSyncBusyRef.current) return;
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    const cursorKey = messageCursorStorageKey(capCode);
    if (!capCode || !sessionToken || !cursorKey) return;

    messageSyncBusyRef.current = true;
    try {
      const outboxKey = `pageme_outbox_${capCode}`;
      const pending = readJsonStorage(outboxKey, null);
      if (pending && pending.clientMessageId && pending.toUcn && pending.message) {
        const queued = await postPageMe({
          action: "sendMessage", fromUcn: capCode, sessionToken,
          toUcn: pending.toUcn, message: pending.message, type: pending.type,
          clientMessageId: pending.clientMessageId, replyToId: pending.replyToId || "",
        });
        if (queued?.status === "success" && queued.message) {
          const withPending = mergeNetworkMessages(inboxRef.current, [queued.message], capCode);
          inboxRef.current = withPending;
          setInbox(withPending);
          localStorage.removeItem(outboxKey);
        } else if (!isRetryableMessageError(queued?.code)) {
          localStorage.removeItem(outboxKey);
        }
      }

      const afterRevision = Math.max(0, Number(localStorage.getItem(cursorKey) || 0));
      let nextCursor = afterRevision;
      let response = null;
      const serverMessages = [];
      for (let page = 0; page < 5; page++) {
        const requestCursor = nextCursor;
        response = await postPageMe({
          action: "syncMessages", capCode, sessionToken, afterRevision: requestCursor, limit: 200,
        });
        if (!response || response.status !== "success") {
          if (response?.code === "AUTH_REQUIRED") showToast("Sign in again to receive PageMe pages.");
          return;
        }
        if (Array.isArray(response.messages)) serverMessages.push(...response.messages);
        const responseCursor = Number(response.cursor);
        if (Number.isFinite(responseCursor)) nextCursor = Math.max(nextCursor, responseCursor);
        if (!response.hasMore || responseCursor <= requestCursor) break;
      }

      const currentInbox = inboxRef.current;
      const freshIncoming = newIncomingNetworkMessages(currentInbox, serverMessages, capCode)
        .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
      const merged = pruneExpiredNetworkMessages(
        mergeNetworkMessages(currentInbox, serverMessages, capCode),
        response?.retentionDays,
        response?.serverTime,
      );
      inboxRef.current = merged;
      setInbox(merged);
      localStorage.setItem(cursorKey, String(nextCursor));
      const nativeMessaging = window.Capacitor?.Plugins?.PageMeMessaging;
      if (nativeMessaging && typeof nativeMessaging.updateSyncCursor === "function") {
        nativeMessaging.updateSyncCursor({ cursor: nextCursor }).catch(() => {});
      }

      if (freshIncoming.length > 0) {
        const newest = freshIncoming[0];
        const isFocused = focusLockUntil > Date.now();
        if (!(isFocused && focusSilentPages)) {
          setIncoming(newest);
          setLedBlink(true);
          pageAlert({ enabled: t.sound });
          setScreen(current => (
            current === "home" || current === "incoming" || current === "boot" ? "incoming" : current
          ));
        }
      }
    } catch (error) {
      if (document.visibilityState === "visible") console.warn("PageMe message sync failed", error);
    } finally {
      messageSyncBusyRef.current = false;
    }
  }, [activated, focusLockUntil, focusSilentPages, showToast, t.sound]);

  React.useEffect(() => {
    if (!activated) return;
    const refresh = () => {
      if (document.visibilityState === "visible") syncNetworkMessages();
    };
    syncNetworkMessages();
    const interval = setInterval(refresh, MESSAGE_SYNC_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagemePushMessageReceived", syncNetworkMessages);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagemePushMessageReceived", syncNetworkMessages);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activated, syncNetworkMessages]);

  React.useEffect(() => {
    if (!activated || !window.Capacitor) return;
    const plugin = window.Capacitor.Plugins?.PageMeMessaging;
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!plugin || !capCode || !sessionToken) return;

    let disposed = false;
    const handles = [];
    const registerToken = async (registration) => {
      if (disposed || !registration?.configured || !registration.token || !registration.deviceId) return;
      const response = await postPageMe({
        action: "registerDevice", capCode, sessionToken,
        deviceId: registration.deviceId, pushToken: registration.token, platform: "android",
      });
      if (response?.code === "AUTH_REQUIRED") showToast("Sign in again to enable PageMe delivery.");
    };

    const consumeNativeMessages = async () => {
      if (disposed || typeof plugin.consumePendingMessages !== "function") return;
      const pending = await plugin.consumePendingMessages();
      if (pending?.authRequired) showToast("Sign in again to receive PageMe pages.");
      const messages = Array.isArray(pending?.messages) ? pending.messages : [];
      const cursorKey = messageCursorStorageKey(capCode);
      if (!messages.length) return;

      const currentInbox = inboxRef.current;
      const freshIncoming = newIncomingNetworkMessages(currentInbox, messages, capCode)
        .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
      const merged = mergeNetworkMessages(currentInbox, messages, capCode);
      const storageKey = inboxStorageKey(capCode);
      if (!storageKey || !writeJsonStorage(storageKey, merged)) {
        throw new Error("PageMe could not safely store background pages.");
      }
      inboxRef.current = merged;
      setInbox(merged);
      const nativeCursor = Number(pending?.cursor);
      if (cursorKey && Number.isFinite(nativeCursor)) {
        const currentCursor = Math.max(0, Number(localStorage.getItem(cursorKey) || 0));
        localStorage.setItem(cursorKey, String(Math.max(currentCursor, nativeCursor)));
        if (typeof plugin.acknowledgePendingMessages === "function") {
          await plugin.acknowledgePendingMessages({ cursor: nativeCursor });
        }
      }
      if (freshIncoming.length && !(focusLockUntil > Date.now() && focusSilentPages)) {
        setIncoming(freshIncoming[0]);
        setLedBlink(true);
        pageAlert({ enabled: t.sound });
        setScreen(current => (
          current === "home" || current === "incoming" || current === "boot" ? "incoming" : current
        ));
      }
    };

    const setup = async () => {
      try {
        const cursorKey = messageCursorStorageKey(capCode);
        const cursor = cursorKey ? Math.max(0, Number(localStorage.getItem(cursorKey) || 0)) : 0;
        if (typeof plugin.configureBackgroundSync === "function") {
          await plugin.configureBackgroundSync({ endpoint: PAGEME_SCRIPT_URL, capCode, cursor });
        }
        await consumeNativeMessages();
        const registration = await plugin.getPushRegistration();
        await registerToken(registration);
        if (registration?.pending) {
          await plugin.consumePendingSync();
          syncNetworkMessages();
        }
        handles.push(await plugin.addListener("messagePushReceived", async () => {
          try {
            await consumeNativeMessages();
            await plugin.consumePendingSync();
          } catch (_) {}
          syncNetworkMessages();
        }));
        handles.push(await plugin.addListener("pushTokenChanged", async (event) => {
          const latest = event?.token && event?.deviceId
            ? { configured: true, token: event.token, deviceId: event.deviceId }
            : await plugin.getPushRegistration();
          await registerToken(latest);
        }));
      } catch (error) {
        console.warn("PageMe push registration is unavailable", error);
      }
    };
    setup();
    return () => {
      disposed = true;
      handles.forEach(handle => {
        if (handle && typeof handle.remove === "function") handle.remove();
      });
    };
  }, [activated, focusLockUntil, focusSilentPages, showToast, syncNetworkMessages, t.sound]);

  React.useEffect(() => {
    if (screen !== "read" || !readingId) return;
    const current = inboxRef.current.find((message) => message.id === readingId);
    setInbox((prev) => {
      const msg = prev.find((m) => m.id === readingId);
      if (!msg || msg.read) return prev;
      return prev.map((m) => m.id === readingId ? { ...m, read: true } : m);
    });
    if (current?.source === "pageme-network" && current.direction === "incoming" && !current.read) {
      const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
      const sessionToken = getSessionToken();
      if (capCode && sessionToken) {
        postPageMe({
          action: "markRead", capCode, sessionToken, messageIds: [current.serverMessageId || current.id],
        }).then(() => syncNetworkMessages()).catch(() => {});
      }
    }
  }, [screen, readingId, syncNetworkMessages]);

  React.useEffect(() => {
    if (!activated) return;
    const key = inboxStorageKey(localStorage.getItem("pageme_cap_code") || "");
    if (!key || inboxScopeRef.current === key) return;
    skipInboxPersistRef.current = true;
    inboxScopeRef.current = key;
    setInbox(normalizeInbox(readJsonStorage(key, [])));
  }, [activated]);

  React.useEffect(() => {
    if (!activated || !inboxScopeRef.current) return;
    if (skipInboxPersistRef.current) {
      skipInboxPersistRef.current = false;
      return;
    }
    writeJsonStorage(inboxScopeRef.current, normalizeInbox(inbox));
  }, [activated, inbox]);

  // Demo incoming queue (browser only)
  React.useEffect(() => {
    if (!activated || screen === "boot") return;
    if (window.Capacitor) return;
    const schedule = () => {
      const m = INCOMING_QUEUE[incomingIdx.current % INCOMING_QUEUE.length];
      incomingIdx.current += 1;
      triggerIncoming(m);
    };
    const tt = setTimeout(schedule, 8000);
    const id = setInterval(schedule, 24000);
    return () => { clearTimeout(tt); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, screen === "boot"]);

  // Native listeners
  React.useEffect(() => {
    if (!activated || !window.Capacitor) return;
    const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
    if (!NotificationReceiverPlugin) return;
    const handler = NotificationReceiverPlugin.addListener("notificationReceived", (info) => {
      triggerIncoming({ from: info.from || "PAGE", number: info.number || "000-0000", text: info.text || "", type: info.type || "text", source: info.source || "sms", canReply: info.canReply, replyKey: info.replyKey || "", senderKey: info.senderKey || "", notificationKey: info.notificationKey || "" });
    });
    return () => { handler.remove(); };
  }, [activated, triggerIncoming]);

  React.useEffect(() => {
    if (!activated || !window.Capacitor) return;
    const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
    if (!NotificationReceiverPlugin) return;
    const handler = NotificationReceiverPlugin.addListener("focusTimerBypassAttempted", () => setScreen("focus-locked"));
    return () => { if (handler && typeof handler.remove === 'function') handler.remove(); };
  }, [activated]);

  React.useEffect(() => {
    if (!activated || !window.Capacitor) return;
    const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
    if (!NotificationReceiverPlugin) return;
    let listening = true;
    const showAlarm = (info) => {
      if (!listening || !info?.key) return;
      const actions = Array.isArray(info.actions) ? info.actions : [];
      const dismissIndex = actions.findIndex((action) => /dismiss|stop|turn off|end alarm|cancel alarm/i.test(action.label || ""));
      setAlarmInfo(info); setAlarmSel(dismissIndex >= 0 ? dismissIndex : 0); setScreen("alarm");
    };
    const handler = NotificationReceiverPlugin.addListener("alarmReceived", showAlarm);
    if (typeof NotificationReceiverPlugin.getActiveAlarm === 'function') {
      NotificationReceiverPlugin.getActiveAlarm()
        .then((result) => { if (result?.active && result.alarm) showAlarm(result.alarm); })
        .catch((error) => console.error("Unable to inspect active alarm", error));
    }
    return () => {
      listening = false;
      if (handler && typeof handler.remove === 'function') handler.remove();
    };
  }, [activated]);

  React.useEffect(() => {
    if (!window.Capacitor) return;
    const { App } = window.Capacitor.Plugins;
    if (!App) return;
    let resumeTimer = null;
    const handler = App.addListener("appStateChange", (state) => {
      if (state.isActive) {
        if (firstActivation.current) { firstActivation.current = false; return; }
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (localStorage.getItem("pageme_study_app_active") === "true") {
          localStorage.removeItem("pageme_study_app_active");
          setStudyAppActive(false);
          if (NRP && typeof NRP.pinApp === 'function') {
            NRP.pinApp();
            setTimeout(checkPinStatus, 1500);
          }
        }
        const emergUntil = parseInt(localStorage.getItem("pageme_emergency_until") || "0", 10);
        if (emergUntil) {
          if (emergUntil <= Date.now()) {
            localStorage.removeItem("pageme_emergency_until");
            if (NRP && typeof NRP.enableLauncher === 'function') NRP.enableLauncher();
            if (NRP && typeof NRP.pinApp === 'function') NRP.pinApp();
          } else {
            if (NRP && typeof NRP.enableLauncher === 'function') NRP.enableLauncher();
          }
        }
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(async () => {
          resumeTimer = null;
          if (!NRP) return;
          if (activated && typeof NRP.getPagerModeState === 'function') {
            try {
              const nativeState = await NRP.getPagerModeState();
              if (!nativeState.active) {
                setActivated(false);
                return;
              }
            } catch (error) {
              console.error("Unable to inspect Pager Mode after resume", error);
            }
          }
          const inEmergency = parseInt(localStorage.getItem("pageme_emergency_until") || "0", 10) > Date.now();
          const inStudyApp = localStorage.getItem("pageme_study_app_active") === "true";
          if (activated && !inEmergency && !inStudyApp && typeof NRP.pinApp === 'function') {
            await NRP.pinApp();
          }
          checkPinStatus();
        }, 650);
        setScreen((curr) => curr === "exiting" || curr === "powering-off" ? "home" : curr);
        setPowerHoldProgress(0);
      } else {
        setTorchOn(false);
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (NRP && typeof NRP.setTorch === 'function') {
          NRP.setTorch({ enabled: false }).catch(() => {});
        }
      }
    });
    return () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      if (handler && typeof handler.remove === 'function') handler.remove();
    };
  }, [activated, checkPinStatus]);

  React.useEffect(() => {
    if (!activated || screen === "boot" || screen === "powering-off") return;
    checkPinStatus();
    const id = setInterval(checkPinStatus, 8000);
    return () => clearInterval(id);
  }, [activated, screen, checkPinStatus]);

  React.useEffect(() => {
    if (!activated) return;
    const id = setInterval(() => { try { localStorage.setItem("pageme_heartbeat", String(Date.now())); } catch (e) {} }, 5000);
    return () => clearInterval(id);
  }, [activated]);

  React.useEffect(() => {
    if (!window.Capacitor) return;
    const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
    if (NRP && typeof NRP.setStudyApps === 'function') NRP.setStudyApps({ packages: studyApps.map(a => a.packageName) });
  }, [studyApps]);

  React.useEffect(() => {
    const handler = () => { localStorage.removeItem("pageme_study_app_active"); setStudyAppActive(false); setScreen("home"); };
    window.addEventListener("pagemeStudySessionEnded", handler);
    return () => window.removeEventListener("pagemeStudySessionEnded", handler);
  }, []);

  React.useEffect(() => {
    const handler = () => {
      localStorage.removeItem("pageme_study_app_active");
      setStudyAppActive(false);
      setScreen("study-apps");
      showToast("Access restricted: only registered study apps allowed!");
    };
    window.addEventListener("pagemeStudyRogueAppDetected", handler);
    return () => window.removeEventListener("pagemeStudyRogueAppDetected", handler);
  }, [showToast]);

  React.useEffect(() => {
    const capacitor = window.Capacitor;
    const LoraBlePlugin = capacitor?.Plugins?.LoraBlePlugin;
    if (!shouldStartLora({ activated, capacitor, plugin: LoraBlePlugin })) return;
    LoraBlePlugin.startScanAndConnect().catch((error) => {
      console.warn("LoRa receiver unavailable", error);
    });
    const handler = LoraBlePlugin.addListener("loraMessageReceived", (info) => {
      triggerIncomingRef.current({ from: info.sender || "RF NODE", number: "915-MESH", text: info.message || "", type: info.type || "text", source: "sms" });
    });
    return () => { handler.remove(); LoraBlePlugin.stopScanAndDisconnect(); };
  }, [activated]);

  React.useEffect(() => {
    if (torchOn) {
      torchTimeoutRef.current = setTimeout(() => {
        if (window.Capacitor) {
          const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
          if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.setTorch === 'function') {
            NotificationReceiverPlugin.setTorch({ enabled: false }).catch(() => {});
          }
        }
        setTorchOn(false);
      }, 10 * 60 * 1000);
    } else {
      if (torchTimeoutRef.current) { clearTimeout(torchTimeoutRef.current); torchTimeoutRef.current = null; }
    }
    return () => {
      if (torchTimeoutRef.current) clearTimeout(torchTimeoutRef.current);
      if (torchOn && window.Capacitor) {
        const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
        if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.setTorch === 'function') {
          NotificationReceiverPlugin.setTorch({ enabled: false }).catch(() => {});
        }
      }
    };
  }, [torchOn]);

  React.useEffect(() => {
    if (focusSoundEnabled && focusLockUntil > Date.now()) {
      startFocusSound();
      const remaining = focusLockUntil - Date.now();
      const t0 = setTimeout(() => { stopFocusSound(); updateFocusSoundEnabled(false); }, remaining);
      return () => { clearTimeout(t0); stopFocusSound(); };
    } else {
      stopFocusSound();
    }
  }, [focusSoundEnabled, focusLockUntil]);

  React.useEffect(() => {
    if (focusLockUntil > Date.now()) {
      const remaining = focusLockUntil - Date.now();
      const timer = setTimeout(() => {
        updateFocusLock(0); updateFocusSoundEnabled(false); updateFocusSilentPages(false);
        recordProductEvent("focus_completed", "focus", activeStatusLink?.token || "");
        if (activeStatusLink?.context === "focus") revokeActiveStatus("focus");
        setNow(new Date());
        setScreen((curr) => curr === "focus-locked" ? "home" : curr);
        if (t.sound) {
          blip({ freq: 900, dur: 0.1, vol: 0.1, enabled: true });
          setTimeout(() => blip({ freq: 1200, dur: 0.15, vol: 0.1, enabled: true }), 120);
        }
      }, remaining + 50);
      return () => clearTimeout(timer);
    }
  }, [focusLockUntil, t.sound, activeStatusLink, recordProductEvent, revokeActiveStatus]);

  React.useEffect(() => {
    if (activated) {
      const ucn = localStorage.getItem("pageme_cap_code") || "";
      const key = `pageme_study_apps_${ucn}`;
      setStudyApps(readJsonStorage(key, []));
      localStorage.removeItem("pageme_study_app_active");
      setStudyAppActive(false);
    }
  }, [activated]);

  React.useEffect(() => {
    const until = emergencyUntil;
    if (!until) return;
    const remaining = until - Date.now();
    const repin = async () => {
      localStorage.removeItem("pageme_emergency_until");
      setEmergencyUntil(0);
      if (window.Capacitor) {
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (NRP) {
          if (typeof NRP.restoreEmergencyWindow === 'function') await NRP.restoreEmergencyWindow();
          else {
            if (typeof NRP.enableLauncher === 'function') await NRP.enableLauncher();
            if (typeof NRP.pinApp === 'function') await NRP.pinApp();
          }
        }
      }
      checkPinStatus();
    };
    if (remaining <= 0) { repin(); return; }
    const timer = setTimeout(repin, remaining);
    return () => clearTimeout(timer);
  }, [activated, checkPinStatus, emergencyUntil]);

  React.useEffect(() => {
    const handleEmergencyExitEnded = () => {
      localStorage.removeItem("pageme_emergency_until");
      setEmergencyUntil(0);
      setScreen("home");
      if (focusSoundEnabled && focusLockUntil > Date.now()) startFocusSound();
      setTimeout(checkPinStatus, 100);
    };
    window.addEventListener("pagemeEmergencyExitEnded", handleEmergencyExitEnded);
    return () => window.removeEventListener("pagemeEmergencyExitEnded", handleEmergencyExitEnded);
  }, [checkPinStatus, focusLockUntil, focusSoundEnabled]);

  React.useEffect(() => {
    if (!activated) return;
    const ucn = localStorage.getItem("pageme_cap_code") || "";
    const email = localStorage.getItem("pageme_user_email") || "";
    if (!ucn || !email) return;
    const timer = setTimeout(async () => {
      try {
        await postPageMe({
          action: "saveSettings", capCode: ucn, email, sessionToken: getSessionToken(),
          settings: {
            studyApps: readJsonStorage(`pageme_study_apps_${ucn}`, []),
            emergContact: readJsonStorage(`pageme_emergency_contact_${ucn}`, {}),
            focusSilentPages: localStorage.getItem("pageme_focus_silent_pages") === "true",
            focusSoundEnabled: localStorage.getItem("pageme_focus_sound_enabled") === "true",
            askShareStatus: localStorage.getItem(STATUS_SHARE_SETTING_KEY) !== "false",
          }
        });
      } catch (e) { /* silent fail */ }
    }, 4000);
    return () => clearTimeout(timer);
  }, [activated, studyApps, emergContact, focusSilentPages, focusSoundEnabled, askShareStatus]);

  React.useEffect(() => {
    if (!navigator.getBattery) return;
    let mgr = null;
    const onLevel = () => { if (mgr) setTweak("battery", mgr.level); };
    navigator.getBattery().then(m => {
      mgr = m; setTweak("battery", m.level);
      m.addEventListener("levelchange", onLevel);
    });
    return () => { if (mgr) mgr.removeEventListener("levelchange", onLevel); };
  }, []);

  const findCodeMeaning = (txt) => {
    const c = PAGER_CODES.find((c) => c.code === txt);
    return c ? c.meaning : null;
  };

  async function launchStudyApp(pkg) {
    if (!pkg || !window.Capacitor) return;
    const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
    if (!NRP) return;

    try {
      const usageRes = typeof NRP.checkUsageStatsPermission === 'function' ? await NRP.checkUsageStatsPermission() : { granted: true };
      const overlayRes = typeof NRP.checkOverlayPermission === 'function' ? await NRP.checkOverlayPermission() : { granted: true };

      if (!usageRes.granted || !overlayRes.granted) {
        showToast("Please grant permissions in Settings → Study Apps for focus lock watchdog to work!");
        setScreen("study-config");
        return;
      }
    } catch (e) { /* ignore */ }

    localStorage.setItem("pageme_study_app_active", "true");
    setStudyAppActive(true);
    try {
      if (typeof NRP.launchStudyApp === 'function') {
        await NRP.launchStudyApp({ packageName: pkg });
      } else {
        if (typeof NRP.unpinApp === 'function') await NRP.unpinApp();
        await new Promise(r => setTimeout(r, 300));
        if (typeof NRP.launchApp === 'function') await NRP.launchApp({ packageName: pkg });
      }
    } catch (e) {
      console.error("Launch failed", e);
      localStorage.removeItem("pageme_study_app_active");
      setStudyAppActive(false);
      if (focusLockUntil > Date.now() && typeof NRP.pinApp === 'function') NRP.pinApp();
    }
  }

  async function dialEmergency(num) {
    if (!num || !window.Capacitor) return;
    const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
    if (!NRP) return;
    const until = Date.now() + 600000;
    localStorage.setItem("pageme_emergency_until", String(until));
    setEmergencyUntil(until);
    try {
      if (typeof NRP.startEmergencyWindow === 'function') {
        await NRP.startEmergencyWindow({ until, launchHome: false });
      } else if (typeof NRP.unpinApp === 'function') await NRP.unpinApp();
      await new Promise(r => setTimeout(r, 250));
      if (typeof NRP.dialNumber === 'function') await NRP.dialNumber({ number: num });
    } catch (e) { console.error("Dial failed", e); }
    setIsPinned(false);
  }

  async function emergencyExit() {
    const until = Date.now() + 600000;
    localStorage.setItem("pageme_emergency_until", String(until));
    setEmergencyUntil(until);
    stopFocusSound();
    if (window.Capacitor) {
      const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
      if (NRP) {
        if (typeof NRP.startEmergencyWindow === 'function') {
          await NRP.startEmergencyWindow({ until, launchHome: true });
        } else {
          if (typeof NRP.unpinApp === 'function') await NRP.unpinApp();
          if (typeof NRP.launchRealHome === 'function') await NRP.launchRealHome();
        }
      }
    }
    setIsPinned(false); setEmergSel(0); setScreen("home");
  }

  const inEmergencyWindow = emergencyUntil > Date.now();
  const bypassPinCheck = inEmergencyWindow || studyAppActive;

  const startFocusSession = (lockUntil) => {
    if (focusSoundEnabled) startFocusSound();
    updateFocusLock(lockUntil);
    recordProductEvent("focus_started", "focus", activeStatusLink?.token || "");
    setStatusShareContext(null);
    setStatusShareError("");
    setScreen("home");
  };

  const openStatusShare = (context) => {
    setStatusShareContext(context);
    setStatusShareSel(0);
    setStatusShareError("");
    setStatusShareBusy(false);
    setScreen("status-share");
  };

  const performStatusShareAction = async () => {
    if (!statusShareContext || statusShareBusy) return;
    setStatusShareBusy(true);
    setStatusShareError("");
    try {
      const request = {
        context: statusShareContext.context,
        focusEndsAt: statusShareContext.focusEndsAt || 0,
      };
      if (statusShareContext.copyOnly) await copyStatusLink(request);
      else await shareStatus(request);
    } catch (error) {
      setStatusShareError(error?.message || "Status sharing is unavailable");
    } finally {
      setStatusShareBusy(false);
    }
  };

  const press = (b) => { buttonClick({ enabled: t.sound }); handleButton(b); };

  function handleButton(b) {
    if (b === "esc") {
      if (focusLockUntil > Date.now()) {
        const nowTs = Date.now();
        const last = escPressLog.current[escPressLog.current.length - 1] || 0;
        if (nowTs - last > 120) escPressLog.current = [...escPressLog.current, nowTs].filter(ts => nowTs - ts < 1500);
        if (escPressLog.current.length >= 3) { escPressLog.current = []; setScreen("emergency"); return; }
      } else {
        escPressLog.current = [];
      }
    }
    if (screen === "welcome") {
      localStorage.removeItem("pageme_show_welcome");
      if (window.Capacitor) {
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (NRP && typeof NRP.enableLauncher === 'function') NRP.enableLauncher();
      }
      setScreen("home"); return;
    }
    if (screen === "pin-prompt") {
      if (b === "send") {
        pinRequestPending.current = false;
        setScreen("home");
        setTimeout(checkPinStatus, 100);
      } else { setScreen("home"); }
      return;
    }
    if (screen === "status-share") {
      if (b === "up") setStatusShareSel(0);
      if (b === "down") setStatusShareSel(1);
      if (b === "esc") {
        setStatusShareContext(null);
        setStatusShareError("");
        setScreen(statusShareContext?.returnScreen || "menu");
      }
      if (b === "send") {
        if (statusShareSel === 0) performStatusShareAction();
        else if (statusShareContext?.context === "focus") startFocusSession(statusShareContext.focusEndsAt);
        else {
          setStatusShareContext(null);
          setStatusShareError("");
          setScreen(statusShareContext?.returnScreen || "menu");
        }
      }
      return;
    }
    if (screen === "alarm") {
      if (b === "up") setAlarmSel(s => Math.max(0, s - 1));
      if (b === "down") setAlarmSel(s => Math.min((alarmInfo?.actions?.length || 1) - 1, s + 1));
      if (b === "send") {
        if (window.Capacitor && alarmInfo?.key) {
          const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
          const action = (alarmInfo.actions || [])[alarmSel];
          if (NRP && action?.index >= 0) NRP.fireAlarmAction({ key: alarmInfo.key, actionIndex: action.index });
          else if (NRP && typeof NRP.dismissAlarm === 'function') NRP.dismissAlarm({ key: alarmInfo.key });
        }
        setScreen("home"); setAlarmInfo(null);
      }
      if (b === "esc") {
        if (window.Capacitor && alarmInfo?.key) {
          const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
          if (NRP && typeof NRP.dismissAlarm === 'function') NRP.dismissAlarm({ key: alarmInfo.key });
        }
        setScreen("home"); setAlarmInfo(null);
      }
      return;
    }
    if (screen === "emergency") {
      if (b === "up") setEmergSel(s => Math.max(0, s - 1));
      if (b === "down") setEmergSel(s => Math.min(emergOptions.length - 1, s + 1));
      if (b === "send") {
        const opt = emergOptions[emergSel];
        if (opt) {
          if (opt.id === "sos")     dialEmergency("112");
          if (opt.id === "trusted") dialEmergency(emergContact.number);
          if (opt.id === "exit")    emergencyExit();
          if (opt.id === "back")    setScreen("home");
        }
      }
      if (b === "esc") setScreen("home");
      return;
    }
    if (!isPinned && !bypassPinCheck && b !== "power_down" && b !== "power_up" && b !== "power") {
      if (window.Capacitor) {
        const { NotificationReceiverPlugin: NRP } = window.Capacitor.Plugins;
        if (NRP && typeof NRP.pinApp === 'function') NRP.pinApp();
        setTimeout(checkPinStatus, 1500);
      }
      return;
    }
    if (b === "torch") {
      if (torchBusyRef.current) return;
      if (window.Capacitor) {
        const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
        if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.toggleTorch === 'function') {
          torchBusyRef.current = true;
          NotificationReceiverPlugin.toggleTorch()
            .then((result) => setTorchOn(!!result?.isOn))
            .catch((e) => {
              console.error("Failed to toggle rear torch", e);
              setTorchOn(false);
              showToast("Rear torch unavailable. Allow camera access and try again.");
            })
            .finally(() => { torchBusyRef.current = false; });
        }
      } else {
        setTorchOn((current) => !current);
      }
      return;
    }
    if (b === "go_inbox") { setInboxViewMode("categories"); setInboxSel(0); setScreen("inbox"); return; }
    if (b === "go_compose") { openCompose(); setScreen("compose"); return; }
    if (b === "go_codes") { setCodeSel(0); setScreen("codes"); return; }
    if (b === "go_timer") { if (focusLockUntil > Date.now()) setScreen("focus-locked"); else { setTimerSel(0); setScreen("timer"); } return; }
    if (b === "go_settings") { setSetSel(0); setScreen("settings"); return; }
    if (b === "power_down") {
      if (screen === "boot" || screen === "powering-off" || screen === "exiting" || screen === "focus-locked") return;
      if (focusLockUntil > Date.now()) { setScreen("focus-locked"); blip({ freq: 300, dur: 0.2, vol: 0.15, enabled: t.sound }); return; }
      previousScreen.current = screen;
      setScreen("exiting"); setPowerHoldProgress(0);
      let progress = 0;
      powerHoldInterval.current = setInterval(() => {
        progress += 4;
        if (progress > 100) progress = 100;
        setPowerHoldProgress(progress);
        blip({ freq: 800 + (progress * 12), dur: 0.045, vol: 0.08, enabled: t.sound });
        if (progress >= 100) {
          clearInterval(powerHoldInterval.current);
          powerHoldInterval.current = null;
          setPowerHoldProgress(0);
          setScreen("home");
          if (window.Capacitor && window.Capacitor.Plugins.LauncherPlugin) {
            localStorage.removeItem("pageme_setup_step");
            setActivated(false);
            window.Capacitor.Plugins.LauncherPlugin.exitLauncher();
          } else {
            setScreen("powering-off");
            setTimeout(() => { localStorage.removeItem("pageme_setup_step"); setActivated(false); setScreen("boot"); setBootStage(0); }, 1400);
          }
        }
      }, 100);
      return;
    }
    if (b === "power_up") {
      if (powerHoldInterval.current) { clearInterval(powerHoldInterval.current); powerHoldInterval.current = null; }
      setPowerHoldProgress(0);
      if (screen === "exiting") setScreen(previousScreen.current);
      else if (screen === "focus-locked") setScreen("home");
      return;
    }
    if (b === "power" && screen !== "boot" && screen !== "powering-off") {
      if (focusLockUntil > Date.now()) { setScreen("focus-locked"); blip({ freq: 300, dur: 0.2, vol: 0.15, enabled: t.sound }); return; }
      setScreen("powering-off");
      blip({ freq: 800, dur: 0.15, vol: 0.12, enabled: t.sound });
      setTimeout(() => blip({ freq: 400, dur: 0.2, vol: 0.1, enabled: t.sound }), 160);
      setTimeout(() => { localStorage.removeItem("pageme_setup_step"); setActivated(false); setScreen("boot"); setBootStage(0); }, 1400);
      return;
    }
    if (b === "read" && (screen === "home" || screen === "menu")) {
      if (inbox.length) { setInboxViewMode("categories"); setInboxSel(0); setScreen("inbox"); }
      return;
    }
    if (screen === "incoming") {
      if (b === "send" || b === "menu" || b === "read") {
        setReadingId(incoming.id); setLedBlink(false);
        const catName = getAppSourceCategory(incoming.source);
        const contName = incoming.from || "UNKNOWN";
        setInboxCategory(catName); setInboxContact(contName);
        setInboxViewMode("messages"); setInboxSel(0); setScreen("read");
      } else { setLedBlink(false); setScreen("home"); }
      return;
    }
    if (screen === "boot") return;
    if (screen === "home") {
      if (b === "send") { setMenuSel(0); setScreen("menu"); }
      else if (b === "read") {
        if (inbox.length) {
          const first = inbox[0];
          setReadingId(first.id); setInboxCategory(getAppSourceCategory(first.source)); setInboxContact(first.from || "UNKNOWN");
          setInboxViewMode("messages"); setInboxSel(0); setScreen("read");
        } else { blip({ freq: 400, dur: 0.15, vol: 0.1, enabled: t.sound }); }
      }
      else if (b === "up" || b === "down") {
        if (inbox.length) { setInboxViewMode("categories"); setInboxSel(0); setScreen("inbox"); }
      }
      return;
    }
    if (screen === "menu") {
      if (b === "up")   setMenuSel((s) => (s - 1 + menuItems.length) % menuItems.length);
      if (b === "down") setMenuSel((s) => (s + 1) % menuItems.length);
      if (b === "esc")  setScreen("home");
      if (b === "send") {
        const item = menuItems[menuSel];
        if (item.id === "inbox") { setInboxViewMode("categories"); setInboxSel(0); setScreen("inbox"); }
        if (item.id === "compose") { openCompose(); setScreen("compose"); }
        if (item.id === "codes") { setCodeSel(0); setScreen("codes"); }
        if (item.id === "study") { setStudySel(0); setScreen("study-apps"); }
        if (item.id === "timer") {
          if (focusLockUntil > Date.now()) { setScreen("focus-locked"); setTimeout(() => setScreen("menu"), 2500); }
          else { setTimerSel(0); setScreen("timer"); }
        }
        if (item.id === "share_status") {
          openStatusShare({ context: "manual", copyOnly: true, returnScreen: "menu" });
        }
        if (item.id === "settings") { setSetSel(0); setScreen("settings"); }
        if (item.id === "exit") {
          if (focusLockUntil > Date.now()) { setScreen("focus-locked"); setTimeout(() => setScreen("menu"), 2500); }
          else { localStorage.removeItem("pageme_has_been_pinned"); localStorage.removeItem("pageme_setup_step"); setActivated(false); setScreen("boot"); setBootStage(0); }
        }
      }
      return;
    }
    if (screen === "inbox") {
      if (b === "menu") { clearInboxReturnScreen.current = "inbox"; setClearInboxSel(0); setScreen("clear-inbox"); return; }
      if (b === "esc") {
        if (inboxViewMode === "messages") { setInboxViewMode("contacts"); setInboxSel(0); }
        else if (inboxViewMode === "contacts") { setInboxViewMode("categories"); setInboxSel(0); }
        else { setScreen("menu"); }
      }
      if (b === "up") setInboxSel((s) => Math.max(0, s - 1));
      if (b === "down") {
        let maxSel = 0;
        if (inboxViewMode === "categories") maxSel = getInboxCategoryItems(inbox).length - 1;
        else if (inboxViewMode === "contacts") maxSel = getInboxContacts(inbox, inboxCategory).length - 1;
        else maxSel = getInboxMessages(inbox, inboxCategory, inboxContact).length - 1;
        setInboxSel((s) => Math.min(Math.max(0, maxSel), s + 1));
      }
      if (b === "send" || b === "read") {
        if (inboxViewMode === "categories") {
          const cats = getInboxCategoryItems(inbox);
          const selCat = cats[inboxSel];
          if (selCat?.clearAction) {
            clearInboxReturnScreen.current = "inbox";
            setClearInboxSel(0);
            setScreen("clear-inbox");
          } else if (selCat) {
            setInboxCategory(selCat.name); setInboxViewMode("contacts"); setInboxSel(0);
          }
        } else if (inboxViewMode === "contacts") {
          const conts = getInboxContacts(inbox, inboxCategory);
          const selCont = conts[inboxSel];
          if (selCont) { setInboxContact(selCont.name); setInboxViewMode("messages"); setInboxSel(0); }
        } else {
          const msgs = getInboxMessages(inbox, inboxCategory, inboxContact);
          const m = msgs[inboxSel];
          if (m) { setReadingId(m.id); setScreen("read"); }
        }
      }
      return;
    }
    if (screen === "clear-inbox") {
      if (b === "esc") { setScreen(clearInboxReturnScreen.current); return; }
      if (b === "up") setClearInboxSel(0);
      if (b === "down") setClearInboxSel(1);
      if (b === "send" || b === "read") {
        if (clearInboxSel === 1) {
          const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
          const sessionToken = getSessionToken();
          if (capCode && sessionToken && inbox.some(message => message.source === "pageme-network")) {
            postPageMe({ action: "clearMessages", capCode, sessionToken })
              .then(() => syncNetworkMessages())
              .catch(() => showToast("Local inbox cleared. Server cleanup will retry later."));
          }
          setInbox([]);
          inboxRef.current = [];
          if (inboxScopeRef.current) writeJsonStorage(inboxScopeRef.current, []);
          setIncoming(null); setReadingId(null); setInboxSel(0);
          setInboxViewMode("categories");
          showToast("INBOX CLEARED");
        }
        setScreen(clearInboxReturnScreen.current);
      }
      return;
    }
    if (screen === "delete-account") {
      if (accountDeleting) return;
      if (b === "esc") { setScreen("settings"); return; }
      if (b === "up") setDeleteAccountSel(0);
      if (b === "down") setDeleteAccountSel(1);
      if (b === "send" || b === "read") {
        if (deleteAccountSel === 1) requestAccountDeletion();
        else setScreen("settings");
      }
      return;
    }
    if (screen === "message-actions") {
      if (messageActionBusy) return;
      if (b === "esc") { setScreen("read"); return; }
      if (b === "up") setMessageActionSel((selected) => Math.max(0, selected - 1));
      if (b === "down") setMessageActionSel((selected) => Math.min(2, selected + 1));
      if (b === "send" || b === "read") {
        if (messageActionSel === 0) setScreen("read");
        else performMessageSafetyAction(messageActionSel === 2);
      }
      return;
    }
    if (screen === "blocked-users") {
      if (blockedBusy) return;
      if (b === "esc") { setScreen("settings"); return; }
      if (b === "up") setBlockedSel((selected) => Math.max(0, selected - 1));
      if (b === "down") setBlockedSel((selected) => Math.min(Math.max(0, blockedUcns.length - 1), selected + 1));
      if ((b === "send" || b === "read") && blockedUcns[blockedSel]) unblockSelectedUcn();
      return;
    }
    if (screen === "read") {
      if (b === "esc") setScreen("inbox");
      if (b === "up" || b === "down") {
        const msgs = getInboxMessages(inbox, inboxCategory, inboxContact);
        const idx = msgs.findIndex((m) => m.id === readingId);
        if (idx !== -1) {
          const next = b === "up" ? Math.max(0, idx - 1) : Math.min(msgs.length - 1, idx + 1);
          setReadingId(msgs[next].id); setInboxSel(next);
        }
      }
      if (b === "send") {
        const m = inbox.find((mm) => mm.id === readingId);
        if (m && m.canReply) { const replyTo = String(m.from || ""); setCompTo(replyTo); setCompBody(""); setCompMode(m.type === "code" ? "code" : "text"); setCompField("body"); setCompReplyKey(m.serverMessageId || m.replyKey || ""); setCompClientMessageId(""); setCompCursor({ to: replyTo.length, body: 0 }); setShowKb(true); setScreen("compose"); }
      }
      if (b === "menu") {
        const m = inbox.find((mm) => mm.id === readingId);
        if (m?.source === "pageme-network" && m.direction === "incoming") {
          setMessageActionSel(0);
          setScreen("message-actions");
        }
      }
      return;
    }
    if (screen === "compose") {
      if (b === "esc") {
        if (showKb) setShowKb(false);
        else if (deepLinkAccess) {
          setInboundStatusToken(""); setDeepLinkAccess(false); setScreen("boot"); setBootStage(0);
        } else setScreen("menu");
      }
      if (b === "menu") setCompMode((m) => m === "text" ? "code" : "text");
      if (b === "up" || b === "down") setCompField((f) => f === "to" ? "body" : "to");
      if (b === "send") { if (compTo && compBody) doSend(); else setShowKb(true); }
      return;
    }
    if (screen === "sending") {
      if (b === "esc" || b === "send") {
        if (deepLinkAccess) { setInboundStatusToken(""); setDeepLinkAccess(false); setScreen("boot"); setBootStage(0); }
        else setScreen("home");
      }
      return;
    }
    if (screen === "codes") {
      if (b === "esc") setScreen("menu");
      if (b === "up") setCodeSel((s) => Math.max(0, s - 1));
      if (b === "down") setCodeSel((s) => Math.min(PAGER_CODES.length - 1, s + 1));
      if (b === "send") {
        const c = PAGER_CODES[codeSel];
        setCompTo(""); setCompBody(c.code); setCompMode("code"); setCompField("to"); setCompReplyKey(""); setCompClientMessageId(""); setCompCursor({ to: 0, body: c.code.length }); setShowKb(true); setScreen("compose");
      }
      return;
    }
    if (screen === "settings") {
      if (b === "esc") setScreen("menu");
      if (b === "up") setSetSel((s) => Math.max(0, s - 1));
      if (b === "down") setSetSel((s) => Math.min(settingsItems.length - 1, s + 1));
      if (b === "send") {
        const it = settingsItems[setSel];
        if (it.id === "backlight") setTweak("backlight", !t.backlight);
        if (it.id === "sound") setTweak("sound", !t.sound);
        if (it.id === "ask_share_status") {
          const enabled = !askShareStatus;
          setAskShareStatus(enabled);
          localStorage.setItem(STATUS_SHARE_SETTING_KEY, enabled ? "true" : "false");
        }
        if (it.id === "clear_inbox") { clearInboxReturnScreen.current = "settings"; setClearInboxSel(0); setScreen("clear-inbox"); }
        if (it.id === "focus_automation") { loadFocusAutomation().catch(() => {}); setScreen("focus-automation"); }
        if (it.id === "lcdColor") setTweak("lcdColor", cycle(["green","amber","grayscale"], t.lcdColor));
        if (it.id === "housing") setTweak("housing", cycle(["black","beige","purple","red"], t.housing));
        if (it.id === "font") setTweak("font", cycle(["lcd","pixel","segment"], t.font));
        if (it.id === "study_apps") setScreen("study-config");
        if (it.id === "emergency_contact") setScreen("emergency-contact-config");
        if (it.id === "blocked_ucns") { setBlockedSel(0); setScreen("blocked-users"); loadBlockedUcns(); }
        if (it.id === "about") setScreen("about");
        if (it.id === "delete_account") {
          if (focusLockUntil > Date.now()) { setScreen("focus-locked"); setTimeout(() => setScreen("settings"), 2500); return; }
          setDeleteAccountSel(0);
          setScreen("delete-account");
        }
        if (it.id === "deactivate") {
          if (focusLockUntil > Date.now()) { setScreen("focus-locked"); setTimeout(() => setScreen("settings"), 2500); return; }
          localStorage.removeItem("pageme_setup_step");
          setActivated(false); setScreen("boot"); setBootStage(0);
        }
      }
      return;
    }
    if (screen === "about") { if (b === "esc" || b === "menu" || b === "send" || b === "read") setScreen("settings"); return; }
    if (screen === "timer") {
      if (b === "esc") setScreen("menu");
      if (b === "up") setTimerSel((s) => Math.max(0, s - 1));
      if (b === "down") setTimerSel((s) => Math.min(timerOptions.length - 1, s + 1));
      if (b === "send" || b === "read") {
        const opt = timerOptions[timerSel];
        if (opt.id === "custom") { setCustomTimerVal(""); setScreen("timer-custom"); setShowKb(true); }
        else {
          if (opt.duration > 0) { setPendingDuration(opt.duration); setChoiceSel(0); setScreen("focus-sound-choice"); }
          else { updateFocusLock(0); updateFocusSoundEnabled(false); blip({ freq: 1400, dur: 0.1, vol: 0.1, enabled: t.sound }); setScreen("home"); }
        }
      }
      return;
    }
    if (screen === "timer-custom") {
      if (b === "esc") { setShowKb(false); setScreen("timer"); }
      if (b === "send") {
        const mins = parseInt(customTimerVal, 10);
        if (mins > 0) { setPendingDuration(mins * 60 * 1000); setChoiceSel(0); setShowKb(false); setScreen("focus-sound-choice"); }
        else { blip({ freq: 400, dur: 0.25, vol: 0.15, enabled: t.sound }); }
      }
      return;
    }
    if (screen === "focus-sound-choice") {
      if (b === "esc") setScreen("timer");
      if (b === "up") setChoiceSel(0);
      if (b === "down") setChoiceSel(1);
      if (b === "send") { updateFocusSoundEnabled(choiceSel === 0); setChoiceSel(0); setScreen("focus-pages-choice"); }
      return;
    }
    if (screen === "focus-pages-choice") {
      if (b === "esc") setScreen("focus-sound-choice");
      if (b === "up") setChoiceSel(0);
      if (b === "down") setChoiceSel(1);
      if (b === "send") {
        updateFocusSilentPages(choiceSel === 1);
        const lockUntil = Date.now() + pendingDuration;
        if (shouldOfferFocusShare()) {
          openStatusShare({
            context: "focus", focusEndsAt: lockUntil, copyOnly: true,
            returnScreen: "focus-pages-choice",
          });
        } else {
          startFocusSession(lockUntil);
        }
      }
      return;
    }
    if (screen === "study-apps") {
      if (b === "esc") setScreen("menu");
      if (b === "up") setStudySel(s => Math.max(0, s - 1));
      if (b === "down") setStudySel(s => Math.min(studyApps.length - 1, s + 1));
      if (b === "send") launchStudyApp(studyApps[studySel]?.packageName);
      return;
    }
    if (screen === "study-config" || screen === "emergency-contact-config" || screen === "focus-automation") { if (b === "esc") setScreen("settings"); return; }
    if (screen === "focus-locked") {
      if (b === "esc" || b === "menu" || b === "read" || b === "send") setScreen("home");
      return;
    }
  }

  function openCompose() { setCompTo(""); setCompBody(""); setCompMode("text"); setCompField("to"); setCompReplyKey(""); setCompClientMessageId(""); setCompCursor({ to: 0, body: 0 }); setShowKb(true); }

  async function loadBlockedUcns() {
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!capCode || !sessionToken) {
      setBlockedUcns([]);
      showToast("Sign in again to manage blocked UCNs.");
      return;
    }
    setBlockedLoading(true);
    try {
      const response = await postPageMe({ action: "listBlocks", capCode, sessionToken });
      if (response?.status !== "success") {
        showToast(response?.error || "Blocked UCNs could not be loaded.");
        return;
      }
      const next = Array.isArray(response.blockedUcns)
        ? response.blockedUcns.map(normalizeUcn).filter(Boolean)
        : [];
      setBlockedUcns([...new Set(next)]);
      setBlockedSel((selected) => Math.min(selected, Math.max(0, next.length - 1)));
    } catch (_) {
      showToast("Blocked UCNs could not reach the PageMe server.");
    } finally {
      setBlockedLoading(false);
    }
  }

  async function performMessageSafetyAction(report) {
    if (messageActionBusy) return;
    const message = inboxRef.current.find((item) => item.id === readingId);
    const senderUcn = normalizeUcn(message?.from || "");
    const messageId = message?.serverMessageId || message?.id || "";
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!message || message.source !== "pageme-network" || message.direction !== "incoming"
        || !senderUcn || !capCode || !sessionToken) {
      showToast("This PageMe sender cannot be managed.");
      setScreen("read");
      return;
    }
    setMessageActionBusy(true);
    try {
      const response = report
        ? await postPageMe({
          action: "reportMessage", capCode, sessionToken, messageId,
          reason: "Unwanted PageMe message", blockSender: true,
        })
        : await postPageMe({ action: "blockUser", capCode, sessionToken, blockedUcn: senderUcn });
      if (response?.status !== "success") {
        showToast(response?.error || "The sender could not be blocked.");
        return;
      }
      setBlockedUcns((current) => current.includes(senderUcn) ? current : [...current, senderUcn].sort());
      showToast(report ? "MESSAGE REPORTED · SENDER BLOCKED" : "SENDER BLOCKED");
      setScreen("read");
    } catch (_) {
      showToast("The safety request could not reach PageMe.");
    } finally {
      setMessageActionBusy(false);
    }
  }

  async function unblockSelectedUcn() {
    const blockedUcn = blockedUcns[blockedSel];
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!blockedUcn || !capCode || !sessionToken || blockedBusy) return;
    setBlockedBusy(true);
    try {
      const response = await postPageMe({ action: "unblockUser", capCode, sessionToken, blockedUcn });
      if (response?.status !== "success") {
        showToast(response?.error || "The UCN could not be unblocked.");
        return;
      }
      const remaining = blockedUcns.filter((ucn) => ucn !== blockedUcn);
      setBlockedUcns(remaining);
      setBlockedSel((selected) => Math.min(selected, Math.max(0, remaining.length - 1)));
      showToast(`${blockedUcn} UNBLOCKED`);
    } catch (_) {
      showToast("The unblock request could not reach PageMe.");
    } finally {
      setBlockedBusy(false);
    }
  }

  async function requestAccountDeletion() {
    if (accountDeleting) return;
    const capCode = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
    const sessionToken = getSessionToken();
    if (!capCode || !sessionToken) {
      showToast("Sign in again before deleting this account.");
      return;
    }
    setAccountDeleting(true);
    try {
      const response = await postPageMe({
        action: "deleteAccount", capCode, sessionToken, confirmation: capCode,
      });
      if (!response || response.status !== "success" || !response.deleted) {
        showToast(response?.error || "Account deletion could not be completed.");
        return;
      }

      const appearance = localStorage.getItem("pageme_appearance_settings");
      const nativeMessaging = window.Capacitor?.Plugins?.PageMeMessaging;
      if (nativeMessaging && typeof nativeMessaging.clearBackgroundSync === "function") {
        await nativeMessaging.clearBackgroundSync().catch(() => {});
      }
      await clearSessionTokenSecure();
      Object.keys(localStorage)
        .filter(key => key.startsWith("pageme_"))
        .forEach(key => localStorage.removeItem(key));
      if (appearance) localStorage.setItem("pageme_appearance_settings", appearance);
      inboxRef.current = [];
      setInbox([]);
      setActivated(false);
      setScreen("boot");
      setBootStage(0);
      showToast("PAGEME ACCOUNT DELETED");
    } catch (error) {
      showToast("Account deletion could not reach the PageMe server.");
    } finally {
      setAccountDeleting(false);
    }
  }

  async function doSend() {
    setScreen("sending"); setSentOk(false); setShowKb(false);
    let success = false;
    if (/^[A-Za-z]{3}-\d{1,4}$/.test(compTo.trim())) {
      const fromUcn = normalizeUcn(localStorage.getItem("pageme_cap_code") || "");
      const sessionToken = getSessionToken();
      if (!fromUcn || !sessionToken) {
        showToast("Sign in again before sending a page.");
      } else {
        try {
          const clientMessageId = compClientMessageId || createClientMessageId(fromUcn);
          setCompClientMessageId(clientMessageId);
          writeJsonStorage(`pageme_outbox_${fromUcn}`, {
            clientMessageId, toUcn: compTo.trim().toUpperCase(), message: compBody,
            type: compMode, replyToId: compReplyKey, createdAt: new Date().toISOString(),
          });
          const res = await postPageMe({
            action: "sendMessage", toUcn: compTo.trim().toUpperCase(), fromUcn,
            message: compBody, type: compMode, sessionToken,
            clientMessageId,
            replyToId: compReplyKey,
          });
          success = res && res.status === "success";
          if (success && res.message) {
            const merged = mergeNetworkMessages(inboxRef.current, [res.message], fromUcn);
            inboxRef.current = merged;
            setInbox(merged);
            localStorage.removeItem(`pageme_outbox_${fromUcn}`);
            setCompClientMessageId("");
            if (inboundStatusToken) {
              recordProductEvent("status_page_sent", "status_link", inboundStatusToken);
            }
          } else if (res?.error) {
            if (!isRetryableMessageError(res.code)) {
              localStorage.removeItem(`pageme_outbox_${fromUcn}`);
              setCompClientMessageId("");
            }
            showToast(res.error);
          }
        } catch (error) {
          console.warn("Page delivery failed", error);
          showToast("Page could not be queued. Check your connection and try again.");
        }
      }
    } else if (window.Capacitor) {
      const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
      if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.sendNotificationReply === 'function' && compReplyKey) {
        try {
          const res = await NotificationReceiverPlugin.sendNotificationReply({ replyKey: compReplyKey, text: compBody });
          success = !!res.success;
        } catch (error) {
          console.error("Failed to send reply", error);
        }
      }
    } else {
      success = true;
    }
    setSentOk(success);
    blip({ freq: success ? 1800 : 800, dur: 0.06, vol: 0.12, enabled: t.sound });
    setTimeout(() => {
      if (success && deepLinkAccess) {
        setInboundStatusToken("");
        setDeepLinkAccess(false);
        setScreen("boot");
        setBootStage(0);
      } else if (success) {
        setInboundStatusToken("");
        setScreen("home");
      }
      else { setShowKb(true); setScreen("compose"); }
    }, 1400);
  }

  function onKb(k) {
    if (screen === "timer-custom") {
      if (k === "DEL") { setCustomTimerVal((v) => v.slice(0, -1)); return; }
      if (k === "SEND") {
        const mins = parseInt(customTimerVal, 10);
        if (mins > 0) { setPendingDuration(mins * 60 * 1000); setChoiceSel(0); setShowKb(false); setScreen("focus-sound-choice"); }
        else { blip({ freq: 400, dur: 0.25, vol: 0.15, enabled: t.sound }); }
        return;
      }
      if (/[0-9]/.test(k)) setCustomTimerVal((v) => (v + k).slice(0, 3));
      return;
    }
    if (k === "UP" || k === "DOWN") {
      setCompField(k === "UP" ? "to" : "body");
      return;
    }
    if (k === "LEFT" || k === "RIGHT") {
      const field = compField;
      const value = field === "to" ? compTo : compBody;
      setCompCursor((positions) => ({
        ...positions,
        [field]: moveTextCursor(value, positions[field], k === "LEFT" ? "left" : "right"),
      }));
      return;
    }
    const field = compField;
    const setter = field === "to" ? setCompTo : setCompBody;
    const limit = field === "to" ? 18 : 32;
    const editField = (edit) => {
      const value = field === "to" ? compTo : compBody;
      const result = edit(value, compCursor[field]);
      setter(result.value);
      setCompCursor((positions) => ({ ...positions, [field]: result.cursor }));
    };
    if (k === "DEL") { editField(deleteBeforeTextCursor); return; }
    if (k === "SEND") { if (compTo && compBody) doSend(); return; }
    if (k === "SPC" || k === " ") { editField((value, cursor) => insertTextAtCursor(value, cursor, " ", limit)); return; }
    if (compMode === "code" && compField === "body" && !/[0-9*#]/.test(k)) return;
    editField((value, cursor) => insertTextAtCursor(value, cursor, k, limit));
  }

  // Activation gate
  if (!activated && !deepLinkAccess) {
    return (
      <>
        <ActivationScreen
          reAuthMode={reAuthNeeded}
          onShareStatus={shareStatus}
          onActivate={(settingsFromSheet) => {
            localStorage.setItem("pageme_last_active", String(Date.now()));
            if (settingsFromSheet) {
              const ucn = localStorage.getItem("pageme_cap_code") || "";
              if (settingsFromSheet.studyApps && settingsFromSheet.studyApps.length) {
                writeJsonStorage(`pageme_study_apps_${ucn}`, settingsFromSheet.studyApps);
                setStudyApps(settingsFromSheet.studyApps);
              }
              if (settingsFromSheet.emergContact && settingsFromSheet.emergContact.number) {
                writeJsonStorage(`pageme_emergency_contact_${ucn}`, settingsFromSheet.emergContact);
                setEmergContact(settingsFromSheet.emergContact);
              }
              if (typeof settingsFromSheet.focusSilentPages === 'boolean') updateFocusSilentPages(settingsFromSheet.focusSilentPages);
              if (typeof settingsFromSheet.focusSoundEnabled === 'boolean') updateFocusSoundEnabled(settingsFromSheet.focusSoundEnabled);
              if (typeof settingsFromSheet.askShareStatus === 'boolean') {
                setAskShareStatus(settingsFromSheet.askShareStatus);
                localStorage.setItem(STATUS_SHARE_SETTING_KEY, settingsFromSheet.askShareStatus ? "true" : "false");
              }
            }
            recordProductEvent("activation_completed", "activation", activeStatusLink?.token || "");
            setActivated(true);
          }}
          soundOn={t.sound}
        />
        <TweaksPanel title="PageMe Tweaks">
          <TweakSection label="Display" />
          <TweakRadio label="Screen" value={t.lcdColor} options={[{value:"green",label:"Green"},{value:"amber",label:"Amber"},{value:"grayscale",label:"Gray"}]} onChange={(v) => setTweak("lcdColor", v)} />
          <TweakRadio label="Font" value={t.font} options={[{value:"lcd",label:"LCD"},{value:"pixel",label:"Pixel"},{value:"segment",label:"Seg"}]} onChange={(v) => setTweak("font", v)} />
          <TweakRadio label="Case" value={t.housing} options={[{value:"black",label:"Black"},{value:"beige",label:"Beige"},{value:"purple",label:"Purple"},{value:"red",label:"Red"}]} onChange={(v) => setTweak("housing", v)} />
          <TweakToggle label="Backlight" value={t.backlight} onChange={(v) => setTweak("backlight", v)} />
          <TweakToggle label="Alert tone" value={t.sound} onChange={(v) => setTweak("sound", v)} />
          <TweakSlider label="Battery" value={Math.round(t.battery * 100)} min={0} max={100} unit="%" onChange={(v) => setTweak("battery", v / 100)} />
        </TweaksPanel>
      </>
    );
  }

  // Pager UI
  const homeNow = now;
  const lastFrom = inbox[0]?.from || null;
  const activeMins = focusLockUntil && focusLockUntil > Date.now()
    ? Math.ceil((focusLockUntil - Date.now()) / (60 * 1000)) : 0;
  const status = (
    <StatusBar signal={4} battery={t.battery} soundOn={t.sound} msgUnread={unread}
      time={screen === "home" ? "" : safeFormatTime(homeNow, false)} lockMins={activeMins} />
  );

  let body = null;
  if (screen === "powering-off") body = (
    <div className="lcd-page lcd-center">
      <LcdLine align="center" dim>POWERING DOWN</LcdLine>
      <LcdLine align="center" dim>━ ━ ━</LcdLine>
    </div>
  );
  else if (screen === "exiting") {
    const dots = Math.floor(powerHoldProgress / 10);
    const bar = "█".repeat(dots) + "░".repeat(10 - dots);
    body = (
      <div className="lcd-page lcd-center">
        <LcdLine align="center" inverse>HOLD PWR TO EXIT</LcdLine>
        <div style={{ fontFamily: "var(--lcd-msg-font), monospace", textAlign: "center", fontSize: "1.4em", marginTop: 8, color: "var(--lcd-fg)" }}>[{bar}]</div>
        <LcdLine align="center" dim style={{ fontSize: "0.8em", marginTop: 8 }}>RELEASE TO CANCEL</LcdLine>
      </div>
    );
  }
  else if (screen === "boot") body = <BootScreen stage={bootStage} />;
  else if (screen === "welcome") body = <WelcomeScreen name={localStorage.getItem("pageme_user_name") || ""} capCode={localStorage.getItem("pageme_cap_code") || "PGR-001"} />;
  else if (screen === "pin-prompt") body = <PinPromptScreen />;
  else if (screen === "home") body = <HomeScreen now={homeNow} msgUnread={unread} lastFrom={lastFrom} focusLockUntil={focusLockUntil} />;
  else if (screen === "menu") body = <MenuScreen items={menuItems} selected={menuSel} />;
  else if (screen === "inbox") {
    let listToRender = [];
    if (inboxViewMode === "categories") listToRender = getInboxCategoryItems(inbox);
    else if (inboxViewMode === "contacts") listToRender = getInboxContacts(inbox, inboxCategory);
    else listToRender = getInboxMessages(inbox, inboxCategory, inboxContact);
    body = <InboxScreen items={listToRender} selected={inboxSel} viewMode={inboxViewMode} category={inboxCategory} contact={inboxContact} />;
  }
  else if (screen === "read") {
    const m = inbox.find((mm) => mm.id === readingId);
    body = <ReadScreen msg={m} codeMeaning={m && m.type === "code" ? findCodeMeaning(m.text) : null} />;
  }
  else if (screen === "message-actions") {
    const m = inbox.find((message) => message.id === readingId);
    body = <MessageActionsScreen sender={m?.from || ""} selected={messageActionSel} busy={messageActionBusy} />;
  }
  else if (screen === "compose") body = <ComposeScreen to={compTo} body={compBody} field={compField} mode={compMode} cursor={compCursor} />;
  else if (screen === "sending") body = <SendingScreen to={compTo} sentOk={sentOk} />;
  else if (screen === "codes") body = <CodesScreen codes={PAGER_CODES} selected={codeSel} />;
  else if (screen === "settings") body = <SettingsScreen items={settingsItems} selected={setSel} />;
  else if (screen === "blocked-users") body = <BlockedUsersScreen items={blockedUcns} selected={blockedSel} loading={blockedLoading} busy={blockedBusy} />;
  else if (screen === "clear-inbox") body = <ClearInboxScreen count={inbox.length} selected={clearInboxSel} />;
  else if (screen === "delete-account") body = <DeleteAccountScreen ucn={localStorage.getItem("pageme_cap_code") || ""} selected={deleteAccountSel} deleting={accountDeleting} />;
  else if (screen === "incoming") body = <IncomingOverlay msg={incoming} codeMeaning={incoming && incoming.type === "code" ? findCodeMeaning(incoming.text) : null} />;
  else if (screen === "about") body = <AboutScreen />;
  else if (screen === "timer") body = <TimerScreen options={timerOptions} selected={timerSel} activeLockUntil={focusLockUntil} />;
  else if (screen === "timer-custom") body = <CustomTimerScreen val={customTimerVal} />;
  else if (screen === "focus-sound-choice") body = <FocusSoundChoiceScreen selectedIndex={choiceSel} />;
  else if (screen === "focus-pages-choice") body = <FocusPagesChoiceScreen selectedIndex={choiceSel} />;
  else if (screen === "status-share") body = <StatusShareScreen
    selectedIndex={statusShareSel}
    context={statusShareContext?.context || "manual"}
    focusEndsAt={statusShareContext?.focusEndsAt || 0}
    copyOnly={statusShareContext?.copyOnly !== false}
    busy={statusShareBusy}
    error={statusShareError}
  />;
  else if (screen === "focus-locked") body = <FocusLockedScreen activeLockUntil={focusLockUntil} />;
  else if (screen === "study-apps") body = <StudyAppsScreen apps={studyApps} selected={studySel} />;
  else if (screen === "emergency") body = <EmergencyScreen options={emergOptions} selected={emergSel} />;
  else if (screen === "alarm") body = <AlarmOverlay info={alarmInfo} selected={alarmSel} />;

  const showStatus = screen !== "boot";
  const mSelected = screen === "read" ? inbox.find((mm) => mm.id === readingId) : null;
  // Screens that show a selectable list — button should read "SELECT" to guide the user
  const selectableScreens = new Set([
    "menu", "inbox", "codes", "settings", "timer",
    "study-apps", "emergency", "alarm", "clear-inbox", "delete-account",
    "message-actions", "blocked-users",
    "focus-sound-choice", "focus-pages-choice", "status-share",
  ]);
  const primaryAction =
      screen === "home"     ? "menu"
    : screen === "compose"  ? "send"
    : screen === "incoming" ? "read"
    : screen === "read"     ? (mSelected && mSelected.canReply ? "send" : "select")
    : selectableScreens.has(screen) ? "select"
    : "menu";

  const ChassisComp = t.formFactor === "horizontal" ? HorizontalPagerChassis : PagerChassis;

  return (
    <>
      <ChassisComp
        housing={t.housing} lcdColor={t.lcdColor} font={t.font}
        backlight={t.backlight && screen !== "powering-off"} vibrating={vibrating}
        ledBlink={(ledBlink || unread > 0) && screen !== "powering-off"}
        primaryAction={primaryAction}
        onButton={press}
        torchOn={torchOn}
        timerActive={focusLockUntil > Date.now()}
      >
        {showStatus && status}
        {body}
        {toastMessage && (
          <div role="status" aria-live="polite" style={{ position: "absolute", bottom: "0", left: "0", right: "0", background: "var(--lcd-fg)", color: "var(--lcd-bg)", fontFamily: "var(--lcd-chrome-font)", fontSize: "0.85em", padding: "6px 8px", textAlign: "center", zIndex: 1000, lineHeight: "1.3", borderTop: "1px dashed var(--lcd-bg)", wordBreak: "break-word", pointerEvents: "none" }}>
            {toastMessage}
          </div>
        )}
      </ChassisComp>

      {t.formFactor === "horizontal" && <RotateHint />}

      {showKb && (screen === "compose" || screen === "timer-custom") && (
        <Keyboard
          mode={screen === "timer-custom" ? "code" : (compField === "to" ? "text" : compMode)}
          onKey={onKb}
          showNavigation={screen === "compose"}
          onClose={() => { setShowKb(false); if (screen === "timer-custom") setScreen("timer"); }}
        />
      )}


      {screen === "study-config" && (
        <StudyConfigOverlay onSave={(apps) => { setStudyApps(apps); setScreen("settings"); }} onCancel={() => setScreen("settings")} />
      )}
      {screen === "focus-automation" && (
        <FocusAutomationOverlay
          initialConfig={focusAutomation}
          status={focusAutomationStatus}
          onSave={async (config) => {
            const normalized = normalizeFocusSchedule(config);
            let result = {};
            if (window.Capacitor?.Plugins?.FocusSchedulePlugin) {
              result = await window.Capacitor.Plugins.FocusSchedulePlugin.saveConfig({ config: JSON.stringify(normalized) });
              setFocusAutomationStatus(current => ({ ...current, ...result }));
            }
            writeJsonStorage("pageme_focus_schedule", normalized);
            setFocusAutomation(normalized);
            const loaded = await loadFocusAutomation();
            return { ...result, nextTriggerAt: loaded.status.nextTriggerAt || result.nextTriggerAt || 0 };
          }}
          onCancelActivation={async (config) => {
            const plugin = window.Capacitor?.Plugins?.FocusSchedulePlugin;
            let cancelled = normalizeFocusSchedule({ ...config, enabled: false });
            if (plugin?.cancelScheduledActivation) {
              const result = await plugin.cancelScheduledActivation();
              cancelled = normalizeFocusSchedule(JSON.parse(result?.config || JSON.stringify(cancelled)));
            } else if (plugin?.saveConfig) {
              await plugin.saveConfig({ config: JSON.stringify(cancelled) });
            }
            writeJsonStorage("pageme_focus_schedule", cancelled);
            setFocusAutomation(cancelled);
            await loadFocusAutomation();
          }}
          onCancel={() => setScreen("settings")}
          onRequestHome={async () => {
            const result = await window.Capacitor?.Plugins?.LauncherPlugin?.requestLauncherDefault();
            if (result?.isDefault === true) {
              setFocusAutomationStatus(current => ({ ...current, launcherDefault: true }));
            }
            setTimeout(() => loadFocusAutomation().catch(() => {}), 1500);
          }}
          onRequestCalendar={async () => {
            const result = await window.Capacitor?.Plugins?.FocusSchedulePlugin?.requestCalendarPermission();
            setFocusAutomationStatus(current => ({ ...current, calendarPermission: !!result?.granted }));
          }}
          onRequestReminderNotifications={async () => {
            const result = await window.Capacitor?.Plugins?.NotificationReceiverPlugin?.requestPostNotificationsPermission();
            setFocusAutomationStatus(current => ({ ...current, reminderNotificationsAllowed: !!result?.granted }));
          }}
          onRequestExactAlarm={async () => {
            await window.Capacitor?.Plugins?.FocusSchedulePlugin?.requestExactAlarmAccess();
            setTimeout(() => loadFocusAutomation().catch(() => {}), 1500);
          }}
          onRequestAutoLaunch={async () => {
            await window.Capacitor?.Plugins?.FocusSchedulePlugin?.requestAutoLaunchAccess();
            setTimeout(() => loadFocusAutomation().catch(() => {}), 1500);
          }}
          onSyncCalendar={async (config) => {
            const normalized = normalizeFocusSchedule(config);
            const plugin = window.Capacitor?.Plugins?.FocusSchedulePlugin;
            if (plugin) {
              await plugin.saveConfig({ config: JSON.stringify(normalized) });
            }
            writeJsonStorage("pageme_focus_schedule", normalized);
            setFocusAutomation(normalized);
            const result = await plugin?.syncCalendar();
            setFocusAutomationStatus(current => ({ ...current, nextTriggerAt: result?.nextTriggerAt || current.nextTriggerAt }));
            return result || { count: 0 };
          }}
        />
      )}
      {screen === "emergency-contact-config" && (
        <EmergencyContactOverlay initialContact={emergContact} onSave={(contact) => { setEmergContact(contact); setScreen("settings"); }} onCancel={() => setScreen("settings")} />
      )}

      <TweaksPanel title="PageMe Tweaks">
        <TweakSection label="Form factor" />
        <TweakRadio label="Layout" value={t.formFactor} options={[{value:"mobile",label:"Mobile"},{value:"horizontal",label:"Real Pager"}]} onChange={(v) => setTweak("formFactor", v)} />
        <TweakSection label="Display" />
        <TweakRadio label="Screen" value={t.lcdColor} options={[{value:"green",label:"Green"},{value:"amber",label:"Amber"},{value:"grayscale",label:"Gray"}]} onChange={(v) => setTweak("lcdColor", v)} />
        <TweakRadio label="Font" value={t.font} options={[{value:"lcd",label:"LCD"},{value:"pixel",label:"Pixel"},{value:"segment",label:"Seg"}]} onChange={(v) => setTweak("font", v)} />
        <TweakToggle label="Backlight" value={t.backlight} onChange={(v) => setTweak("backlight", v)} />
        <TweakSection label="Hardware" />
        <TweakRadio label="Case" value={t.housing} options={[{value:"black",label:"Black"},{value:"beige",label:"Beige"},{value:"purple",label:"Purple"},{value:"red",label:"Red"}]} onChange={(v) => setTweak("housing", v)} />
        <TweakSection label="Audio" />
        <TweakToggle label="Alert tone" value={t.sound} onChange={(v) => setTweak("sound", v)} />
        <TweakSection label="Battery" />
        <TweakSlider label="Charge" value={Math.round(t.battery * 100)} min={0} max={100} unit="%" onChange={(v) => setTweak("battery", v / 100)} />
        <TweakSection label="Demo" />
        <TweakButton label="Trigger incoming page" onClick={() => triggerIncoming({ from: "DEMO", number: "555-TEST", text: "143", type: "code", source: "sms" })} />
        <TweakButton label="Trigger missed call" onClick={() => triggerIncoming({ from: "JEN", number: "555-0177", text: "121", type: "code", source: "call" })} />
        <TweakButton label="Reset to activation" secondary onClick={() => { localStorage.removeItem("pageme_setup_step"); setActivated(false); }} />
      </TweaksPanel>
    </>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("ErrorBoundary caught an error", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#8a0000', color: '#fff', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.4' }}>
          <h2>React Render Crash</h2>
          <p>{this.state.error ? this.state.error.toString() : "Unknown error"}</p>
          <pre>{this.state.error ? this.state.error.stack : ""}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
