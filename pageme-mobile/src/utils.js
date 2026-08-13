// utils.js — shared formatting, navigation, and inbox grouping helpers

export function safeFormatTime(d, hour12 = false) {
  try {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: hour12 });
  } catch (e) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (hour12) {
      const hInt = d.getHours();
      const ampm = hInt >= 12 ? "PM" : "AM";
      const h12 = hInt % 12 || 12;
      return String(h12).padStart(2, '0') + ":" + mm + " " + ampm;
    }
    return hh + ":" + mm;
  }
}

export function safeFormatDate(d) {
  try {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" }).toUpperCase();
  } catch (e) {
    const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return weekdays[d.getDay()] + ", " + months[d.getMonth()] + " " + String(d.getDate()).padStart(2, '0');
  }
}

export function nowFormat(d) {
  try {
    return {
      time: safeFormatTime(d, false),
      date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase(),
    };
  } catch (e) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return {
      time: safeFormatTime(d, false),
      date: months[d.getMonth()] + " " + String(d.getDate()).padStart(2, '0'),
    };
  }
}

export function getAppSourceCategory(source) {
  if (!source) return "SMS";
  const src = source.toLowerCase();
  if (src === "call" || src === "phone" || src === "dialer") return "CALLS";
  if (src === "whatsapp") return "WHATSAPP";
  if (src === "slack") return "SLACK";
  if (src === "email" || src === "gmail" || src === "outlook" || src === "mail") return "EMAIL";
  if (src === "msgr" || src === "messenger" || src === "orca") return "MESSENGER";
  if (src === "alarm" || src === "clock" || src === "deskclock") return "ALARMS";
  if (src === "google" || src === "googlequicksearchbox") return "GOOGLE";
  if (src === "sms" || src === "messages" || src === "messaging" || src === "pageme") return "SMS";

  let abbr = source.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (abbr.length > 10) abbr = abbr.substring(0, 10);
  return abbr || "OTHER";
}

export function getInboxSenderName(message) {
  let sender = (message?.from || "UNKNOWN")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "UNKNOWN";
  sender = sender
    .replace(/^\d+\s+(?:new\s+)?messages?\s+from\s+/i, "")
    .replace(/\s*[-–—]\s*(?:whatsapp|\d+\s+(?:new\s+)?messages?)\s*$/i, "")
    .replace(/\s*\((?:\d+\s+)?(?:new\s+)?messages?\)\s*$/i, "")
    .replace(/\s*[·•]\s*\d+\s+(?:new\s+)?messages?\s*$/i, "")
    .replace(/\s*\[\d+\s+(?:new\s+)?messages?\]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return sender || "UNKNOWN";
}

export function getInboxSenderKey(message) {
  const category = getAppSourceCategory(message?.source);
  const nativeKey = typeof message?.senderKey === "string"
    ? message.senderKey.normalize("NFKC").trim().toLocaleLowerCase()
    : "";
  if (nativeKey) return `${category}\u0000${nativeKey}`;
  return `${category}\u0000${getInboxSenderName(message).toLocaleLowerCase()}`;
}

export function getInboxCategories(messages) {
  const categoriesMap = {};
  messages.forEach(m => {
    const cat = getAppSourceCategory(m.source);
    if (!categoriesMap[cat]) {
      categoriesMap[cat] = {
        name: cat,
        unread: 0,
        total: 0,
        timestamp: m.id || ""
      };
    }
    categoriesMap[cat].total++;
    if (!m.read) {
      categoriesMap[cat].unread++;
    }
  });
  return Object.values(categoriesMap).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getInboxCategoryItems(messages) {
  if (!messages.length) return [];
  return [
    { name: "CLEAR ALL PAGES", unread: 0, total: messages.length, timestamp: "", clearAction: true },
    ...getInboxCategories(messages),
  ];
}

function getInboxSenderGroups(messages, categoryName) {
  const groups = [];

  messages.forEach(message => {
    if (getAppSourceCategory(message.source) !== categoryName) return;

    const name = getInboxSenderName(message);
    const nameKey = name.toLocaleLowerCase();
    const nativeKey = typeof message?.senderKey === "string"
      ? message.senderKey.normalize("NFKC").trim().toLocaleLowerCase()
      : "";
    const matches = groups.filter(group =>
      group.names.has(nameKey) || (nativeKey && group.nativeKeys.has(nativeKey))
    );
    const group = matches.shift() || {
      name,
      names: new Set(),
      nativeKeys: new Set(),
      messages: [],
    };

    for (const duplicate of matches) {
      duplicate.names.forEach(value => group.names.add(value));
      duplicate.nativeKeys.forEach(value => group.nativeKeys.add(value));
      group.messages.push(...duplicate.messages);
      groups.splice(groups.indexOf(duplicate), 1);
    }

    group.names.add(nameKey);
    if (nativeKey) group.nativeKeys.add(nativeKey);
    group.messages.push(message);
    if (!groups.includes(group)) groups.push(group);
  });

  return groups;
}

export function getInboxContacts(messages, categoryName) {
  return getInboxSenderGroups(messages, categoryName).map(group => ({
    name: group.name,
    unread: group.messages.filter(message => !message.read).length,
    total: group.messages.length,
    timestamp: group.messages.reduce((latest, message) =>
      (message.id || "").localeCompare(latest) > 0 ? message.id : latest, ""),
  })).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getInboxMessages(messages, categoryName, contactName) {
  const requestedName = (contactName || "").trim().toLocaleLowerCase();
  const group = getInboxSenderGroups(messages, categoryName)
    .find(item => item.names.has(requestedName));
  return group ? group.messages : [];
}

export function cycle(arr, cur) {
  const i = arr.indexOf(cur);
  return arr[(i + 1) % arr.length];
}
