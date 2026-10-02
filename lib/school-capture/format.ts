import type { AcaoEscola } from "@/lib/domain/high-school"
import { localActionDateTime } from "@/lib/company-actions/domain"

export function dateLabel(date: string) {
  return date ? date.slice(0, 10).split("-").reverse().join("/") : "—"
}
export function instantLabel(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
export function actionLabel(a: AcaoEscola) {
  return `${dateLabel(a.data)} · ${a.inicio?.slice(0, 5) || "Sem horário"}${a.fim ? `–${a.fim.slice(0, 5)}` : ""}`
}
export function interactionDateLabel(i: { at: string; hasTime: boolean }) {
  return i.hasTime
    ? instantLabel(i.at)
    : dateLabel(localActionDateTime(i.at).date)
}
