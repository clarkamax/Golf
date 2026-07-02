/**
 * In-memory per-call conversation store, keyed by Twilio CallSid.
 * Fine for a single server instance. For multi-instance / horizontal scaling,
 * back this with Redis (same get/append/end surface).
 */

const SESSION_TTL_MS = 15 * 60 * 1000; // sweep sessions idle > 15 min
const sessions = new Map();

function now() {
  return Date.now();
}

/** Get an existing session or create a fresh one. */
export function getSession(callSid, meta = {}) {
  let s = sessions.get(callSid);
  if (!s) {
    s = {
      callSid,
      callerNumber: meta.callerNumber || '',
      messages: [], // { role, content }
      turns: 0, // caller utterances processed
      reprompts: 0, // consecutive silences/unclear
      lastResult: null, // last normalized Claude result
      logged: false, // guard against double-logging
      createdAt: now(),
      updatedAt: now(),
    };
    sessions.set(callSid, s);
  }
  s.updatedAt = now();
  return s;
}

export function addUserMessage(session, text) {
  session.messages.push({ role: 'user', content: text });
  session.turns += 1;
  session.updatedAt = now();
}

export function addAssistantMessage(session, text) {
  session.messages.push({ role: 'assistant', content: text });
  session.updatedAt = now();
}

export function endSession(callSid) {
  sessions.delete(callSid);
}

export function hasSession(callSid) {
  return sessions.has(callSid);
}

/** Remove sessions that have been idle longer than the TTL. */
export function sweep() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [sid, s] of sessions) {
    if (s.updatedAt < cutoff) sessions.delete(sid);
  }
}

// Periodic cleanup (unref so it never keeps the process alive).
const timer = setInterval(sweep, 5 * 60 * 1000);
if (timer.unref) timer.unref();
