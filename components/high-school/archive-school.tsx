"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setSchoolArchived } from "@/app/actions/commercial-archive"
export function ArchiveSchool({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter(), [busy, start] = useTransition(), [notice, setNotice] = useState("")
  return <div className="space-y-2 text-sm"><button disabled={busy} className="rounded-md border px-3 py-2 text-slate-700" onClick={() => start(async () => {
    const result = await setSchoolArchived(id, !archived); setNotice(result.message); if (result.ok) router.refresh()
  })}>{archived ? "Reativar escola" : "Arquivar escola"}</button>{notice && <p role="status">{notice}</p>}</div>
}
