import { beforeEach, describe,it,expect,vi } from "vitest"
const mock=vi.hoisted(()=>({role:'supervisor',admin:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/guards',()=>({
 requireRole:async(role:string)=>{if(mock.role!==role) throw new Error('Sem permissão');return {id:'10000000-0000-4000-8000-000000000001',role:mock.role}},
 requireManager:async()=>{throw new Error('Não usado')},
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{mock.admin();throw new Error('Credencial administrativa não deve ser acessada')}}))
import { resetPassword,resendInvite,changeRole,setActive,inviteUser,fixMissingProfile,managerExists } from '@/app/actions/team'
import { updateManagedUser,deleteUser } from '@/app/actions/user-admin'
beforeEach(()=>mock.admin.mockClear())
describe('Legacy/current administration has one server authorization boundary',()=>{
 it.each(['supervisor','consultor_b2b','high_school'])('blocks %s before any administrative client access',async role=>{
   mock.role=role
   const id='10000000-0000-4000-8000-000000000002'
   const results=await Promise.all([resetPassword('test@example.invalid'),resendInvite('test@example.invalid'),changeRole(id,'consultor_b2b'),setActive(id,false),
     inviteUser({fullName:'Fictício',email:'test@example.invalid',role:'supervisor'}),fixMissingProfile(id),deleteUser(id),
     updateManagedUser({userId:id,fullName:'Fictício',email:'test@example.invalid',role:'gerente',includeInAttendance:false})])
   expect(results.every(r=>!r.ok)).toBe(true)
   expect(mock.admin).not.toHaveBeenCalled()
 })
 it('initial setup fails closed when the manager lookup is unavailable',async()=>{
   expect(await managerExists()).toBe(true)
 })
})
