import React from "react"
import { createRoot } from "react-dom/client"
import { ResponsiveShell } from "../../components/navigation/responsive-shell"
import { SystemSidebar } from "../../components/navigation/system-sidebar"
import { LegacySidebarBridge } from "../../components/navigation/legacy-sidebar-bridge"
import CrmApp from "../../components/crm-app"
import { setStorage } from "../../lib/data/storage-context"
import { makeLocalStorage } from "../../lib/data/local-storage"
import { CHAVES, EQUIPE_PADRAO, CONFIG_PADRAO } from "../../lib/domain/constants"
import { dadosExemplo } from "../../lib/domain/seed"
import { actor, owners } from "./fixtures.mjs"
import Dashboard from "../../app/dashboard/page"
import HighSchool from "../../app/high-school/page"
import Escolas from "../../app/high-school/escolas/page"
import Escola360 from "../../app/high-school/escolas/[id]/page"
import Pipeline from "../../app/high-school/pipeline/page"
import AgendaHS from "../../app/high-school/agenda/page"
import Metas from "../../app/gestao/metas/page"
import Supervest from "../../app/supervest/page"
import Atendimento from "../../app/atendimento/page"
import MinhaAgenda from "../../app/atendimento/minha-agenda/page"
import Rotas from "../../app/mapa/rotas/page"
import Mapa from "../../app/mapa/page"
import Configuracoes from "../../app/gestao/configuracoes/page"
import Login from "../../app/auth/login/page"
import ResetPassword from "../../app/auth/reset-password/page"
import { SetupForm } from "../../components/auth/setup-form"
import { AuthShell } from "../../components/auth/auth-shell"
import { GerenciarUsuarios } from "../../components/team/gerenciar-usuarios"
import { CompanyMeetings } from "../../components/b2b/company-meetings"
import { MapView } from "../../components/maps/map-view"

const pages = {
  dashboard: Dashboard, hs: HighSchool, escolas: Escolas, escola: Escola360, pipeline: Pipeline,
  agenda: AgendaHS, metas: Metas, supervest: Supervest, atendimento: Atendimento, "minha-agenda": MinhaAgenda,
  rotas: Rotas, mapa: Mapa, configuracoes: Configuracoes,
}
const paths = { dashboard: "/dashboard", hs: "/high-school", escolas: "/high-school/escolas",
  escola: "/high-school/escolas/school-0", pipeline: "/high-school/pipeline", agenda: "/high-school/agenda",
  metas: "/gestao/metas", supervest: "/supervest", atendimento: "/atendimento", "minha-agenda": "/atendimento/minha-agenda",
  rotas: "/mapa/rotas", mapa: "/mapa", configuracoes: "/gestao/configuracoes" }
const root = createRoot(document.getElementById("root"))
window.renderFixture = async (name) => {
  window.fixturePath = paths[name] || "/"
  document.body.dataset.ready = ""
  const perfil = { id: actor.id, nome: actor.full_name, papel: "Gerente", tag: "rafa", role: "gerente", email: actor.email }
  let content
  if (name === "b2b") {
    localStorage.setItem(CHAVES.usuario, JSON.stringify(EQUIPE_PADRAO[0]))
    localStorage.setItem(CHAVES.equipe, JSON.stringify(EQUIPE_PADRAO))
    localStorage.setItem(CHAVES.empresas, JSON.stringify(dadosExemplo(EQUIPE_PADRAO).map((e, i) => ({
      ...e, nomeFantasia: e.nomeFantasia + (i === 0 ? " " + "EmpresaMuitoExtensa".repeat(10) : ""),
    }))))
    localStorage.setItem(CHAVES.config, JSON.stringify(CONFIG_PADRAO))
    localStorage.setItem(CHAVES.atividades, JSON.stringify([]))
    setStorage(makeLocalStorage())
    content = <><CrmApp modo="demo" usuarioInicial={perfil}/><LegacySidebarBridge role="gerente"/></>
  } else if (name === "login") content = <Login />
  else if (name === "senha") content = <ResetPassword />
  else if (name === "setup") content = <AuthShell titulo="Configuração"><SetupForm exigeEmail={true}/></AuthShell>
  else {
    let child
    if (name === "usuarios") child = <GerenciarUsuarios perfil={perfil}/>
    else if (name === "reunioes") child = <CompanyMeetings companyId="company" companyName="Empresa Campinas"/>
    else if (name === "mapa-interativo") child = <div className="h-[700px]"><MapView token="fixture" opcoes={{ cidades: ["Campinas"], etapas: ["Mapeada"], responsaveis: owners }} centroInicial={{longitude:-47, latitude:-22, zoom:10}}/></div>
    else child = await pages[name]({ searchParams: Promise.resolve({}), params: Promise.resolve({ id: "school-0" }) })
    content = <ResponsiveShell sidebar={<SystemSidebar role="gerente" userName={actor.full_name}/>} mainClassName={name.startsWith("mapa") ? "" : "p-4 sm:p-6"}>{child}</ResponsiveShell>
  }
  root.render(<React.Fragment key={name + ":" + Date.now()}>{content}</React.Fragment>)
  document.body.dataset.ready = name
}
