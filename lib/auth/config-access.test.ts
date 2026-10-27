import {expect,it,vi} from "vitest"
const state=vi.hoisted(()=>({role:'consultor_b2b',client:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/guards',()=>({requireActor:async()=>({id:'own',role:state.role,active:true})}))
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url)}}))
vi.mock('@/lib/supabase/server',()=>({createClient:()=>{state.client();throw new Error('Must not read management data')}}))
import ConfiguracoesPage from '@/app/gestao/configuracoes/page'
it.each(['consultor_b2b','high_school'])('direct configuration navigation redirects %s before any management query',async role=>{
 state.role=role;state.client.mockClear()
 await expect(ConfiguracoesPage()).rejects.toThrow('REDIRECT:/')
 expect(state.client).not.toHaveBeenCalled()
})
