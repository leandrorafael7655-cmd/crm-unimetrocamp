import { CHAVES } from "@/lib/domain/constants"
import type { StorageBackend } from "./storage-context"

/* Modo demonstração: replica o comportamento do protótipo original, guardando
   cada chave como um blob JSON. O parâmetro "compartilhado" é ignorado — tudo
   fica no localStorage do navegador. */
export function makeLocalStorage(): StorageBackend {
  const disponivel = typeof window !== "undefined" && !!window.localStorage
  return {
    mode: "demo",
    async saveInteraction(activity, company) {
      if (!disponivel) return false
      const oldCompanies = window.localStorage.getItem(CHAVES.empresas)
      const oldActivities = window.localStorage.getItem(CHAVES.atividades)
      try {
        const companies = JSON.parse(oldCompanies || "[]")
        const activities = JSON.parse(oldActivities || "[]")
        window.localStorage.setItem(CHAVES.empresas,JSON.stringify(companies.map((e: {id: string}) => e.id===company.id ? company : e)))
        window.localStorage.setItem(CHAVES.atividades,JSON.stringify([...activities,activity]))
        return true
      } catch {
        if (oldCompanies === null) window.localStorage.removeItem(CHAVES.empresas)
        else window.localStorage.setItem(CHAVES.empresas,oldCompanies)
        if (oldActivities === null) window.localStorage.removeItem(CHAVES.atividades)
        else window.localStorage.setItem(CHAVES.atividades,oldActivities)
        return false
      }
    },
    async get(chave: string) {
      if (!disponivel) return { value: null }
      return { value: window.localStorage.getItem(chave) }
    },
    async set(chave: string, valorJSON: string) {
      if (!disponivel) return false
      try {
        if (valorJSON === "null" || valorJSON === undefined) window.localStorage.removeItem(chave)
        else window.localStorage.setItem(chave, valorJSON)
        return true
      } catch {
        return false
      }
    },
  }
}
