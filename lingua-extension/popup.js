// popup.js

const $ = (id) => document.getElementById(id);

const inputText = $("inputText");
const targetLang = $("targetLang");
const customLang = $("customLang");
const runBtn = $("runBtn");
const clearBtn = $("clearBtn");
const statusMsg = $("statusMsg");
const resultCard = $("resultCard");
const headword = $("headword");
const meaningText = $("meaningText");
const explanationText = $("explanationText");
const exampleText = $("exampleText");
const answeredBy = $("answeredBy");
const modelBadge = $("modelBadge");

const mainView = $("mainView");
const settingsView = $("settingsView");
const aboutView = $("aboutView");
const settingsBtn = $("settingsBtn");
const aboutBtn = $("aboutBtn");
const apiKeyInput = $("apiKeyInput");
const modelSelect = $("modelSelect");
const groqKeyInput = $("groqKeyInput");
const saveSettingsBtn = $("saveSettingsBtn");
const saveMsg = $("saveMsg");

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

const MODEL_LABELS = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
};

// ---------- init ----------
(async function init() {
  const store = await chrome.storage.local.get([
    "pendingText", "geminiApiKey", "geminiModel", "groqApiKey", "lastLang",
  ]);

  if (store.pendingText) {
    inputText.value = store.pendingText;
    chrome.storage.local.remove("pendingText");
    chrome.action.setBadgeText({ text: "" });
  }

  if (store.lastLang) {
    const exists = [...targetLang.options].some((o) => o.value === store.lastLang);
    if (exists) targetLang.value = store.lastLang;
  }

  if (store.geminiApiKey) apiKeyInput.value = store.geminiApiKey;
  if (store.geminiModel) modelSelect.value = store.geminiModel;
  if (store.groqApiKey) groqKeyInput.value = store.groqApiKey;

  updateModelBadge(store.geminiModel || DEFAULT_GEMINI_MODEL);

  if (!store.geminiApiKey) {
    // First run — open settings so the user can add a key.
    showView(settingsView);
  }

  if (inputText.value.trim()) inputText.focus();
})();

function updateModelBadge(geminiModel) {
  const label = MODEL_LABELS[geminiModel] || geminiModel;
  modelBadge.textContent = `Active model: ${label}`;
}

// ---------- language select ----------
targetLang.addEventListener("change", () => {
  if (targetLang.value === "__custom__") {
    customLang.style.display = "block";
    customLang.focus();
  } else {
    customLang.style.display = "none";
  }
});

// ---------- view switching ----------
function showView(view) {
  mainView.hidden = view !== mainView;
  settingsView.hidden = view !== settingsView;
  aboutView.hidden = view !== aboutView;
}

settingsBtn.addEventListener("click", () => {
  showView(settingsView.hidden ? settingsView : mainView);
});

aboutBtn.addEventListener("click", () => {
  showView(aboutView.hidden ? aboutView : mainView);
});

saveSettingsBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const groqKey = groqKeyInput.value.trim();
  await chrome.storage.local.set({
    geminiApiKey: key,
    geminiModel: model,
    groqApiKey: groqKey,
  });
  updateModelBadge(model);
  saveMsg.hidden = false;
  setTimeout(() => {
    saveMsg.hidden = true;
    if (key) showView(mainView);
  }, 700);
});

// ---------- clear ----------
clearBtn.addEventListener("click", () => {
  inputText.value = "";
  resultCard.hidden = true;
  clearBtn.hidden = true;
  setStatus("", false);
  inputText.focus();
});

// ---------- run ----------
runBtn.addEventListener("click", handleRun);
inputText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRun();
});

async function handleRun() {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("Type or paste a word, phrase, or sentence first.", true);
    return;
  }

  const store = await chrome.storage.local.get(["geminiApiKey", "geminiModel", "groqApiKey"]);
  if (!store.geminiApiKey && !store.groqApiKey) {
    setStatus("Add at least a Gemini API key in Settings (⚙) first.", true);
    showView(settingsView);
    return;
  }

  let lang = targetLang.value;
  if (lang === "__custom__") {
    lang = customLang.value.trim();
    if (!lang) {
      setStatus("Type a language name.", true);
      return;
    }
  }
  await chrome.storage.local.set({ lastLang: targetLang.value });

  resultCard.hidden = true;
  clearBtn.hidden = true;
  runBtn.disabled = true;
  setStatus("Asking AI…", false);

  try {
    const { data, providerLabel } = await getExplanation({
      apiKey: store.geminiApiKey,
      geminiModel: store.geminiModel || DEFAULT_GEMINI_MODEL,
      groqApiKey: store.groqApiKey,
      sourceText: text,
      lang,
    });
    renderResult(text, data, providerLabel);
    setStatus("", false);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong, please try again.", true);
  } finally {
    runBtn.disabled = false;
  }
}

