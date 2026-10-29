import { addDays, mondayOf, weekdayOf, timeToMinutes, type GeneratedOccurrence, type AttendanceSettings, type AttendanceIssue } from "./attendance"
import { isCivilDate, validateSchedule } from "./validation"

type Interval = [number,number]
function segments(o: GeneratedOccurrence): Interval[] {
  if (validateSchedule(o.date,o.startTime,o.endTime,true)) return []
  const start=timeToMinutes(o.startTime), end=timeToMinutes(o.endTime)
  if (o.breakStart && o.breakEnd) return [[start,timeToMinutes(o.breakStart)],[timeToMinutes(o.breakEnd),end]].filter(x=>x[1]>x[0]) as Interval[]
  return [[start,end]]
}
function union(list: Interval[]): Interval[] {
  const result: Interval[]=[]
  for (const item of [...list].sort((a,b)=>a[0]-b[0])) {
    const last=result.at(-1)
    if (last && item[0]<=last[1]) last[1]=Math.max(last[1],item[1])
    else result.push([...item])
  }
  return result
}
export function planningCapacity(people: number, pauseForGdc=false) {
  const weeklyMinutes=people*42*60
  const smMinutes=(55-(pauseForGdc?1:0))*60*3+4*60*2
  const gdcMinutes=people*60
  return { people, weeklyHours:weeklyMinutes/60, smHours:smMinutes/60, gdcHours:gdcMinutes/60,
    remainingHours:(weeklyMinutes-smMinutes-gdcMinutes)/60,
    gdcCoverageWithoutBackup:0, feasibleInAggregate:weeklyMinutes>=smMinutes+gdcMinutes }
}
/** Net work is a union of intervals: lunch is excluded and overlapping activities never inflate hours. */
export function inspectAttendancePlan(input: {
  occurrences: GeneratedOccurrence[]; settings: AttendanceSettings;
  people: {id:string;name:string}[]; from:string; to:string; closedDates?:string[];
}) {
  const {settings,people,from,to}=input
  const issues: AttendanceIssue[]=[]
  const weekly: {userId:string;name:string;week:string;minutes:number;adjustmentMinutes:number}[]=[]
  const active=input.occurrences.filter(o=>o.status!=="cancelled")
  if (!isCivilDate(from) || !isCivilDate(to) || to<from || to>addDays(from,366)) {
    const invalidIssues:AttendanceIssue[]=[{severity:"error",code:"invalid_period",message:"Informe um período válido de até um ano."}]
    return {issues:invalidIssues,weekly,capacity:planningCapacity(people.length)}
  }
  const issue=(code:string,message:string,date?:string)=>issues.push({severity:"error",code,message,date})
  if (!settings.gdcStart || settings.gdcCoverageMode==="pending" || !settings.gdcCoverageMode) {
    issue("gdc_pending","Defina o horário do GDC de segunda-feira e aprove pausa de 1h da SM ou cobertura por equipe externa à reunião. Todos no GDC deixam zero participantes disponíveis na SM.")
  }
  if (settings.gdcStart && (validateSchedule("2026-10-26",settings.gdcStart,"20:00",true) || settings.gdcStart<"09:00" || settings.gdcStart>"19:00")) issue("gdc_time","GDC de 1h deve começar entre 9h e 19h.")
  if (settings.gdcCoverageMode==="backup") issue("gdc_external_coverage","A cobertura por equipe externa ao GDC exige definição e validação operacional antes da publicação; os participantes da reunião não cobrem a SM.")
  for (const o of active) {
    const invalid=validateSchedule(o.date,o.startTime,o.endTime,true)
    if (invalid) issue("invalid_interval",`${o.responsibleName}: ${invalid}`,o.date)
    if (!o.userId || !people.some(p=>p.id===o.userId)) issue("unassigned_or_unreviewed",`${o.responsibleName || "Posição"}: responsável sem vínculo ou fora da equipe revisada.`,o.date)
    if (o.breakStart || o.breakEnd) {
      if (!o.breakStart || !o.breakEnd || o.breakStart<o.startTime || o.breakEnd>o.endTime || timeToMinutes(o.breakEnd)-timeToMinutes(o.breakStart)!==60) issue("lunch_invalid",`${o.responsibleName}: o almoço deve ter 1h, fora das atividades e dentro do período.`,o.date)
    }
  }
  for(let date=from; date<=to; date=addDays(date,1)) {
    const day=weekdayOf(date)
    const closed=day===0 || input.closedDates?.includes(date)
    const rows=active.filter(o=>o.date===date)
    const start=timeToMinutes(day===6?settings.saturdayStart:settings.weekdayRoomOpen)
    const end=timeToMinutes(day===6?settings.saturdayEnd:settings.weekdayRoomClose)
    const minimum=day===6?(settings.minSaturdayCoverage??2):Math.max(3,settings.minRoomCoverage)
    for(let minute=start;!closed && minute<end;minute++) {
      if(day===1 && settings.gdcCoverageMode==="pause" && settings.gdcStart && minute>=timeToMinutes(settings.gdcStart) && minute<timeToMinutes(settings.gdcStart)+60) continue
      const present=new Set(rows.filter(o=>o.activity==="room" && o.userId && segments(o).some(([a,b])=>a<=minute&&minute<b)).map(o=>o.userId))
      if(present.size<minimum) {issue("room_coverage",`SM: ${present.size}/${minimum} pessoas em ${date} às ${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}.`,date);break}
    }
    for(const person of people) {
      const own=rows.filter(o=>o.userId===person.id)
      const raw=own.flatMap(segments), merged=union(raw)
      const total=merged.reduce((sum,[a,b])=>sum+b-a,0)
      if(raw.reduce((sum,[a,b])=>sum+b-a,0)>total) issue("person_overlap",`${person.name}: atividades simultâneas; ajuste os blocos antes de publicar.`,date)
      if(total>360 && merged.length && !merged.slice(1).some(([a],i)=>a-merged[i][1]>=60)) issue("lunch_missing",`${person.name}: falta intervalo de almoço de 1h.`,date)
      if(!closed && day===1 && settings.gdcStart && !own.some(o=>o.activity==="gdc" && o.startTime===settings.gdcStart && timeToMinutes(o.endTime)-timeToMinutes(o.startTime)===60)) issue("gdc_missing",`${person.name}: falta GDC de 1h na segunda-feira no horário comum.`,date)
    }
  }
  for(let week=mondayOf(from);week<=to;week=addDays(week,7)) {
    if(week<from || addDays(week,5)>to) {issues.push({severity:"warning",code:"partial_week",date:week,message:`Semana ${week} parcial: confira a carga incluindo os dias fora do período.`});continue}
    for(const person of people) {
      let minutes=0
      for(let day=week;day<=addDays(week,6);day=addDays(day,1)) minutes+=union(active.filter(o=>o.userId===person.id&&o.date===day).flatMap(segments)).reduce((sum,[a,b])=>sum+b-a,0)
      weekly.push({userId:person.id,name:person.name,week,minutes,adjustmentMinutes:42*60-minutes})
      if(minutes!==42*60) issue("weekly_hours",`${person.name}: ${(minutes/60).toFixed(1)}h na semana ${week}; ajuste ${((42*60-minutes)/60).toFixed(1)}h para a base de 42h. Eventos, GDC e sábados entram na soma; almoço não.`,week)
    }
  }
  return {issues,weekly,capacity:planningCapacity(people.length,settings.gdcCoverageMode==="pause"),futureCapacity:planningCapacity(7,settings.gdcCoverageMode==="pause")}
}
