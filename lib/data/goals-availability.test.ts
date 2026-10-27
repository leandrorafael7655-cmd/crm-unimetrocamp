import { beforeEach,describe,it,expect,vi } from "vitest"
const mock=vi.hoisted(()=>({role:'gerente',id:'10000000-0000-4000-8000-000000000004',client:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/guards',()=>({requireActor:async()=>({id:mock.id,role:mock.role,active:true})}))
vi.mock('@/lib/supabase/server',()=>({createClient:()=>{mock.client();const q:any={select:()=>q,eq:()=>q,gte:()=>q,lte:()=>q,not:()=>q,
 then:(resolve:any)=>Promise.resolve({count:0,data:[],error:null}).then(resolve)};return {from:()=>q}}}))
import { realizadoDaMeta,type Meta } from './goals-queries'
const meta:Meta={id:'goal',goalType:'high_school_actions',goalTypeLabel:'Ações',unit:'ações',scopeType:'individual',teamType:'hs',userId:mock.id,userName:'Fictício',commercialCycleId:null,supervestCycleId:null,targetValue:4,startAt:'2026-10-01',endAt:'2027-04-30',status:'ativa',notes:null}
beforeEach(()=>{mock.role='gerente';mock.client.mockClear()})
describe('A measured zero is distinct from an unavailable integration',()=>{
 it('keeps a measured zero as zero',async()=>expect(await realizadoDaMeta(meta)).toBe(0))
 it('does not invent zero for unimplemented B2B attribution',async()=>expect(await realizadoDaMeta({...meta,goalType:'b2b_supervest_registrations'})).toBeNull())
 it('does not calculate another consultant individual result',async()=>{
  mock.role='consultor_b2b';expect(await realizadoDaMeta({...meta,userId:'other'})).toBeNull();expect(mock.client).not.toHaveBeenCalled()
 })
})
