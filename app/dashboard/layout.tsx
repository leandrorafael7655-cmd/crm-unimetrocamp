import type { ReactNode } from "react"
import { SystemShell } from "@/components/navigation/system-shell"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <SystemShell>{children}</SystemShell>
}
