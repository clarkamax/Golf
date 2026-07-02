import twilio from 'twilio';

const { VoiceResponse } = twilio.twiml;

const VOICE = process.env.TTS_VOICE || 'Polly.Joanna-Neural';

/**
 * Speak a line, then listen for the caller's next utterance via <Gather>.
 * Twilio POSTs the transcribed speech to `action` (default /gather).
 */
export function gatherResponse(text, { action = '/gather' } = {}) {
  const vr = new VoiceResponse();
  const gather = vr.gather({
    input: ['speech'],
    action,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    actionOnEmptyResult: true, // still POST when the caller says nothing
  });
  gather.say({ voice: VOICE }, text);
  return vr.toString();
}

/** Speak a final line and hang up. */
export function sayAndHangup(text) {
  const vr = new VoiceResponse();
  vr.say({ voice: VOICE }, text);
  vr.hangup();
  return vr.toString();
}

/** Re-prompt after silence/unclear speech, then keep listening. */
export function reprompt(text, opts) {
  return gatherResponse(text, opts);
}
