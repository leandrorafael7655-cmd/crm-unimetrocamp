import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../supabase/functions/send-calendar-invites/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const code = stripTypeScriptTypes(source);
const smtp = { CALENDAR_SMTP_HOST: 'smtp.example.com', CALENDAR_SMTP_USER: 'test-user', CALENDAR_SMTP_PASS: 'fake-test-credential', CALENDAR_FROM_EMAIL: 'agenda@example.com' };
function runtime(settings = {}, accepted = true) {
  let handler, transportOptions;
  const messages = [], updates = [];
  const event = { id: 'event-1', event_uid: 'stable-event@example.com', sequence: 0, status: 'active', recipient_user_id: 'user-1', title: 'Teste de agenda', start_at: '2026-10-26T12:00:00Z', end_at: '2026-10-26T13:00:00Z' };
  const recipient = { id: 'user-1', email: 'recipient@example.com', full_name: 'Consultor Teste', active: true };
  const job = { id: 'job-1', calendar_event_id: event.id, operation: 'REQUEST', event_sequence: 0, attempts: 0 };
  const auth = {
    admin: { listUsers: async () => (settings.__adminProbeOk ? { data: { users: [] }, error: null } : { data: null, error: { message: 'not admin' } }) },
    getUser: async () => ({ data: { user: null }, error: { message: 'invalid' } }),
  };
  const client = { auth, from(table) {
    let patch;
    const chain = {
      select() { return chain; }, in() { return chain; }, eq() { return chain; }, or() { return chain; }, order() { return chain; }, limit() { return chain; }, single() { return chain; },
      update(value) { patch = value; updates.push(value); return chain; },
      then(resolve, reject) { return Promise.resolve({ error: null, data: table === 'calendar_events' ? event : table === 'profiles' ? recipient : patch ? [{ id: job.id }] : [job] }).then(resolve, reject); },
    }; return chain;
  } };
  const values = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key', ...settings };
  const context = vm.createContext({
    Deno: { env: { get: key => values[key] }, serve: fn => { handler = fn; } },
    createClient: () => client,
    nodemailer: { createTransport(options) { transportOptions = options; return { verify: async () => true, sendMail: async message => { messages.push(message); return { accepted: accepted ? [recipient.email] : [], messageId: 'test-message' }; } }; } },
    Response, Request, URLSearchParams, Intl, Date, atob,
    fetch: () => { throw new Error('Unexpected Microsoft OAuth/network request'); },
  });
  vm.runInContext(code, context);
  return { context, event, recipient, messages, updates, options: () => transportOptions, invoke: (body, token = 'test-key') => handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })) };
}
test('new installation asks for SMTP credentials, not Microsoft administration', () => {
  const r = runtime();
  const s = vm.runInContext('configurationStatus()', r.context);
  assert.equal(s.configured, false);
  assert.deepEqual(Array.from(s.missing).sort(), Object.keys(smtp).sort());
});
test('SMTP config needs no OAuth and organizer defaults to sender', () => {
  const r = runtime(smtp);
  assert.equal(vm.runInContext('configurationStatus().configured', r.context), true);
  assert.equal(vm.runInContext('requiredConfig().organizer', r.context), smtp.CALENDAR_FROM_EMAIL);
});
test('legacy OAuth setup retains its provider', () => {
  const r = runtime({ CALENDAR_OAUTH_CLIENT_ID: 'existing-app' });
  assert.equal(vm.runInContext('requiredConfig().provider', r.context), 'microsoft365-smtp-oauth2');
});
test('unknown provider, bad port and malformed sender are rejected', () => {
  for (const extra of [{ CALENDAR_EMAIL_PROVIDER: 'unknown' }, { CALENDAR_SMTP_PORT: 'bad' }, { CALENDAR_FROM_EMAIL: 'invalid' }]) {
    assert.equal(vm.runInContext('configurationStatus().configured', runtime({ ...smtp, ...extra }).context), false);
  }
});
test('status does not send email or expose secrets', async () => {
  const r = runtime(smtp);
  const response = await (await r.invoke({ action: 'status' })).json();
  assert.equal(response.provider, 'smtp');
  assert.equal(response.configured, true);
  assert.equal(JSON.stringify(response).includes(smtp.CALENDAR_SMTP_PASS), false);
  assert.equal(r.messages.length, 0);
});
test('missing settings keep queue untouched', async () => {
  const r = runtime();
  assert.equal((await r.invoke({ action: 'process' })).status, 503);
  assert.equal(r.updates.length, 0);
  assert.equal(r.messages.length, 0);
});
test('SMTP sends meeting request, retains recipient acceptance and records provider acknowledgment', async () => {
  const r = runtime(smtp);
  const result = await (await r.invoke({ action: 'process' })).json();
  assert.equal(result.sent, 1);
  assert.equal(r.options().auth.pass, smtp.CALENDAR_SMTP_PASS);
  assert.equal(r.options().requireTLS, true);
  assert.match(r.messages[0].icalEvent.content, /PARTSTAT=NEEDS-ACTION;RSVP=TRUE/);
  assert.match(r.messages[0].icalEvent.content, /DTSTART;TZID=America\/Sao_Paulo:20261026T090000/);
  assert.equal(r.updates.at(-1).status, 'sent_provider');
  assert.equal(r.updates.at(-1).provider, 'smtp');
});
test('server rejection is recorded as failure, not successful delivery', async () => {
  const r = runtime(smtp, false);
  const result = await (await r.invoke({ action: 'process' })).json();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(r.updates.at(-1).status, 'failed');
});
test('465 uses implicit TLS', async () => {
  const r = runtime({ ...smtp, CALENDAR_SMTP_PORT: '465' });
  await r.invoke({ action: 'process' });
  assert.equal(r.options().secure, true);
});
test('updates and cancellations retain event identity', () => {
  const r = runtime(smtp);
  r.context.testEvent = r.event;
  r.context.testRecipient = r.recipient;
  const request = vm.runInContext('buildIcs(testEvent, testRecipient, "REQUEST", "agenda@example.com", "https://example.com")', r.context);
  r.event.sequence = 1;
  const cancel = vm.runInContext('buildIcs(testEvent, testRecipient, "CANCEL", "agenda@example.com", "https://example.com")', r.context);
  assert.match(request, /UID:stable-event@example.com/);
  assert.match(cancel, /UID:stable-event@example.com/);
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /SEQUENCE:1/);
});

const fakeJwt = (payload) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
test('system caller with a service_role JWT different from the injected key is accepted after admin probe', async () => {
  const r = runtime({ ...smtp, __adminProbeOk: true });
  const response = await r.invoke({ action: 'status' }, fakeJwt({ role: 'service_role' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configured, true);
});
test('forged service_role claim without admin privilege is rejected', async () => {
  const r = runtime({ ...smtp, __adminProbeOk: false });
  const response = await r.invoke({ action: 'process' }, fakeJwt({ role: 'service_role' }));
  assert.equal(response.status, 401);
  assert.equal(r.messages.length, 0);
});
test('new-format secret key is accepted as system caller', async () => {
  const r = runtime({ ...smtp, SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test' }) });
  const response = await r.invoke({ action: 'status' }, 'sb_secret_test');
  assert.equal(response.status, 200);
});