function setStatus(msg, isError) {
  if (!msg) {
    statusMsg.hidden = true;
    return;
  }
  statusMsg.hidden = false;
  statusMsg.textContent = msg;
  statusMsg.className = "status" + (isError ? " error" : "");
}

// ---------- prompt building ----------
function buildSystemPrompt(lang) {
  return (
    "You are a friendly, knowledgeable dictionary assistant. The user will give you a " +
    "difficult word, phrase, or sentence they found on a website and did not understand. " +
    `Always answer in the "${lang}" language, no matter what language the original text is in. ` +
    "Do not give a purely literal word-for-word translation — explain the full context, tone, " +
    "and usage the way a knowledgeable friend would, in simple everyday words. " +
    "Respond ONLY with a JSON object with exactly these three string keys: " +
    '"meaning" (a short, clear, one-line meaning), ' +
    '"explanation" (2-3 sentences explaining context, nuance, and usage in simple language), ' +
    '"example" (one example sentence using the word/phrase, with a brief translation or note if helpful). ' +
    "All three keys are required and must be non-empty. Do not include any text outside the JSON object."
  );
}

function buildUserPrompt(sourceText) {
  return `Explain this word/phrase/sentence: "${sourceText}"`;
}

// ---------- provider fallback chain ----------
async function getExplanation({ apiKey, geminiModel, groqApiKey, sourceText, lang }) {
  const system = buildSystemPrompt(lang);
  const user = buildUserPrompt(sourceText);

  const attempts = [];
  if (apiKey) {
    attempts.push({ provider: "gemini", model: geminiModel, label: MODEL_LABELS[geminiModel] || geminiModel });
  }
  if (groqApiKey) {
    for (const m of GROQ_MODELS) {
      attempts.push({ provider: "groq", model: m, label: `Groq backup (${m})` });
    }
  }

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      let data;
      if (attempt.provider === "gemini") {
        data = await callGemini({ apiKey, model: attempt.model, system, user });
      } else {
        data = await callGroq({ apiKey: groqApiKey, model: attempt.model, system, user });
      }
      return { data, providerLabel: attempt.label };
    } catch (e) {
      lastErr = e;
      continue; // try the next provider/model in the chain
    }
  }
  throw lastErr || new Error("No AI provider is configured.");
}

// ---------- Gemini ----------
async function callGemini({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            meaning: { type: "STRING" },
            explanation: { type: "STRING" },
            example: { type: "STRING" },
          },
          required: ["meaning", "explanation", "example"],
        },
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 403) {
      throw new Error("Gemini API Key is invalid. Check it in Settings.");
    }
    if (res.status === 429) {
      throw new Error("Gemini free quota reached (rate limit).");
    }
    throw new Error(`Gemini error (${res.status}). ${errBody.slice(0, 120)}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return parseExplanationJson(text);
}

// ---------- Groq (OpenAI-compatible chat completions) ----------
async function callGroq({ apiKey, model, system, user }) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Groq API Key is invalid. Check it in Settings.");
    }
    throw new Error(`Groq error (${res.status}). ${errBody.slice(0, 120)}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned an empty response.");
  return parseExplanationJson(text);
}

// ---------- shared JSON parsing ----------
function parseExplanationJson(text) {
  let cleaned = text.trim();
  // Some models wrap JSON in ```json fences despite instructions — strip them.
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

  let obj;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Could not read the AI's response. Please try again.");
  }

  const meaning = (obj.meaning || "").toString().trim();
  const explanation = (obj.explanation || "").toString().trim();
  const example = (obj.example || "").toString().trim();

  if (!meaning) throw new Error("The AI did not return a meaning. Please try again.");

  return { meaning, explanation, example };
}

// ---------- render ----------
function renderResult(sourceText, data, providerLabel) {
  headword.textContent = sourceText.length > 60 ? sourceText.slice(0, 57) + "…" : sourceText;
  meaningText.textContent = data.meaning || "—";
  explanationText.textContent = data.explanation || "—";
  exampleText.textContent = data.example || "—";
  answeredBy.textContent = providerLabel ? `via ${providerLabel}` : "";

  resultCard.hidden = false;
  clearBtn.hidden = false;
}
