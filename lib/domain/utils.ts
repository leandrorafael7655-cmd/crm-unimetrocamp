/* ─────────────────────────  utilidades puras de domínio  ─────────────────────────
   Funções sem estado, sem I/O e sem React — datas em ISO (YYYY-MM-DD),
   identificadores, números, slug e CNPJ. Extraídas de components/crm-app.jsx
   (fonte única) para permitir reuso no seed, nos mappers e em testes. O
   comportamento foi preservado exatamente; a suíte em utils.test.ts fixa isso. */

/* data de hoje no fuso local, em ISO curto (sem hora) */
export const hojeISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* diferença em dias inteiros entre duas datas ISO; null se faltar alguma */
export const diffDias = (de: string, ate: string): number | null => {
  if (!de || !ate) return null
  return Math.round(
    (new Date(ate + "T00:00:00").getTime() - new Date(de + "T00:00:00").getTime()) / 86400000,
  )
}

/* dd/mm — para chips e listas compactas */
export const brData = (iso: string): string => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—")

/* dd/mm/aaaa — para textos e detalhes */
export const brDataLonga = (iso: string): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—"

/* soma (ou subtrai) dias a uma data ISO, devolvendo ISO curto */
export const somarDias = (iso: string, n: number): string => {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* UUID v4 — usa crypto quando disponível, com fallback determinístico em forma */
export const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
      })

/* coerção segura para número (NaN → 0) */
export const num = (v: unknown): number => Number(v) || 0

/* rótulo de idade: dias, ou meses quando passa de 60 dias */
export const meses = (dias: number | null): string =>
  dias === null ? "—" : dias < 60 ? `${dias} dias` : `${Math.floor(dias / 30)} meses`

/* slug url-safe, sem acentos, limitado a 40 caracteres */
export const slug = (t: string): string =>
  (t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

/* ─── CNPJ ─── */

export const soDigitos = (v: string): string => (v || "").replace(/\D/g, "")

export const mascaraCNPJ = (v: string): string => {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

const dvCNPJ = (base: string, pesos: number[]): number =>
  ((s: number) => (s % 11 < 2 ? 0 : 11 - (s % 11)))(
    base.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0),
  )

const P1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const P2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export const cnpjValido = (v: string): boolean => {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const d1 = dvCNPJ(c.slice(0, 12), P1)
  return c === c.slice(0, 12) + String(d1) + String(dvCNPJ(c.slice(0, 12) + String(d1), P2))
}

/* completa um CNPJ base de 12 dígitos com os dois DVs e aplica a máscara */
export const completarCNPJ = (base12: string): string => {
  const d1 = dvCNPJ(base12, P1)
  return mascaraCNPJ(base12 + String(d1) + String(dvCNPJ(base12 + String(d1), P2)))
}
