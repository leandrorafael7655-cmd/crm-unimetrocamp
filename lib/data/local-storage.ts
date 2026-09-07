import type { StorageBackend } from "./storage-context"

/* Modo demonstração: replica o comportamento do protótipo original, guardando
   cada chave como um blob JSON. O parâmetro "compartilhado" é ignorado — tudo
   fica no localStorage do navegador. */
export function makeLocalStorage(): StorageBackend {
  const disponivel = typeof window !== "undefined" && !!window.localStorage
  return {
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
