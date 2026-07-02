import Anthropic from '@anthropic-ai/sdk';
import { loadHandbook } from './handbook.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const VALID_CATEGORIES = ['urgent', 'appointment', 'routine', 'in_progress'];

/**
 * Build the system prompt: business handbook + strict response-format and
 * behavior rules. Claude must reply with a single JSON object (no prose around
 * it) that the backend parses to drive call flow.
 */
export function buildSystemPrompt() {
  const handbook = loadHandbook();

  return `You are the friendly AI phone receptionist for Enterprise Electric Inc.
You are speaking with a caller over the phone. Everything in your "spoken_reply"
is read aloud to them by a text-to-speech voice, so keep it natural, warm, brief,
and easy to hear — no markdown, no lists, no special characters, one or two short
sentences per turn.

Follow the business handbook below as your source of truth. Do not invent services,
prices, hours, or policies that are not in the handbook.

================= BUSINESS HANDBOOK =================
${handbook}
====================================================

YOUR JOB EACH TURN:
1. Continue a natural conversation to understand why the caller is calling.
2. Gather, as needed: the caller's name, a callback phone number, the service
   address, a short description of the issue/request, and (for bookings) their
   preferred day/time.
3. Classify the call for the back office.

CLASSIFICATION RULES:
- "urgent": a safety emergency per the handbook's emergency definition.
- "appointment": the caller wants to book/schedule work or a visit.
- "routine": a general question, message, or non-urgent request.
- "in_progress": you still need more info before you can finalize a category.
  Use this while you are still asking clarifying questions.

BEHAVIOR RULES:
- Never promise a live transfer or an exact callback time unless the handbook
  explicitly allows it. Say the team will call them back (ASAP for emergencies,
  during business hours for routine matters).
- If the caller's words are empty, garbled, or unclear, do NOT guess — set
  category "in_progress" and politely ask them to repeat.
- For a clear emergency, be calm and reassuring, gather the callback number and
  address quickly, and set category "urgent".
- Once you have enough info and the caller is done, set "call_complete": true and
  give a brief, warm closing in "spoken_reply".
- Keep collecting info across turns; only finalize the category once you are sure.

RESPOND WITH EXACTLY ONE JSON OBJECT AND NOTHING ELSE. No preamble, no code
fences, no text before or after. The object must have these keys:
{
  "spoken_reply": "what to say to the caller (spoken aloud)",
  "category": "urgent" | "appointment" | "routine" | "in_progress",
  "summary": "brief description of the issue/request so far",
  "caller_name": "",
  "callback_number": "",
  "address": "",
  "preferred_time": "",
  "call_complete": true | false
}
Leave string fields as "" when unknown. Never include keys other than these.`;
}

/**
 * Extract the first balanced top-level JSON object from a text blob.
 * Claude is instructed to return only JSON, but this tolerates stray text.
 */
function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Coerce/validate the parsed object into a safe, fully-shaped result. */
function normalize(obj) {
  const category = VALID_CATEGORIES.includes(obj.category) ? obj.category : 'in_progress';
  return {
    spoken_reply: String(obj.spoken_reply || '').trim(),
    category,
    summary: String(obj.summary || '').trim(),
    caller_name: String(obj.caller_name || '').trim(),
    callback_number: String(obj.callback_number || '').trim(),
    address: String(obj.address || '').trim(),
    preferred_time: String(obj.preferred_time || '').trim(),
    call_complete: obj.call_complete === true,
  };
}

/**
 * Call Claude with the conversation history and return a normalized result.
 * `messages` is an array of { role: 'user'|'assistant', content: string }.
 * On any failure, returns a safe reprompt result rather than throwing.
 */
export async function getClaudeReply(messages) {
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' }, // latency matters on a live call
      system: buildSystemPrompt(),
      messages,
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonStr = extractJsonObject(text);
    if (!jsonStr) throw new Error(`No JSON found in Claude reply: ${text.slice(0, 200)}`);

    const parsed = JSON.parse(jsonStr);
    const result = normalize(parsed);
    if (!result.spoken_reply) {
      result.spoken_reply = "Sorry, I didn't quite catch that. Could you say it again?";
    }
    return result;
  } catch (err) {
    console.error('Claude call/parse failed:', err.message);
    return {
      spoken_reply:
        "I'm sorry, I'm having a little trouble hearing you. Could you please repeat that?",
      category: 'in_progress',
      summary: '',
      caller_name: '',
      callback_number: '',
      address: '',
      preferred_time: '',
      call_complete: false,
    };
  }
}
