import { describe,it,expect,vi } from "vitest"
import { readAllRows } from "./pagination"
import { makeSupabaseStorage } from "./supabase-storage"
import { CHAVES } from "@/lib/domain/constants"
vi.mock("@/lib/calendar/calendar-dispatch",()=>({flushCalendarQueue:async()=>({})}))
describe('B2B persistence acknowledgement and complete reads',()=>{
 it('reads more than a thousand rows without truncation',async()=>{
   const source=Array.from({length:1251},(_,id)=>({id}))
   const page=vi.fn(async(from:number,to:number)=>({data:source.slice(from,to+1),error:null}))
   expect(await readAllRows(page)).toEqual(source);expect(page).toHaveBeenCalledTimes(3)
 })
 it('does not return a partial list when a later page fails',async()=>{
   await expect(readAllRows(async(from,to)=>({data:from===0?Array.from({length:to-from+1},()=>1):null,error:from?{message:'Falha de conexão'}:null}))).rejects.toThrow('Falha de conexão')
 })
 it('propagates a refused insert instead of reporting success',async()=>{
   const rpc=vi.fn(async()=>({data:null,error:{message:'Gravação recusada'}}))
   const client:any={rpc,from:()=>{const q:any={select:()=>q,order:()=>q,not:()=>q,range:async()=>({data:[],error:null})};return q}}
   const backend=makeSupabaseStorage(client,{id:'10000000-0000-4000-8000-000000000001',nome:'Teste',papel:'Consultor'} as any)
   await backend.get(CHAVES.empresas,true)
   await expect(backend.set(CHAVES.empresas,JSON.stringify([{id:crypto.randomUUID(),razaoSocial:'Fictícia',contatos:[]}]),true)).rejects.toThrow('Gravação recusada')
   expect(rpc).toHaveBeenCalledWith('save_b2b_company_atomic',expect.objectContaining({p_create:true}))
 })
 it('only acknowledges a company after the RPC has completed',async()=>{
   let release:(value:unknown)=>void=()=>{}
   const rpc=vi.fn(()=>new Promise(resolve=>{release=resolve}))
   const client:any={rpc,from:()=>{const q:any={select:()=>q,order:()=>q,not:()=>q,range:async()=>({data:[],error:null})};return q}}
   const backend=makeSupabaseStorage(client,{id:'10000000-0000-4000-8000-000000000001',nome:'Teste',papel:'Consultor'} as any)
   await backend.get(CHAVES.empresas,true)
   const saved=backend.set(CHAVES.empresas,JSON.stringify([{id:crypto.randomUUID(),razaoSocial:'Fictícia',contatos:[]}]),true)
   let complete=false;void saved.then(()=>{complete=true})
   await new Promise(resolve=>setTimeout(resolve,1));expect(complete).toBe(false)
   release({data:'confirmed',error:null});await expect(saved).resolves.toBe(true)
 })
})
