import { requireCan } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { loadSchoolCaptureData } from "@/lib/data/school-capture-queries"
import { SchoolCapture } from "@/components/high-school/school-capture"
export const dynamic = "force-dynamic"
export default async function SchoolCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ ciclo?: string; escola?: string }>
}) {
  const [actor, data, params] = await Promise.all([
    requireCan("hs.read"),
    loadSchoolCaptureData(),
    searchParams,
  ])
  return (
    <SchoolCapture
      data={data}
      actor={{ id: actor.id, name: actor.display_name, role: actor.role }}
      canWrite={can(actor.role, "hs.capture.write")}
      canConfigure={can(actor.role, "supervest.write")}
      initialCycleId={params.ciclo}
      initialSchoolId={params.escola}
      now={new Date().toISOString()}
    />
  )
}
