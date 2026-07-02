import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';

import { getClaudeReply } from './claude.js';
import {
  getSession,
  addUserMessage,
  addAssistantMessage,
  endSession,
  hasSession,
} from './conversation.js';
import { appendCallLog } from './sheets.js';
import { sendUrgentAlert } from './sms.js';
import { gatherResponse, sayAndHangup } from './twiml.js';

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '20', 10);
const MAX_REPROMPTS = parseInt(process.env.MAX_REPROMPTS || '2', 10);
const VALIDATE_SIG =
  process.env.VALIDATE_TWILIO_SIGNATURE === 'true' ||
  process.env.VALIDATE_TWILIO_SIGNATURE === '1';

const GREETING =
  'Thank you for calling Enterprise Electric. This is the automated assistant. How can I help you today?';
const CLOSING_FALLBACK =
  'Thanks for calling Enterprise Electric. Someone from our team will follow up with you. Goodbye.';

// --- Optional Twilio signature validation -------------------------------
// Requires PUBLIC_BASE_URL so the signed URL matches what Twilio used.
function twilioSignature(req, res, next) {
  if (!VALIDATE_SIG) return next();
  const signature = req.header('X-Twilio-Signature');
  const url = `${process.env.PUBLIC_BASE_URL || ''}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body,
  );
  if (!valid) {
    console.warn('Rejected request with invalid Twilio signature:', req.originalUrl);
    return res.status(403).send('Invalid Twilio signature');
  }
  return next();
}

function sendTwiml(res, xml) {
  res.type('text/xml').send(xml);
}

// --- Finalize a call: log to Sheet, alert on urgent ---------------------
async function finalizeCall(session) {
  if (session.logged) return;
  session.logged = true;

  // Use the last known Claude result; fall back to a routine stub if none.
  const result =
    session.lastResult || {
      category: 'routine',
      summary: session.messages.length ? 'Call ended before classification.' : 'Empty call.',
      caller_name: '',
      callback_number: '',
      address: '',
      preferred_time: '',
    };
  const meta = { callerNumber: session.callerNumber };

  try {
    await appendCallLog(result, meta);
  } catch (err) {
    console.error('Failed to append call log:', err.message);
  }

  if (result.category === 'urgent') {
    try {
      await sendUrgentAlert(result, meta);
    } catch (err) {
      console.error('Failed to send urgent SMS:', err.message);
    }
  }
}

// --- Health check --------------------------------------------------------
app.get('/', (_req, res) => res.send('Enterprise Electric receptionist is running.'));

// --- Incoming call: greet and start listening ---------------------------
app.post('/voice', twilioSignature, (req, res) => {
  const callSid = req.body.CallSid || `local-${Date.now()}`;
  const session = getSession(callSid, { callerNumber: req.body.From || '' });
  session.callerNumber = req.body.From || session.callerNumber;
  sendTwiml(res, gatherResponse(GREETING));
});

// --- Each caller utterance ----------------------------------------------
app.post('/gather', twilioSignature, async (req, res) => {
  const callSid = req.body.CallSid || `local-${Date.now()}`;
  const session = getSession(callSid, { callerNumber: req.body.From || '' });
  const speech = (req.body.SpeechResult || '').trim();

  // Silence / unclear: re-prompt up to MAX_REPROMPTS, then wrap up politely.
  if (!speech) {
    session.reprompts += 1;
    if (session.reprompts > MAX_REPROMPTS) {
      await finalizeCall(session);
      endSession(callSid);
      return sendTwiml(res, sayAndHangup(CLOSING_FALLBACK));
    }
    return sendTwiml(
      res,
      gatherResponse("Sorry, I didn't catch that. Could you please tell me how I can help?"),
    );
  }
  session.reprompts = 0;

  // Hard cap on runaway calls.
  if (session.turns >= MAX_TURNS) {
    await finalizeCall(session);
    endSession(callSid);
    return sendTwiml(res, sayAndHangup(CLOSING_FALLBACK));
  }

  addUserMessage(session, speech);
  const result = await getClaudeReply(session.messages);
  session.lastResult = result;
  addAssistantMessage(session, result.spoken_reply);

  if (result.call_complete) {
    await finalizeCall(session);
    endSession(callSid);
    return sendTwiml(res, sayAndHangup(result.spoken_reply));
  }

  return sendTwiml(res, gatherResponse(result.spoken_reply));
});

// --- Twilio status callback: catch hangups / completion -----------------
app.post('/status', twilioSignature, async (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  if (callSid && hasSession(callSid) && ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status)) {
    const session = getSession(callSid);
    await finalizeCall(session); // log partial call if caller hung up mid-conversation
    endSession(callSid);
  }
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`Enterprise Electric receptionist listening on port ${PORT}`);
  if (process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1') {
    console.log('DRY_RUN enabled — Google Sheets and SMS are mocked.');
  }
});

export default app;
