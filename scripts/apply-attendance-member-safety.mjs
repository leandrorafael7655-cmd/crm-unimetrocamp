import fs from "node:fs"

const path = "app/actions/attendance.ts"
let source = fs.readFileSync(path, "utf8")

const from = `    const { error } = await admin.from("attendance_members").upsert({ user_id: userId, enabled, created_by: actor.id }, { onConflict: "user_id" })\n    if (error) return { ok: false, message: error.message }\n    revalidatePath("/atendimento")\n    return { ok: true, message: enabled ? "Usuário incluído no Atendimento." : "Usuário removido da lista de Atendimento." }`

const to = `    const { error } = await admin.from("attendance_members").upsert({ user_id: userId, enabled, created_by: actor.id }, { onConflict: "user_id" })\n    if (error) return { ok: false, message: error.message }\n    if (!enabled) {\n      const { error: unlinkError } = await admin\n        .from("attendance_team_slots")\n        .update({ user_id: null, updated_by: actor.id })\n        .eq("user_id", userId)\n      if (unlinkError) return { ok: false, message: `Usuário removido do Atendimento, mas não foi possível desvinculá-lo do rodízio: \\${unlinkError.message}` }\n    }\n    revalidatePath("/atendimento")\n    return {\n      ok: true,\n      message: enabled\n        ? "Usuário incluído no Atendimento."\n        : "Usuário removido do Atendimento e desvinculado das posições futuras do rodízio.",\n    }`

if (!source.includes(to)) {
  if (!source.includes(from)) throw new Error("[attendance-member-safety] Trecho setAttendanceMember não encontrado")
  source = source.replace(from, to)
  fs.writeFileSync(path, source)
}

console.log("[attendance-member-safety] patch aplicado")
