import CrmDemo from "@/components/crm-demo"
import { Suspense } from "react"

export const metadata = {
  title: "Demonstração",
  description: "Explore o CRM com dados de exemplo salvos apenas neste navegador.",
}

export default function DemoPage() {
  return <Suspense fallback={<p className="p-6">Carregando…</p>}><CrmDemo /></Suspense>
}
