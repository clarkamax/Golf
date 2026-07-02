import twilio from 'twilio';

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

let smsClient = null;
function getClient() {
  if (!smsClient) {
    smsClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return smsClient;
}

/**
 * Send the urgent-call SMS alert to the business owner.
 * Format per spec:
 *   "URGENT call from Enterprise Electric line: [name], [number] — [summary]. Logged in sheet."
 * In DRY_RUN mode, logs the message instead of sending it.
 */
export async function sendUrgentAlert(result, meta = {}) {
  const name = result.caller_name || 'Unknown caller';
  const number = result.callback_number || meta.callerNumber || 'no number';
  const summary = result.summary || 'No details captured';
  const body = `URGENT call from Enterprise Electric line: ${name}, ${number} — ${summary}. Logged in sheet.`;

  if (DRY_RUN) {
    console.log(`[DRY_RUN] SMS to ${process.env.OWNER_PHONE_NUMBER || '(owner)'}: ${body}`);
    return { body, dryRun: true };
  }

  const message = await getClient().messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.OWNER_PHONE_NUMBER,
  });
  return { body, sid: message.sid };
}
