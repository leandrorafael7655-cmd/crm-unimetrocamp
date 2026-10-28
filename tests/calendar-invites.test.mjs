import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/send-calendar-invites/email-meetings.ts',import.meta.url),'utf8').replace(/^export /gm,''));
const context=vm.createContext({Intl,Date,TextEncoder});vm.runInContext(code,context);
const cfg={from:'sender@example.invalid',organizer:'sender@example.invalid'};
const job={id:'job',created_at:'2026-10-28T12:00:00Z',operation:'REQUEST',event_sequence:1,payload:{event_uid:'event-1@uniconecta',organizer:cfg.organizer,recipient:{name:'Teste',email:'test@example.invalid'},attendees:[{name:'Teste',email:'test@example.invalid'}],title:'Teste',description:'Fictício',start_at:'2026-10-29T12:00:00Z',end_at:'2026-10-29T13:00:00Z'}};
const build=(value)=>{context.job=value;context.cfg=cfg;return vm.runInContext('meetingEmail(job,cfg)',context)};
test('Vercel message uses REQUEST, recipient acceptance and São Paulo timezone',()=>{
 const m=build(job); assert.equal(m.to.address,'test@example.invalid');assert.match(m.icalEvent.content,/METHOD:REQUEST/);assert.match(m.icalEvent.content,/DTSTART;TZID=America\/Sao_Paulo:20261029T090000/);assert.match(m.icalEvent.content,/RSVP=TRUE/);
});
test('reschedule and cancel retain UID and increment sequence',()=>{
 const m=build({...job,operation:'CANCEL',event_sequence:2});assert.match(m.icalEvent.content,/UID:event-1@uniconecta/);assert.match(m.icalEvent.content,/METHOD:CANCEL/);assert.match(m.icalEvent.content,/SEQUENCE:2/);
});
test('date-only follow-ups use a transparent all-day event',()=>{
 const m=build({...job,payload:{...job.payload,all_day:true,start_at:'2026-10-29T03:00:00Z',end_at:'2026-10-30T03:00:00Z'}});assert.match(m.icalEvent.content,/DTSTART;VALUE=DATE:20261029/);assert.match(m.icalEvent.content,/TRANSP:TRANSPARENT/);
});
test('retired Supabase sender cannot become a parallel consumer',()=>{
 const source=readFileSync(new URL('../supabase/functions/send-calendar-invites/index.ts',import.meta.url),'utf8');assert.match(source,/status: 410/);assert.doesNotMatch(source,/sendMail|createTransport|CALENDAR_SMTP_PASS/);
});
