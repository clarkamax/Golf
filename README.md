# Enterprise Electric — AI Phone Receptionist

An AI phone receptionist for **Enterprise Electric Inc.** It answers incoming calls
forwarded to a Twilio number, holds a natural voice conversation driven by Claude,
follows the business handbook, logs every call to a Google Sheet, and sends the owner
an SMS alert for urgent (emergency) calls.

- **Telephony / STT / TTS:** Twilio — turn-based `<Gather input="speech">` for
  speech-to-text and `<Say>` with an Amazon Polly **neural** voice for text-to-speech.
- **Conversation logic:** Claude (`claude-sonnet-4-6`) via the Anthropic SDK, with the
  business handbook as system-prompt context.
- **Logging:** Google Sheets API (service account).
- **Urgent alerts:** Twilio SMS to the owner.
- **Backend:** Node.js + Express.

> ⚠️ **The business handbook is a placeholder.** `handbook/HANDBOOK.md` currently
> contains clearly-labeled **dummy/sample** content so the system is testable. Replace
> its contents with the real Enterprise Electric handbook before going live — no code
> changes needed; the app reads the file at runtime.

---

## Call flow

1. Call comes in → Twilio POSTs `POST /voice` → the app greets the caller (`<Say>`) and
   starts listening (`<Gather input="speech">`).
2. Caller speaks → Twilio POSTs `POST /gather` with the transcript. The app sends the
   conversation + handbook to Claude, parses Claude's JSON, and speaks the reply, then
   listens again — or hangs up when Claude signals the call is complete.
3. On completion (or hangup via `POST /status`), the app:
   - always appends a row to the Google Sheet;
   - additionally sends the owner an **urgent SMS** if the call was classified `urgent`.

Claude returns a strict JSON object each turn so the backend can act on it:

```json
{
  "spoken_reply": "…",
  "category": "urgent | appointment | routine | in_progress",
  "summary": "…",
  "caller_name": "",
  "callback_number": "",
  "address": "",
  "preferred_time": "",
  "call_complete": true
}
```

`in_progress` is used while Claude is still gathering info; the category is only
finalized once there's enough detail.

### Google Sheet columns

`Timestamp | Caller Number | Category | Caller Name | Callback Number | Address | Summary | Preferred Time | Status`

`Status` is left blank for the business owner to update manually (New / Handled).

---

## Project layout

```
src/
  server.js        Express app + routes (/voice, /gather, /status)
  claude.js        System prompt + Claude call + robust JSON parsing
  handbook.js      Loads handbook/HANDBOOK.md
  conversation.js  In-memory per-call session store (keyed by CallSid)
  sheets.js        Append a row to the Google Sheet
  sms.js           Send the urgent SMS alert
  twiml.js         TwiML helpers (Gather / Say / Hangup)
handbook/
  HANDBOOK.md      ⚠️ Placeholder + dummy test content — replace with the real handbook
scripts/
  simulate.js      Local end-to-end simulation (no Twilio needed)
```

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

Fill in `.env`. See comments in `.env.example` for every value.

### 2. Anthropic

Set `ANTHROPIC_API_KEY`. Model defaults to `claude-sonnet-4-6` (override with
`CLAUDE_MODEL`).

### 3. Google Sheets

1. In Google Cloud, create a **service account** and download its JSON key.
2. Point `GOOGLE_APPLICATION_CREDENTIALS` at that file (e.g. `./service-account.json` —
   it is git-ignored).
3. Create a Sheet, put the column headers above in row 1, and **share the Sheet with
   the service account's `client_email`** (Editor).
4. Set `GOOGLE_SHEET_ID` (the long id from the Sheet URL) and, if needed,
   `GOOGLE_SHEET_RANGE` (default `Sheet1!A:I`).

### 4. Twilio

1. Buy/choose a Twilio phone number and set `TWILIO_PHONE_NUMBER`.
2. Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. Set `OWNER_PHONE_NUMBER` (where urgent SMS alerts go).
4. Point the number's **Voice webhook** at `POST https://<your-host>/voice`, and
   (optionally) its **status callback** at `POST https://<your-host>/status`.
5. Forward the business's existing line to the Twilio number.

For local development, expose your server with a tunnel (e.g. `ngrok http 3000`) and use
that HTTPS URL for the webhooks and for `PUBLIC_BASE_URL`.

### 5. Run

```bash
npm start        # production
npm run dev      # auto-restart on file changes
```

---

## Testing without a phone

`scripts/simulate.js` runs the entire conversation + branching + logging pipeline
against the **real Claude model**, with Google Sheets and SMS **mocked** (`DRY_RUN`).
It only needs `ANTHROPIC_API_KEY`.

```bash
npm run simulate
```

It runs three scripted callers — an **urgent** emergency (asserts SMS + Sheet fire), an
**appointment** booking, and a **routine** question (assert Sheet only) — printing each
turn's spoken reply and parsed JSON, then a PASS/CHECK summary.

You can also hit the TwiML endpoints directly to verify the XML and silence handling:

```bash
curl -s -X POST localhost:3000/voice \
  -d 'CallSid=TESTCALL1&From=%2B15551110001'

curl -s -X POST localhost:3000/gather \
  -d 'CallSid=TESTCALL1&From=%2B15551110001&SpeechResult=There+is+a+burning+smell+from+my+panel'
```

(Set `VALIDATE_TWILIO_SIGNATURE=false` for local curl testing; keep it `true` in
production so only genuine Twilio requests are accepted.)

---

## Notes & hardening

- **Secrets** live only in `.env` / the service-account JSON (both git-ignored). Nothing
  is hardcoded.
- **Unclear speech** is never guessed — Claude re-prompts; after `MAX_REPROMPTS`
  consecutive silences the call ends politely. `MAX_TURNS` caps runaway calls.
- **Guaranteed-structure option:** Claude is currently prompted to emit JSON, parsed
  defensively in `src/claude.js`. For even stricter output you can switch to a forced
  single tool (`tool_choice` → a `submit_response` tool) — tool use is fully supported on
  `claude-sonnet-4-6`.
- **Scaling:** conversation state is in-memory (keyed by `CallSid`). For multiple server
  instances, back `src/conversation.js` with Redis using the same get/append/end surface.
