// activation.jsx — first-run "Activate Pager Mode" gate

import React from 'react';
import { blip } from './audio.js';
import { COUNTRIES } from './data.jsx';
import { postPageMe } from './api.js';
import { REQUIRE_SERVER_SESSION } from './config.js';
import { clearSessionToken, sessionTokenFromResponse, storeSessionToken } from './identity.js';

function Toggle({ label, sub, on, onClick, disabled = false }) {
  return (
    <div className="act-check">
      <div className="act-check-text">
        <div className="act-check-lbl">{label}</div>
        {sub && <div className="act-check-sub">{sub}</div>}
      </div>
      <button
        type="button"
        className={"act-tg" + (on ? " on" : "")}
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      ><i /></button>
    </div>
  );
}

function PermissionAction({ label, sub, ready, onClick, disabled = false }) {
  return (
    <div className="act-check">
      <div className="act-check-text">
        <div className="act-check-lbl">{label}</div>
        {sub && <div className="act-check-sub">{sub}</div>}
      </div>
      <button type="button" className={"act-perm-btn" + (ready ? " ready" : "")}
        disabled={disabled || ready} onClick={onClick}>{ready ? "Ready" : "Allow"}</button>
    </div>
  );
}

export function ActivationScreen({ onActivate, soundOn, reAuthMode = false }) {
  const isReturningUser = () => !!(
    localStorage.getItem("pageme_user_name") &&
    localStorage.getItem("pageme_user_email") &&
    localStorage.getItem("pageme_cap_code")
  );

  const [step, setStep] = React.useState(() => {
    if (reAuthMode) return 6;
    const saved = localStorage.getItem("pageme_setup_step");
    if (saved) return parseInt(saved, 10);
    if (isReturningUser()) return 5;
    return 0;
  });
  const [permissions, setPermissions] = React.useState({
    notificationListener: false,
    dndAccess: false,
    launcherDefault: false,
    exactAlarm: false,
    autoLaunch: false,
    calendar: false,
    reminderNotifications: false,
  });
  const [permissionAction, setPermissionAction] = React.useState("");
  const permissionCheckSequence = React.useRef(0);
  const permissionRefreshTimer = React.useRef(null);

  const [signupForm, setSignupForm] = React.useState({
    name: "", email: "", occupation: "",
    status: "Reduce Screen Time", country: "", prefix: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [showCountrySuggestions, setShowCountrySuggestions] = React.useState(false);

  const [prevStep, setPrevStep] = React.useState(2);
  const [newlyRegistered, setNewlyRegistered] = React.useState(false);

  const [restoreUcn, setRestoreUcn] = React.useState("");
  const [restoreEmail, setRestoreEmail] = React.useState("");
  const [restoreLoading, setRestoreLoading] = React.useState(false);

  const [installedApps, setInstalledApps] = React.useState([]);
  const [loadingApps, setLoadingApps] = React.useState(false);
  const [selectedStudyPkgs, setSelectedStudyPkgs] = React.useState([]);

  const filteredCountries = React.useMemo(() => {
    const query = signupForm.country.trim().toLowerCase();
    if (!query) return [];
    return COUNTRIES.filter(c =>
      c.toLowerCase().includes(query) && c.toLowerCase() !== query
    ).slice(0, 6);
  }, [signupForm.country]);

  const handleFormChange = (field, val) => {
    setSignupForm((prev) => ({ ...prev, [field]: val }));
    setErrorMsg("");
  };

  const submitRestore = async (e) => {
    if (e) e.preventDefault();
    const ucn = restoreUcn.trim().toUpperCase();
    const email = restoreEmail.trim().toLowerCase();
    if (!ucn) { setErrorMsg("Please enter your UCN code."); return; }
    if (ucn.length < 3) { setErrorMsg("UCN code is too short."); return; }
    if (!email) { setErrorMsg("Please enter your registered email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErrorMsg("Please enter a valid email address."); return; }

    setRestoreLoading(true);
    setErrorMsg("");
    blip({ freq: 1400, dur: 0.05, vol: 0.1, enabled: soundOn });

    try {
      const res = await postPageMe({ action: "restore", capCode: ucn, email });
      if (res && res.status === "success" && res.name) {
        const sessionToken = sessionTokenFromResponse(res);
        if (REQUIRE_SERVER_SESSION && !sessionToken) {
          throw new Error("PageMe server must be upgraded before this account can sign in securely.");
        }
        if (sessionToken) storeSessionToken(sessionToken);
        localStorage.setItem("pageme_user_name", res.name);
        localStorage.setItem("pageme_user_email", res.email || "");
        localStorage.setItem("pageme_cap_code", res.capCode || ucn);
        if (res.profile) localStorage.setItem("pageme_user_profile", JSON.stringify(res.profile));
        setRestoreLoading(false);
        blip({ freq: 1600, dur: 0.1, vol: 0.12, enabled: soundOn });
        if (reAuthMode) {
          localStorage.removeItem("pageme_setup_step");
          onActivate(res.settings || null);
          return;
        }
        setPrevStep(6);
        const nextStep = 3;
        localStorage.setItem("pageme_setup_step", String(nextStep));
        setStep(nextStep);
      } else {
        throw new Error(res.error || "UCN not found. Please check your code.");
      }
    } catch (err) {
      console.warn("UCN restore failed:", err);
      setRestoreLoading(false);
      setErrorMsg(err.message || "Could not verify UCN. Check your code and try again.");
    }
  };

  const submitSignup = async (e) => {
    if (e) e.preventDefault();
    if (!signupForm.name.trim()) { setErrorMsg("Full name is required."); return; }
    if (!signupForm.email.trim()) { setErrorMsg("Email address is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupForm.email.trim())) { setErrorMsg("Please enter a valid email address."); return; }
    if (!signupForm.occupation.trim()) { setErrorMsg("Occupation is required."); return; }
    if (!signupForm.country.trim()) { setErrorMsg("Country is required."); return; }
    const prefix = signupForm.prefix.trim().toUpperCase();
    if (!prefix) { setErrorMsg("3-letter prefix is required."); return; }
    if (!/^[A-Z]{3}$/.test(prefix)) { setErrorMsg("Prefix must be exactly 3 letters (A-Z)."); return; }

    setSubmitting(true);
    setErrorMsg("");
    blip({ freq: 1400, dur: 0.05, vol: 0.1, enabled: soundOn });

    let capCode = "";
    let sessionToken = "";
    try {
      const res = await postPageMe({
        action: "register",
        name: signupForm.name.trim(), email: signupForm.email.trim(),
        occupation: signupForm.occupation.trim(), status: signupForm.status,
        country: signupForm.country.trim(), prefix
      });
      if (res && (res.code === "EMAIL_EXISTS" || res.code === "email_exists")) {
        setSubmitting(false);
        setErrorMsg("This email is already registered. Use 'Restore UCN' to access your account.");
        return;
      }
      if (res && res.status === "success") {
        capCode = res.capCode;
        sessionToken = sessionTokenFromResponse(res);
        if (REQUIRE_SERVER_SESSION && !sessionToken) {
          throw new Error("PageMe server accepted the account but did not issue a secure session. Restore this account after the server is upgraded.");
        }
      } else {
        throw new Error(res.error || "Server rejected registration");
      }
    } catch (err) {
      console.warn("Registration failed:", err);
      setSubmitting(false);
      setErrorMsg(err.message || "Registration could not be completed. Check your connection and try again.");
      return;
    }

    if (sessionToken) storeSessionToken(sessionToken);
    localStorage.setItem("pageme_user_name", signupForm.name.trim());
    localStorage.setItem("pageme_user_email", signupForm.email.trim());
    localStorage.setItem("pageme_cap_code", capCode);
    localStorage.setItem("pageme_user_profile", JSON.stringify(signupForm));
    if (signupForm.status === "Study" && selectedStudyPkgs.length > 0) {
      const studyData = selectedStudyPkgs.map(pkg => ({
        name: (installedApps.find(a => a.packageName === pkg) || {}).name || pkg,
        packageName: pkg,
      }));
      localStorage.setItem(`pageme_study_apps_${capCode}`, JSON.stringify(studyData));
    }

    setSubmitting(false);
    blip({ freq: 1600, dur: 0.1, vol: 0.12, enabled: soundOn });
    setNewlyRegistered(true);
    localStorage.setItem("pageme_is_new_reg", "true");
    setPrevStep(7);
    setStep(7);
  };

  const checkPermissions = React.useCallback(async () => {
    if (!window.Capacitor) return;
    const sequence = ++permissionCheckSequence.current;
    const { NotificationReceiverPlugin, LauncherPlugin, FocusSchedulePlugin } = window.Capacitor.Plugins;
    const next = {
      notificationListener: false, dndAccess: false, launcherDefault: false,
      exactAlarm: false, autoLaunch: false, calendar: false,
      reminderNotifications: false,
    };
    try {
      if (NotificationReceiverPlugin) {
        const resNotif = await NotificationReceiverPlugin.checkNotificationListener();
        next.notificationListener = !!resNotif.enabled;
        const resDnd = await NotificationReceiverPlugin.checkDndAccess();
        next.dndAccess = !!resDnd.enabled;
        if (typeof NotificationReceiverPlugin.checkPostNotificationsPermission === 'function') {
          const result = await NotificationReceiverPlugin.checkPostNotificationsPermission();
          next.reminderNotifications = !!result?.granted;
        }
      }
      if (LauncherPlugin) {
        const resLaunch = await LauncherPlugin.checkLauncherDefault();
        next.launcherDefault = !!resLaunch.isDefault;
      }
      if (FocusSchedulePlugin) {
        const result = await FocusSchedulePlugin.getConfig();
        next.exactAlarm = !!result?.exactAlarmAllowed;
        next.autoLaunch = !!result?.autoLaunchAllowed;
        next.calendar = !!result?.calendarPermission;
      }
    } catch (e) { console.error("Error checking permissions", e); }
    if (sequence !== permissionCheckSequence.current) return;
    setPermissions((current) => {
      return Object.keys(next).every((key) => current[key] === next[key]) ? current : next;
    });
  }, []);

  const schedulePermissionRefresh = React.useCallback((delay = 350) => {
    if (permissionRefreshTimer.current) clearTimeout(permissionRefreshTimer.current);
    permissionRefreshTimer.current = setTimeout(() => {
      permissionRefreshTimer.current = null;
      checkPermissions();
    }, delay);
  }, [checkPermissions]);

  React.useEffect(() => {
    checkPermissions();
    if (!window.Capacitor) return undefined;
    const { App } = window.Capacitor.Plugins;
    if (!App) return undefined;
    const handler = App.addListener('appStateChange', (state) => {
      if (state.isActive) schedulePermissionRefresh();
    });
    return () => {
      if (permissionRefreshTimer.current) clearTimeout(permissionRefreshTimer.current);
      if (handler && typeof handler.remove === 'function') handler.remove();
    };
  }, [checkPermissions, schedulePermissionRefresh]);

  React.useEffect(() => {
    const handleLauncherDefaultChanged = (event) => {
      const isDefault = event?.detail?.isDefault === true;
      permissionCheckSequence.current += 1;
      setPermissions(current => current.launcherDefault === isDefault
        ? current
        : { ...current, launcherDefault: isDefault });
      setPermissionAction("");
      schedulePermissionRefresh(75);
    };
    window.addEventListener('pagemeLauncherDefaultChanged', handleLauncherDefaultChanged);
    return () => window.removeEventListener('pagemeLauncherDefaultChanged', handleLauncherDefaultChanged);
  }, [schedulePermissionRefresh]);

  const togglePermission = async (type) => {
    if (permissionAction) return;
    blip({ freq: 1600, dur: 0.025, vol: 0.07, enabled: soundOn });
    if (!window.Capacitor) {
      setPermissions(prev => ({ ...prev, [type]: !prev[type] }));
      return;
    }
    const { NotificationReceiverPlugin, LauncherPlugin, FocusSchedulePlugin } = window.Capacitor.Plugins;
    setPermissionAction(type);
    try {
      if (type === 'notificationListener' && NotificationReceiverPlugin) {
        if (permissions.notificationListener && typeof NotificationReceiverPlugin.setNotificationCaptureEnabled === 'function') {
          await NotificationReceiverPlugin.setNotificationCaptureEnabled({ enabled: false });
        } else {
          await NotificationReceiverPlugin.requestNotificationListener();
        }
      } else if (type === 'dndAccess' && NotificationReceiverPlugin) {
        localStorage.setItem("pageme_dnd_clicked", "true");
        await NotificationReceiverPlugin.requestDndAccess();
      } else if (type === 'launcherDefault' && LauncherPlugin) {
        if (permissions.launcherDefault && typeof LauncherPlugin.releaseLauncherDefault === 'function') {
          await LauncherPlugin.releaseLauncherDefault();
        } else {
          const result = await LauncherPlugin.requestLauncherDefault();
          if (result?.isDefault === true) {
            permissionCheckSequence.current += 1;
            setPermissions(current => ({ ...current, launcherDefault: true }));
          }
        }
      } else if (type === 'exactAlarm' && FocusSchedulePlugin) {
        await FocusSchedulePlugin.requestExactAlarmAccess();
      } else if (type === 'autoLaunch' && FocusSchedulePlugin) {
        await FocusSchedulePlugin.requestAutoLaunchAccess();
      } else if (type === 'calendar' && FocusSchedulePlugin) {
        await FocusSchedulePlugin.requestCalendarPermission();
      } else if (type === 'reminderNotifications' && NotificationReceiverPlugin) {
        await NotificationReceiverPlugin.requestPostNotificationsPermission();
      }
      schedulePermissionRefresh(type === 'launcherDefault' && permissions.launcherDefault ? 100 : 500);
    } catch (e) {
      console.error("Error toggling permission", e);
      schedulePermissionRefresh(100);
    } finally {
      setPermissionAction("");
    }
  };

  const next = () => {
    let nextStep = step;
    if (step === 0) nextStep = 1;
    else if (step === 1) nextStep = 2;
    else if (step === 2) return;
    else if (step === 3) {
      blip({ freq: 1600, dur: 0.05, vol: 0.12, enabled: soundOn });
      nextStep = 4;
      localStorage.removeItem("pageme_setup_step");
      localStorage.removeItem("pageme_dnd_clicked");
      setTimeout(() => {
        if (newlyRegistered || localStorage.getItem("pageme_is_new_reg") === "true") {
          localStorage.setItem("pageme_show_welcome", "true");
        }
        localStorage.removeItem("pageme_is_new_reg");
        onActivate();
      }, 1700);
    } else if (step === 7) {
      nextStep = 3;
    } else if (step === 5) {
      setPrevStep(5);
      blip({ freq: 1600, dur: 0.05, vol: 0.12, enabled: soundOn });
      nextStep = 3;
    } else if (step === 6) {
      return;
    }
    if (nextStep < 4) localStorage.setItem("pageme_setup_step", String(nextStep));
    setStep(nextStep);
  };

  return (
    <div className="act-shell">
      <div className="act-bg" />
      <div className="act-content">
        {step === 0 && (
          <>
            <div className="act-eyebrow">PAGE·ME</div>
            <h1 className="act-title">Turn your phone<br />into a pager.</h1>
            <p className="act-sub">
              PageMe replaces your home screen with a 1996 beeper.
              Calls, texts, and chats arrive as pages — name, number, and code only.
              Your apps stay quiet.
            </p>
            <ul className="act-list">
              <li><span className="act-dot" />Notifications become pages</li>
            </ul>
            <button className="act-btn primary" onClick={next}>Get started →</button>
            <div className="act-foot">A nostalgic focus mode</div>
            <button className="act-btn" style={{ background: "transparent", border: "none", color: "rgba(155,191,58,0.7)", fontSize: "12px", marginTop: "0", padding: "8px", textDecoration: "underline", cursor: "pointer" }}
              onClick={() => { setStep(6); setErrorMsg(""); }}>
              Already registered? Sign in with UCN
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <button className="act-back-btn" onClick={() => setStep(0)}>← Back</button>
            <h1 className="act-title">Escape the scroll.</h1>
            <p className="act-sub">Smartphones are built to steal your attention. PageMe helps you reclaim your time and focus on what matters.</p>
            <div className="act-benefits">
              <div className="act-benefit-card">
                <h3>🚫 Block Distractions</h3>
                <p>PageMe replaces your home launcher, keeping endless social feeds completely out of sight.</p>
              </div>
              <div className="act-benefit-card">
                <h3>🧠 Deep Focus</h3>
                <p>Urgent messages arrive as pager entries. Breathe, work, and stay fully present.</p>
              </div>
            </div>
            <button className="act-btn primary" onClick={next}>Continue to Setup →</button>
            <div className="act-foot">Reclaim your time</div>
          </>
        )}

        {step === 2 && (
          <>
            <button className="act-back-btn" onClick={() => setStep(1)}>← Back</button>
            <div className="act-eyebrow">REGISTRATION</div>
            <h1 className="act-title" style={{ fontSize: "24px", margin: "4px 0" }}>Register your Pager</h1>
            <p className="act-sub" style={{ fontSize: "12px", marginBottom: "8px" }}>Please enter your details to generate your unique pager Cap Code.</p>
            <form onSubmit={submitSignup} className="act-form" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="act-input-group">
                <label className="act-label">Full Name</label>
                <input type="text" className="act-input" maxLength={100} value={signupForm.name} onChange={(e) => handleFormChange("name", e.target.value)} placeholder="e.g. John Doe" disabled={submitting} />
              </div>
              <div className="act-input-group">
                <label className="act-label">Email Address</label>
                <input type="email" className="act-input" maxLength={200} value={signupForm.email} onChange={(e) => handleFormChange("email", e.target.value)} placeholder="e.g. john@example.com" disabled={submitting} />
              </div>
              <div className="act-input-group">
                <label className="act-label">Occupation</label>
                <input type="text" className="act-input" maxLength={100} value={signupForm.occupation} onChange={(e) => handleFormChange("occupation", e.target.value)} placeholder="e.g. Designer, Student" disabled={submitting} />
              </div>
              <div className="act-input-group">
                <label className="act-label">Focus Goal</label>
                <select className="act-select" value={signupForm.status} onChange={(e) => handleFormChange("status", e.target.value)} disabled={submitting}>
                  <option value="Reduce Screen Time">Reduce Screen Time</option>
                  <option value="Work Focus">Work Focus</option>
                  <option value="Digital Detox">Digital Detox</option>
                  <option value="Study">Study</option>
                  <option value="Nostalgia">Nostalgia</option>
                </select>
              </div>
              {signupForm.status === "Study" && (
                <div className="act-input-group">
                  <label className="act-label">Study Companion Apps (up to 3 — social media excluded)</label>
                  {!window.Capacitor ? (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(232,230,223,0.5)", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.2)", lineHeight: "1.6" }}>
                      App selection requires the installed app on your device.<br/>You can configure study apps via Settings after setup.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "rgba(155,191,58,0.8)", marginBottom: "6px" }}>{selectedStudyPkgs.length}/3 selected</div>
                      {installedApps.length === 0 && (
                        <button type="button" className="act-btn" style={{ background: "transparent", border: "1px solid rgba(155,191,58,0.4)", color: "#9bbf3a", fontSize: "12px", padding: "8px 12px", marginTop: "0" }}
                          disabled={loadingApps}
                          onClick={async () => {
                            setLoadingApps(true);
                            try {
                              const { NotificationReceiverPlugin } = window.Capacitor.Plugins;
                              if (NotificationReceiverPlugin && typeof NotificationReceiverPlugin.getInstalledApps === 'function') {
                                const res = await NotificationReceiverPlugin.getInstalledApps();
                                setInstalledApps(res.apps || []);
                              }
                            } catch (e) { console.error("getInstalledApps failed", e); }
                            setLoadingApps(false);
                          }}>
                          {loadingApps ? "Loading…" : "Load Available Apps →"}
                        </button>
                      )}
                      <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                        {installedApps.map(app => {
                          const isSel = selectedStudyPkgs.includes(app.packageName);
                          const isOff = !isSel && selectedStudyPkgs.length >= 3;
                          return (
                            <div key={app.packageName} onClick={() => { if (!isOff) setSelectedStudyPkgs(prev => isSel ? prev.filter(p => p !== app.packageName) : [...prev, app.packageName]); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", background: isSel ? "rgba(155,191,58,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid " + (isSel ? "rgba(155,191,58,0.5)" : "rgba(255,255,255,0.07)"), cursor: isOff ? "not-allowed" : "pointer", opacity: isOff ? 0.4 : 1 }}>
                              <div style={{ width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0, border: "2px solid " + (isSel ? "#9bbf3a" : "rgba(255,255,255,0.25)"), background: isSel ? "#9bbf3a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {isSel && <span style={{ color: "#0d1408", fontSize: "10px", fontWeight: "bold" }}>✓</span>}
                              </div>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>{app.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="act-input-group" style={{ position: "relative" }}>
                <label className="act-label">Country</label>
                <input type="text" className="act-input" value={signupForm.country}
                  onChange={(e) => { handleFormChange("country", e.target.value); setShowCountrySuggestions(true); }}
                  onFocus={() => setShowCountrySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCountrySuggestions(false), 200)}
                  placeholder="e.g. United States, Nigeria" disabled={submitting} autoComplete="off" />
                {showCountrySuggestions && filteredCountries.length > 0 && (
                  <div className="act-country-dropdown">
                    {filteredCountries.map((c) => (
                      <div key={c} className="act-country-item" onMouseDown={() => { handleFormChange("country", c); setShowCountrySuggestions(false); }}>{c}</div>
                    ))}
                  </div>
                )}
              </div>
              <div className="act-input-group">
                <label className="act-label">Preferred 3-letter Initials for UCN (Cap Code)</label>
                <input type="text" className="act-input" maxLength="3" style={{ textTransform: "uppercase" }} value={signupForm.prefix}
                  onChange={(e) => handleFormChange("prefix", e.target.value.replace(/[^a-zA-Z]/g, "").substring(0, 3))}
                  placeholder="e.g. AYO" disabled={submitting} />
              </div>
              {errorMsg && <div className="act-error">⚠️ {errorMsg}</div>}
              <button type="submit" className="act-btn primary" disabled={submitting} style={{ marginTop: "8px" }}>
                {submitting ? "Allocating Cap Code..." : "Submit & Generate Cap Code"}
              </button>
              <button type="button" className="act-btn" style={{ background: "transparent", border: "none", color: "rgba(155,191,58,0.8)", fontSize: "12px", marginTop: "0", padding: "6px", textDecoration: "underline", cursor: "pointer" }}
                onClick={() => { setStep(6); setErrorMsg(""); }}>
                Already registered? Sign in with UCN →
              </button>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <button className="act-back-btn" onClick={() => setStep(prevStep)}>← Back</button>
            <div className="act-eyebrow">STEP 2 OF 2</div>
            <h1 className="act-title">Enable Pager Mode</h1>
            <p className="act-sub">Real pagers ignore everything except pages. Flip these on so your phone behaves the same way.</p>
            <div className="act-section-label">Required for Pager Mode</div>
            <div className="act-checks">
              <Toggle label="Notification Capture" sub="Route incoming alerts through PageMe" on={permissions.notificationListener} disabled={!!permissionAction} onClick={() => togglePermission('notificationListener')} />
              <Toggle label="Do Not Disturb Access" sub="Allow PageMe to silence other alerts" on={permissions.dndAccess} disabled={!!permissionAction} onClick={() => togglePermission('dndAccess')} />
              <Toggle label="Lock as Home Screen" sub="PageMe replaces your launcher while Pager Mode is active" on={permissions.launcherDefault} disabled={!!permissionAction} onClick={() => togglePermission('launcherDefault')} />
            </div>
            <div className="act-section-label optional">Optional features</div>
            <div className="act-section-help">Set these up now to avoid Android permission screens after PageMe is pinned.</div>
            <div className="act-checks optional">
              <PermissionAction label="Precise scheduling" sub="Run saved activation and reminders at the selected time" ready={permissions.exactAlarm} disabled={!!permissionAction} onClick={() => togglePermission('exactAlarm')} />
              <PermissionAction label="Automatic scheduled launch" sub="Bring PageMe forward when an activation schedule starts" ready={permissions.autoLaunch} disabled={!!permissionAction} onClick={() => togglePermission('autoLaunch')} />
              <PermissionAction label="Calendar access" sub="Read matching event titles for optional reminders" ready={permissions.calendar} disabled={!!permissionAction} onClick={() => togglePermission('calendar')} />
              <PermissionAction label="Reminder notifications" sub="Show calendar reminders without activating PageMe" ready={permissions.reminderNotifications} disabled={!!permissionAction} onClick={() => togglePermission('reminderNotifications')} />
            </div>
            <button className="act-btn primary" onClick={next}
              disabled={!permissions.notificationListener || !permissions.dndAccess || !permissions.launcherDefault}>
              Activate Pager Mode
            </button>
            <div className="act-foot small">Android displays its own confirmation screens for protected access.</div>
          </>
        )}

        {step === 4 && (
          <div className="act-activating">
            <div className="act-spinner" />
            <div className="act-eyebrow" style={{ marginTop: 16 }}>ACTIVATING</div>
            <div className="act-activating-msg">Tuning RF receiver…</div>
          </div>
        )}

        {step === 5 && (
          <>
            <div className="act-eyebrow">WELCOME BACK</div>
            <h1 className="act-title">Hi {(localStorage.getItem("pageme_user_name") || "").trim().split(" ")[0] || "User"}!</h1>
            <p className="act-sub">Good to see you again. Your pager profile is still saved. Let's get you back into focus mode.</p>
            <div className="act-benefit-card" style={{ textAlign: "center", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "rgba(232,230,223,0.5)", letterSpacing: "0.1em", marginBottom: "4px" }}>YOUR UCN</div>
              <div style={{ fontSize: "22px", fontFamily: "'Silkscreen', monospace", color: "#9bbf3a", letterSpacing: "0.08em" }}>
                {localStorage.getItem("pageme_cap_code") || "PGR-001"}
              </div>
            </div>
            <button className="act-btn primary" onClick={next}>Resume Pager Mode →</button>
            <button className="act-btn" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(232,230,223,0.6)", marginTop: "4px", fontSize: "13px" }}
              onClick={() => { ["pageme_user_name","pageme_user_email","pageme_cap_code","pageme_user_profile","pageme_setup_step","pageme_dnd_clicked","pageme_show_welcome"].forEach(k => localStorage.removeItem(k)); clearSessionToken(); setStep(0); }}>
              Reset Pager Profile
            </button>
            <div className="act-foot">Your existing registration will be used</div>
          </>
        )}

        {step === 6 && (
          <>
            <div className="act-eyebrow">{reAuthMode ? "VERIFY IDENTITY" : "RESTORE PAGER"}</div>
            <h1 className="act-title" style={{ fontSize: "24px", margin: "4px 0" }}>Sign in with UCN</h1>
            <p className="act-sub" style={{ fontSize: "12px", marginBottom: "8px" }}>
              {reAuthMode ? "You've been away for a while. Enter your UCN and registered email to continue." : "Enter the UCN (Cap Code) from your registration email to restore your pager profile."}
            </p>
            <form onSubmit={submitRestore} className="act-form" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="act-input-group">
                <label className="act-label">Your UCN (e.g. AYO-001)</label>
                <input type="text" className="act-input"
                  style={{ textTransform: "uppercase", fontSize: "18px", textAlign: "center", letterSpacing: "0.15em", padding: "12px" }}
                  value={restoreUcn}
                  onChange={(e) => {
                    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                    const isDeleting = raw.length < restoreUcn.length;
                    let val = raw;
                    if (!isDeleting) {
                      if (val.indexOf('-') === -1 && val.length >= 3 && /^[A-Z]{3}/.test(val)) {
                        val = val.slice(0, 3) + '-' + val.slice(3).replace(/[^0-9]/g, '');
                      } else if (val.indexOf('-') !== -1) {
                        const [pre, ...rest] = val.split('-');
                        val = pre.slice(0, 3) + '-' + rest.join('').replace(/[^0-9]/g, '');
                      }
                    }
                    setRestoreUcn(val.slice(0, 7));
                    setErrorMsg("");
                  }}
                  placeholder="XXX-000" disabled={restoreLoading} maxLength={7} autoComplete="off" />
              </div>
              <div className="act-input-group">
                <label className="act-label">Registered Email (for verification)</label>
                <input type="email" className="act-input" value={restoreEmail}
                  onChange={(e) => { setRestoreEmail(e.target.value.trim()); setErrorMsg(""); }}
                  placeholder="e.g. john@example.com" disabled={restoreLoading} maxLength={200} autoComplete="email" />
              </div>
              {errorMsg && <div className="act-error">⚠️ {errorMsg}</div>}
              <button type="submit" className="act-btn primary" disabled={restoreLoading} style={{ marginTop: "4px" }}>
                {restoreLoading ? "Verifying UCN..." : "Restore My Pager →"}
              </button>
            </form>
            <button className="act-btn" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#e8e6df", marginTop: "4px" }}
              onClick={() => { setStep(0); localStorage.removeItem("pageme_setup_step"); setErrorMsg(""); }}>
              Register as new user instead
            </button>
            <div className="act-foot">Check your email for your UCN code</div>
          </>
        )}

        {step === 7 && (
          <>
            <div className="act-eyebrow">REGISTRATION COMPLETE</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", margin: "24px 0" }}>
              <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "rgba(155,191,58,0.12)", border: "2px solid #9bbf3a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "28px", color: "#9bbf3a" }}>✓</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(232,230,223,0.5)", letterSpacing: "0.1em", marginBottom: "8px" }}>YOUR UNIQUE CODE NUMBER</div>
                <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: "28px", color: "#9bbf3a", letterSpacing: "0.12em" }}>{localStorage.getItem("pageme_cap_code") || "PGR-001"}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "rgba(232,230,223,0.6)", marginTop: "12px", lineHeight: "1.6" }}>
                  Pager registered successfully.<br />
                  A confirmation was sent to<br />
                  <span style={{ color: "rgba(155,191,58,0.85)" }}>{localStorage.getItem("pageme_user_email") || "your email"}</span>
                </div>
              </div>
            </div>
            <p className="act-sub" style={{ textAlign: "center", fontSize: "12px", margin: "0 0 4px" }}>Save your UCN — it's how other users will page you.</p>
            <button className="act-btn primary" onClick={next}>Continue to Setup →</button>
            <div className="act-foot">Your pager identity is now live</div>
          </>
        )}
      </div>

      <style>{`
        .act-back-btn { appearance: none; border: none; background: transparent; color: rgba(155,191,58,0.8); font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 0 0 6px; cursor: pointer; align-self: flex-start; letter-spacing: 0.03em; }
        .act-back-btn:hover { color: #9bbf3a; }
        .act-shell { position: relative; width: 100%; min-height: 100vh; min-height: 100dvh; display: flex; align-items: flex-start; justify-content: center; padding: 32px 24px 48px; color: #e8e6df; overflow-x: hidden; overflow-y: auto; background: #0d1408; }
        .act-bg { position: absolute; inset: 0; background: radial-gradient(60% 40% at 50% 0%, rgba(155,191,58,0.10), transparent 60%), radial-gradient(80% 60% at 50% 100%, rgba(255,160,40,0.06), transparent 60%); pointer-events: none; }
        .act-content { position: relative; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; margin: auto 0; }
        .act-eyebrow { font-family: 'Silkscreen', monospace; font-size: 11px; letter-spacing: 0.22em; color: #9bbf3a; }
        .act-title { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(28px, 8vw, 38px); line-height: 1.05; letter-spacing: -0.01em; margin: 4px 0 6px; color: #f4f1e8; text-wrap: balance; }
        .act-sub { font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.5; color: rgba(232,230,223,0.62); margin: 0 0 8px; text-wrap: pretty; }
        .act-list { list-style: none; padding: 0; margin: 4px 0 18px; display: flex; flex-direction: column; gap: 10px; }
        .act-list li { font-size: 13px; color: rgba(232,230,223,.78); display: flex; align-items: center; gap: 10px; }
        .act-dot { width: 6px; height: 6px; border-radius: 50%; background: #9bbf3a; box-shadow: 0 0 8px rgba(155,191,58,.6); flex-shrink: 0; }
        .act-benefits { display: flex; flex-direction: column; gap: 12px; margin: 4px 0 14px; }
        .act-benefit-card { padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; }
        .act-benefit-card h3 { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #9bbf3a; margin: 0 0 6px 0; font-weight: 600; }
        .act-benefit-card p { font-size: 12px; color: rgba(232,230,223,0.65); margin: 0; line-height: 1.45; }
        .act-checks { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 8px; }
        .act-checks.optional { gap: 6px; }
        .act-section-label { margin-top: 4px; font-size: 10px; color: #9bbf3a; text-transform: uppercase; }
        .act-section-label.optional { margin-top: 12px; }
        .act-section-help { margin: 3px 0 7px; font-size: 10px; line-height: 1.35; color: rgba(232,230,223,0.48); }
        .act-check { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; }
        .act-check-text { flex: 1; min-width: 0; }
        .act-check-lbl { font-size: 14px; color: #f4f1e8; font-weight: 500; }
        .act-check-sub { font-size: 11px; color: rgba(232,230,223,0.5); margin-top: 2px; line-height: 1.3; }
        .act-tg { appearance: none; position: relative; flex-shrink: 0; width: 38px; height: 22px; padding: 0; border-radius: 999px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.08); cursor: pointer; transition: background .15s; }
        .act-tg.on { background: #9bbf3a; border-color: #9bbf3a; }
        .act-tg:disabled { cursor: wait; opacity: .7; }
        .act-tg i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.4); transition: transform .15s; }
        .act-tg.on i { transform: translateX(16px); }
        .act-perm-btn { flex-shrink: 0; min-width: 58px; border: 1px solid #9bbf3a; border-radius: 6px; background: transparent; color: #9bbf3a; padding: 7px 9px; font: 700 10px 'JetBrains Mono', monospace; cursor: pointer; }
        .act-perm-btn.ready { border-color: rgba(155,191,58,.3); background: rgba(155,191,58,.12); cursor: default; }
        .act-btn { appearance: none; border: 0; font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 15px; padding: 16px 20px; border-radius: 12px; cursor: pointer; margin-top: 8px; letter-spacing: 0.01em; background: rgba(255,255,255,0.06); color: #e8e6df; width: 100%; }
        .act-btn.primary { background: #9bbf3a; color: #0d1408; box-shadow: 0 6px 24px rgba(155,191,58,.35); }
        .act-btn.primary:active { transform: translateY(1px); }
        .act-foot { font-size: 11px; color: rgba(232,230,223,0.35); text-align: center; margin-top: 8px; letter-spacing: 0.04em; }
        .act-foot.small { line-height: 1.4; }
        .act-activating { display: flex; flex-direction: column; align-items: center; padding: 60px 0; }
        .act-spinner { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(155,191,58,.2); border-top-color: #9bbf3a; animation: spin 0.9s linear infinite; }
        .act-activating-msg { font-family: 'Share Tech Mono', monospace; color: #9bbf3a; font-size: 13px; letter-spacing: 0.06em; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .act-input-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .act-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(232,230,223,0.7); text-align: left; }
        .act-input { appearance: none; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 10px; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 13px; width: 100%; box-sizing: border-box; }
        .act-input:focus { border-color: #9bbf3a; outline: none; }
        .act-select { appearance: none; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23eee'><path d='M2 4l4 4 4-4z'/></svg>") no-repeat right 12px center; border-radius: 8px; padding: 8px 32px 8px 10px; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 13px; width: 100%; }
        .act-select:focus { border-color: #9bbf3a; outline: none; }
        .act-error { color: #ff6b6b; font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-top: 2px; text-align: left; }
        .act-country-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #0c1207; border: 1px solid rgba(155,191,58,0.4); border-radius: 8px; max-height: 160px; overflow-y: auto; z-index: 999; margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        .act-country-item { padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: rgba(232,230,223,0.9); cursor: pointer; text-align: left; }
        .act-country-item:hover { background: #9bbf3a; color: #0d1408; }
      `}</style>
    </div>
  );
}
