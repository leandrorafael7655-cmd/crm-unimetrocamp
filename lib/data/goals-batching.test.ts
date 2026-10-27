import { beforeEach,describe,expect,it,vi } from "vitest"
const state=vi.hoisted(()=>({calls:[] as string[],fail:false}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/guards',()=>({requireActor:async()=>({id:'own',role:'gerente',active:true})}))
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({from:(table:string)=>{
  state.calls.push(table)
  const data=table==='activities'?[{id:'a',data:'2026-08-03'},{id:'b',data:'2026-08-09'},{id:'c',data:'2026-08-10'}]:[]
  const result={data,error:state.fail?{message:'Falha real de consulta'}:null}
  const query:any={select:()=>query,eq:()=>query,gte:()=>query,lte:()=>query,not:()=>query,order:()=>query,
    range:async()=>result,then:(resolve:any)=>Promise.resolve(result).then(resolve)}
  return query
}})}))
import { aderenciaDoConsultor } from './goals-queries'
beforeEach(()=>{state.calls=[];state.fail=false})
describe('Weekly goal reconciliation uses a bounded data read',()=>{
 it('counts Sunday in the same civil week and queries activities once for all weeks',async()=>{
  const result=await aderenciaDoConsultor('own','Fictício','2026-08-03','2026-08-16',[])
  expect(result.semanas.map(s=>[s.weekStart,s.completedActions])).toEqual([['2026-08-03',2],['2026-08-10',1]])
  expect(state.calls.filter(c=>c==='activities')).toHaveLength(1)
 })
 it('reports an unavailable calculation instead of presenting zero on database failure',async()=>{
  state.fail=true
  await expect(aderenciaDoConsultor('own','Fictício','2026-08-03','2026-08-16',[])).rejects.toThrow()
 })
})
