/**
 * Local simulation harness — exercises the full conversation + branching +
 * logging logic WITHOUT Twilio. Speaks scripted caller turns to the real Claude
 * model, prints each turn's parsed JSON and spoken reply, and runs the same
 * finalize path (Sheets + SMS) the server uses, mocked via DRY_RUN.
 *
 * Requires only ANTHROPIC_API_KEY. Google/Twilio creds are NOT needed.
 * Run:  node scripts/simulate.js
 */
import 'dotenv/config';

// Force mocks on for local simulation regardless of .env.
process.env.DRY_RUN = 'true';

const { getClaudeReply } = await import('../src/claude.js');
const { appendCallLog } = await import('../src/sheets.js');
const { sendUrgentAlert } = await import('../src/sms.js');

const SCENARIOS = [
  {
    name: 'URGENT — burning smell / sparking (expect SMS + Sheet)',
    callerNumber: '+15551110001',
    expectCategory: 'urgent',
    turns: [
      "Hi, I'm really worried — there's a burning smell coming from my electrical panel and I saw a spark.",
      "My name is Dana Reyes and you can reach me at 555-111-0001.",
      "The address is 42 Oak Street. Please hurry.",
    ],
  },
  {
    name: 'APPOINTMENT — book a ceiling fan install (expect Sheet only)',
    callerNumber: '+15552220002',
    expectCategory: 'appointment',
    turns: [
      "Hi, I'd like to schedule someone to install two ceiling fans.",
      "This is Chris Patel, my number is 555-222-0002, at 9 Pine Avenue.",
      "Sometime next Tuesday afternoon would be great.",
      "That's all, thanks!",
    ],
  },
  {
    name: 'ROUTINE — general question (expect Sheet only)',
    callerNumber: '+15553330003',
    expectCategory: 'routine',
    turns: [
      "Hi, do you all do EV charger installations, and roughly what does it cost?",
      "Okay. This is Jordan Lee, 555-333-0003. No need to book yet, just wanted info.",
      "Thanks, that's everything.",
    ],
  },
];

function line(char = '─') {
  return char.repeat(72);
}

async function runScenario(scn) {
  console.log('\n' + line('='));
  console.log(`SCENARIO: ${scn.name}`);
  console.log(line('='));

  const messages = [];
  let lastResult = null;

  for (const utterance of scn.turns) {
    console.log(`\n📞 Caller: ${utterance}`);
    messages.push({ role: 'user', content: utterance });

    const result = await getClaudeReply(messages);
    lastResult = result;
    messages.push({ role: 'assistant', content: result.spoken_reply });

    console.log(`🤖 Reply : ${result.spoken_reply}`);
    console.log(
      `   ↳ category=${result.category} complete=${result.call_complete} ` +
        `name="${result.caller_name}" number="${result.callback_number}" ` +
        `addr="${result.address}" time="${result.preferred_time}"`,
    );

    if (result.call_complete) break;
  }

  // Finalize exactly like the server does.
  const meta = { callerNumber: scn.callerNumber };
  console.log('\n' + line());
  console.log('FINALIZE:');
  const row = await appendCallLog(lastResult, meta);
  let smsFired = false;
  if (lastResult.category === 'urgent') {
    await sendUrgentAlert(lastResult, meta);
    smsFired = true;
  }

  // Lightweight assertions.
  const ok =
    lastResult.category === scn.expectCategory &&
    (scn.expectCategory === 'urgent' ? smsFired : !smsFired);
  console.log(
    `RESULT: category=${lastResult.category} (expected ${scn.expectCategory}), ` +
      `sms=${smsFired} → ${ok ? '✅ PASS' : '❌ CHECK'}`,
  );
  return ok;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to .env before running the simulation.');
    process.exit(1);
  }
  console.log('Running Enterprise Electric receptionist simulation (DRY_RUN — no calls/SMS sent).');

  let allOk = true;
  for (const scn of SCENARIOS) {
    const ok = await runScenario(scn);
    allOk = allOk && ok;
  }

  console.log('\n' + line('='));
  console.log(allOk ? 'ALL SCENARIOS PASSED ✅' : 'SOME SCENARIOS NEED REVIEW ❌');
  console.log(line('='));
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
