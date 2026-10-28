type Person = { name?: string; email: string; role?: string };
const emailValid = (value: unknown): value is string => typeof value === "string" &&
  /^[^\s@<>:;,"\\]+@[^\s@<>:;,"\\]+\.[^\s@<>:;,"\\]+$/.test(value);
const textValue = (value: unknown) => String(value ?? "").replace(/\\/g, "\\\\")
  .replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const parameter = (value: unknown) => `"${String(value ?? "").replace(/\^/g, "^^")
  .replace(/\r\n|\r|\n/g, "^n").replace(/"/g, "^'")}"`;
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const localStamp = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
};

// RFC 5545: fold by UTF-8 octets, not JavaScript character count.
function fold(line: string) {
  const encoder = new TextEncoder();
  let result = "", size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) { result += "\r\n "; size = 1; }
    result += character; size += bytes;
  }
  return result;
}

export function meetingEmail(job: any, config: { from: string; organizer: string }) {
  const p = job.payload;
  if (!p || !emailValid(p.recipient?.email) || !emailValid(p.organizer) ||
    p.organizer.toLowerCase() !== config.organizer.toLowerCase())
    throw new Error("Confira o remetente original e o destinatário do convite.");
  if (!Array.isArray(p.attendees) || !p.attendees.length || p.attendees.length > 102 ||
    p.attendees.some((person: Person) => !emailValid(person.email) || person.email.toLowerCase() === p.organizer.toLowerCase()))
    throw new Error("Use um remetente central diferente dos participantes.");
  if (!p.attendees.some((person: Person) => person.email === p.recipient.email))
    throw new Error("Destinatário não consta no convite.");
  if (!["REQUEST", "CANCEL"].includes(job.operation) || !/^[a-z0-9-]+@uniconecta$/i.test(p.event_uid))
    throw new Error("Identidade do convite inválida.");
  const lines = [
    "BEGIN:VCALENDAR", "PRODID:-//UniConecta//Agenda Comercial//PT-BR", "VERSION:2.0",
    "CALSCALE:GREGORIAN", `METHOD:${job.operation}`,
    "BEGIN:VTIMEZONE", "TZID:America/Sao_Paulo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:BRT", "END:STANDARD", "END:VTIMEZONE", "BEGIN:VEVENT",
    `UID:${p.event_uid}`, `DTSTAMP:${stamp(job.created_at)}`, `SEQUENCE:${Number(job.event_sequence)}`,
    p.all_day ? `DTSTART;VALUE=DATE:${localStamp(p.start_at).slice(0,8)}` : `DTSTART;TZID=America/Sao_Paulo:${localStamp(p.start_at)}`,
    p.all_day ? `DTEND;VALUE=DATE:${localStamp(p.end_at).slice(0,8)}` : `DTEND;TZID=America/Sao_Paulo:${localStamp(p.end_at)}`,
    `SUMMARY:${textValue(p.title)}`, `DESCRIPTION:${textValue(p.description)}`,
    ...(p.location ? [`LOCATION:${textValue(p.location)}`] : []),
    `ORGANIZER;CN="UniConecta":mailto:${p.organizer}`,
    ...p.attendees.map((person: Person) => `ATTENDEE;CN=${parameter(person.name || person.email)};ROLE=${person.role === "OPT-PARTICIPANT" ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT"};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${person.email}`),
    job.operation === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    p.all_day ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR",
  ];
  return {
    from: { name: "UniConecta", address: config.from },
    to: { name: p.recipient.name || p.recipient.email, address: p.recipient.email },
    replyTo: p.organizer,
    messageId: `<${job.id}@uniconecta>`,
    subject: job.operation === "CANCEL" ? `Cancelado: ${p.title}` : p.title,
    text: `${p.title}\n\n${p.description || ""}\n\n${p.location || ""}`,
    icalEvent: { filename: "uniconecta.ics", method: job.operation, content: lines.map(fold).join("\r\n") + "\r\n" },
  };
}
