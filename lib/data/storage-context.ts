/* Backend de armazenamento plugável.
   A UML do CRM (components/crm-app.jsx) persiste tudo através de duas
   primitivas — get(chave, compartilhado) e set(chave, valorJSON, compartilhado).
   Aqui trocamos a implementação por trás dessas primitivas: Supabase quando há
   sessão autenticada, ou localStorage no modo demonstração. */

export interface StorageBackend {
  get(chave: string, compartilhado: boolean): Promise<{ value: string | null } | null>
  set(chave: string, valorJSON: string, compartilhado: boolean): Promise<boolean>
}

let atual: StorageBackend | null = null

export function setStorage(backend: StorageBackend): void {
  atual = backend
}

export function getStorage(): StorageBackend {
  if (!atual) {
    throw new Error("Storage backend não inicializado. Renderize o CRM dentro de um wrapper de modo.")
  }
  return atual
}
