import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  actor: { id: "10000000-0000-4000-8000-000000000004", role: "consultor_b2b", full_name: "Teste", email: "test@example.invalid" },
  rpc: vi.fn(), worker: vi.fn(), refresh: vi.fn(), client: vi.fn(), admin: vi.fn(), actorRead: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: state.refresh }))
vi.mock("@/lib/auth/guards", () => ({ requireActor: state.actorRead, isManagerRole: (role: string) => ["gerente", "supervisor"].includes(role) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: state.client }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }))
vi.mock("@/lib/meetings/contact-worker", () => ({ processContactMeetingQueue: state.worker }))
import { recordContactMeetingResult } from "@/app/actions/contact-meetings"
const id = "40000000-0000-4000-8000-000000000001", entityId = "20000000-0000-4000-8000-000000000001"
beforeEach(() => {
  vi.clearAllMocks()
  state.actor.role = "consultor_b2b"
  state.actorRead.mockResolvedValue(state.actor)
  state.rpc.mockResolvedValue({error:null})
  state.admin.mockReturnValue({rpc:state.rpc})
  // The company has been transferred. Its original consultant may still record their own meeting's outcome.
  const q: any = { select:()=>q, eq:()=>q, maybeSingle:async()=>({data:{id:entityId,owner_id:"another",name:"Fictícia",razao_social:"Fictícia",archived_at:null},error:null}) }
  state.client.mockResolvedValue({from:()=>q})
})
it.each(["company", "school"] as const)("%s result calls only the authorized RPC, revalidates indicators and never calls a worker", async entity => {
  expect(await recordContactMeetingResult(entity,entityId,id,3,"realizada")).toMatchObject({ok:true,message:expect.stringContaining("Nenhum e-mail")})
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("save_contact_meeting",{
    p_actor:state.actor.id,p_id:id,p_revision:3,p_entity:entity,p_entity_id:entityId,
    p_operation:"result",p_data:{status:"realizada"},p_contacts:[],p_sender:null,
  })
  expect(state.worker).not.toHaveBeenCalled()
  for(const path of ["/","/b2b/carteira","/gestao/metas","/high-school","/high-school/captacao-escolas","/high-school/agenda","/atendimento/minha-agenda"])
    expect(state.refresh).toHaveBeenCalledWith(path)
})
it("invalid input and a High School actor without B2B write access cannot reach the privileged client", async () => {
  expect((await recordContactMeetingResult("school",entityId,id,0,"realizada")).ok).toBe(false)
  expect((await recordContactMeetingResult("company",entityId,"not-an-id",1,"confirmada")).ok).toBe(false)
  state.actor.role="high_school"
  expect((await recordContactMeetingResult("company",entityId,id,1,"confirmada")).ok).toBe(false)
  expect(state.admin).not.toHaveBeenCalled()
  expect(state.rpc).not.toHaveBeenCalled()
  expect(state.worker).not.toHaveBeenCalled()
})
it("database rejection is returned without processing sends or invalidating a success view", async () => {
  state.rpc.mockResolvedValue({error:{message:"Reunião alterada. Atualize a ficha."}})
  expect(await recordContactMeetingResult("company",entityId,id,1,"confirmada")).toEqual({ok:false,message:"Reunião alterada. Atualize a ficha."})
  expect(state.worker).not.toHaveBeenCalled()
  expect(state.refresh).not.toHaveBeenCalled()
})
