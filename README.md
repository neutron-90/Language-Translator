# LinGUA — AI Word & Phrase Explainer

A lightweight Chrome/Edge (Manifest V3) browser extension that explains
difficult words, phrases, or sentences **in context** — not a robotic
word-for-word dictionary translation. Select or paste any confusing text you
find on the web, choose a target language, hit **Run**, and get:

- **MEANING** — a short, clear one-line meaning (highlighter-marker style)
- **EXPLANATION** — 2–3 sentences of contextual/nuance explanation in plain language
- **EXAMPLE** — a usage example

It's powered by [Gemini](https://aistudio.google.com/apikey) (free tier,
no credit card required) with an automatic **Groq backup** — if Gemini is
overloaded or returns an error (e.g. `503`), LinGUA retries with Groq, trying
two different Groq models in order before giving up. Everything runs
client-side; your API keys are stored only in your browser's local storage.

## Features

- 🖱️ **Right-click → "Explain with LinGUA"** on any selected text on any webpage
- 🌐 Target language picker: Roman Urdu, Urdu (script), Simple English, Hindi,
  Punjabi (Shahmukhi), Arabic, or a custom language of your choice
- 🖍️ Highlighter-style visual emphasis on the core meaning
- 🧭 Shows the currently active model at the top of the popup, and which
  provider actually answered (Gemini or Groq) under each result
- 🔁 Automatic fallback chain: Gemini → Groq `openai/gpt-oss-120b` → Groq
  `openai/gpt-oss-20b`, so a single provider outage doesn't block you
- 🧹 **Clear** button to reset the input and result after each lookup
- 🔑 Bring your own free API keys — no backend server, no data collection
- ⚡ Choice of `gemini-2.5-flash` (better quality) or `gemini-2.5-flash-lite`
  (higher free daily request limit)

## Installation (unpacked / developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions` on Edge) in your browser.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `lingua-extension` folder.
5. Pin the extension from the puzzle-piece icon in your toolbar for quick access.

## Setup

1. Get a free Gemini API key from
   [Google AI Studio](https://aistudio.google.com/apikey) (sign in with a
   Google account, no credit card needed).
2. *(Optional but recommended)* Get a free Groq API key from
   [console.groq.com/keys](https://console.groq.com/keys) — this is used
   automatically as a backup whenever Gemini fails or is overloaded.
3. Click the extension icon, then the ⚙ settings icon.
4. Paste your Gemini key, pick a model, optionally paste your Groq key, and
   click **Save**.

## Usage

**Option A — Right-click:**
Select any word/phrase/sentence on a webpage → right-click → *"Explain with
LinGUA"* → the popup opens with the text pre-filled → choose a language →
**Run**.

**Option B — Manual paste:**
Copy any text → click the extension icon → paste it into the text box →
choose a language → **Run**.

After a result appears, use **Clear** to reset the box for your next lookup.

## Project structure

```
lingua-extension/
├── manifest.json     # MV3 manifest (permissions, action, background)
├── background.js     # Context-menu ("right-click explain") handler
├── popup.html         # Popup UI markup
├── popup.css          # Popup styling (design tokens, highlighter effect)
├── popup.js           # Settings, Gemini/Groq calls with fallback, rendering
└── icons/              # Extension icons (16/32/48/128 px)
```

## How it works

1. `popup.js` builds a prompt instructing the AI to respond with a strict
   JSON object: `{ "meaning": "...", "explanation": "...", "example": "..." }`,
   in the user's chosen language.
2. For Gemini, this is enforced with a `responseSchema` (structured output),
   which reliably returns all three fields regardless of which Gemini model
   is selected.
3. It calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
   with the API key passed via the `x-goog-api-key` header.
4. If that call fails for any reason (invalid key, rate limit, `503`
   overload, network error), it automatically retries with Groq's
   OpenAI-compatible endpoint (`https://api.groq.com/openai/v1/chat/completions`),
   trying `openai/gpt-oss-120b` first and `openai/gpt-oss-20b` second.
5. The JSON is parsed and rendered into a dictionary-style card, with the
   `meaning` field wrapped in a highlighted `<mark>`.

## Privacy

- No backend, no analytics, no telemetry.
- Your API keys and settings are stored only via `chrome.storage.local`
  (on-device).
- Text you submit is sent directly from your browser to Google's Gemini API
  and/or Groq's API to generate the explanation — nothing is stored or
  logged by this extension.

## Known limitations

- Free-tier API keys have rate limits (varies by model/day); you may still
  see errors under very heavy use if both Gemini and all Groq fallbacks are
  exhausted — just wait and retry.
- `chrome.action.openPopup()` (auto-opening the popup after a right-click) is
  only supported on newer Chromium versions; on older browsers you'll need to
  click the toolbar icon once (a badge indicator shows a pending explanation).

## Contributing

Issues and pull requests are welcome.

## Credit

Developed by **Tayyab**.

## License

MIT
