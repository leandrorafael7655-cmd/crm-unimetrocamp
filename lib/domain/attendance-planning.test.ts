import { describe,it,expect } from "vitest"
import { inspectAttendancePlan,planningCapacity } from "./attendance-planning"
import { validateSchedule, validateRouteSchedule } from "./validation"
import type { AttendanceSettings, GeneratedOccurrence } from "./attendance"
const settings:AttendanceSettings={timezone:'America/Sao_Paulo',scheduleStartDate:'2026-10-26',weekdayRoomOpen:'09:00',weekdayRoomClose:'20:00',roomEarlyStart:'09:00',roomEarlyEnd:'18:00',roomLateStart:'11:00',roomLateEnd:'20:00',morningStart:'09:00',morningEnd:'13:00',afternoonStart:'14:00',afternoonEnd:'18:00',saturdayStart:'09:00',saturdayEnd:'13:00',minRoomCoverage:3,minSaturdayCoverage:2,roomLocation:'SM',conversionLocation:'Conversão',externalLocation:'Externa',roomEarlyBreaks:[],roomLateBreaks:[],gdcStart:null,gdcCoverageMode:'pending'}
const people=[{id:'a',name:'Pessoa fictícia'}]
const occurrence=(date:string,patch:Partial<GeneratedOccurrence>={}):GeneratedOccurrence=>({seriesKey:'a',templateWeekIndex:1,slotKey:'a',userId:'a',responsibleName:'Pessoa fictícia',activity:'room',date,startTime:'09:00',endTime:'18:00',breakStart:'12:00',breakEnd:'13:00',location:'SM',status:'draft',...patch})
describe('Confirmed attendance rules without inventing a personal schedule',()=>{
 it('shows capacity for six/seven, including mandatory Saturday coverage and GDC',()=>{
   expect(planningCapacity(6)).toMatchObject({weeklyHours:252,smHours:173,gdcHours:6,remainingHours:73,gdcCoverageWithoutBackup:0})
   expect(planningCapacity(7)).toMatchObject({weeklyHours:294,gdcHours:7,gdcCoverageWithoutBackup:0})
 })
 it('deducts lunch and identifies the old 40h/44h mismatch',()=>{
   const rows=['26','27','28','29','30'].map(d=>occurrence(`2026-10-${d}`))
   expect(inspectAttendancePlan({occurrences:rows,settings,people,from:'2026-10-26',to:'2026-10-31'}).weekly[0].minutes).toBe(40*60)
   rows.push(occurrence('2026-10-31',{endTime:'13:00',breakStart:null,breakEnd:null}))
   const result=inspectAttendancePlan({occurrences:rows,settings,people,from:'2026-10-26',to:'2026-10-31'})
   expect(result.weekly[0]).toMatchObject({minutes:44*60,adjustmentMinutes:-120})
 })
 it('requires GDC time and an explicit coverage decision; does not invent it',()=>{
   const result=inspectAttendancePlan({occurrences:[],settings,people,from:'2026-10-26',to:'2026-10-31'})
   expect(result.issues.some(i=>i.code==='gdc_pending')).toBe(true)
   expect(settings.gdcStart).toBeNull()
 })
 it('keeps unconfigured external GDC coverage blocked and rejects meetings ending after close',()=>{
   const result=inspectAttendancePlan({occurrences:[],settings:{...settings,gdcStart:'19:30',gdcCoverageMode:'backup'},people,from:'2026-10-26',to:'2026-10-31'})
   expect(result.issues.some(i=>i.code==='gdc_time')).toBe(true)
   expect(result.issues.some(i=>i.code==='gdc_external_coverage')).toBe(true)
 })
 it('checks coverage minute by minute and counts distinct people',()=>{
   const rows=[occurrence('2026-10-26'),occurrence('2026-10-26')]
   const result=inspectAttendancePlan({occurrences:rows,settings,people,from:'2026-10-26',to:'2026-10-31'})
   expect(result.issues.some(i=>i.code==='room_coverage'&&i.message.includes('1/3'))).toBe(true)
   expect(result.weekly[0].minutes).toBe(8*60)
   expect(result.issues.some(i=>i.code==='person_overlap')).toBe(true)
 })
 it('counts extra events in weekly work instead of discarding after-hours work',()=>{
   const result=inspectAttendancePlan({occurrences:[occurrence('2026-10-26'),occurrence('2026-10-26',{activity:'event',startTime:'20:00',endTime:'22:00',breakStart:null,breakEnd:null})],settings,people,from:'2026-10-26',to:'2026-10-31'})
   expect(result.weekly[0].minutes).toBe(10*60)
 })
 it('checks overlapping work even on a Sunday with no regular SM opening',()=>{
   const event=occurrence('2026-11-01',{activity:'event',startTime:'10:00',endTime:'12:00',breakStart:null,breakEnd:null})
   const result=inspectAttendancePlan({occurrences:[event,event],settings,people,from:'2026-10-26',to:'2026-11-01'})
   expect(result.weekly[0].minutes).toBe(120)
   expect(result.issues.some(i=>i.code==='person_overlap'&&i.date==='2026-11-01')).toBe(true)
 })
 it.each([['2026-02-30','09:00','10:00'],['2026-10-27','15:00','14:00'],['2026-10-27','09:00','09:00'],['2026-10-27','24:00','25:00']])('rejects invalid date/time %s %s %s',(...args)=>expect(validateSchedule(...args as [string,string,string])).not.toBeNull())
 it('accepts adjacent times and the São Paulo civil date without UTC date rollover',()=>{
   expect(validateSchedule('2026-10-27','00:00','00:01')).toBeNull()
   expect(validateSchedule('2026-10-27',null,null)).toBeNull()
 })
 it('keeps the optional route return while rejecting an invalid or inverted return',()=>{
   expect(validateRouteSchedule('2026-10-27','09:00',null)).toBeNull()
   expect(validateRouteSchedule('2026-10-27','09:00','09:00')).not.toBeNull()
   expect(validateRouteSchedule('2026-10-27',null,'10:00')).not.toBeNull()
 })
})
