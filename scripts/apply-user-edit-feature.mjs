import fs from "node:fs"

function patchFile(path, patches) {
  let source = fs.readFileSync(path, "utf8")
  let changed = false

  for (const { label, from, to } of patches) {
    if (source.includes(to)) continue
    if (!source.includes(from)) {
      throw new Error(`[user-edit] Trecho não encontrado em ${path}: ${label}`)
    }
    source = source.replace(from, to)
    changed = true
  }

  if (changed) fs.writeFileSync(path, source)
}

patchFile("app/actions/user-admin.ts", [
  {
    label: "action updateManagedUser",
    from: `export async function sendPasswordRecovery(emailInput: string): Promise<UserAdminResult> {`,
    to: `export async function updateManagedUser(input: {
  userId: string
  fullName: string
  email: string
  role: Role
  consultantTag?: string
  includeInAttendance: boolean
}): Promise<UserAdminResult> {
  let actor
  try {
    actor = await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const userId = input.userId.trim()
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const role: Role = ROLES.includes(input.role) ? input.role : "consultor_b2b"
  const consultantTag = slugTag(input.consultantTag?.trim() || fullName)

  if (!userId) return { ok: false, message: "Usuário inválido." }
  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }
  if (!consultantTag) return { ok: false, message: "Informe um Nome no CRM (Tag) válido." }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,full_name,email,role,active,consultant_tag")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) return { ok: false, message: \`Falha ao localizar usuário: \${profileError.message}\` }
  if (!profile) return { ok: false, message: "Usuário não encontrado." }

  const currentRole = normalizeRole(profile.role)
  if (actor.role !== "gerente" && (currentRole === "gerente" || role === "gerente")) {
    return { ok: false, message: "Somente a gerência pode editar um gerente ou atribuir esse perfil." }
  }
  if (userId === actor.id && role !== actor.role) {
    return { ok: false, message: "Você não pode alterar o próprio perfil de acesso." }
  }

  if (currentRole === "gerente" && role !== "gerente" && profile.active) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "gerente")
      .eq("active", true)
      .neq("id", userId)
    if ((count ?? 0) === 0) {
      return { ok: false, message: "Não é possível remover o perfil do último gerente ativo." }
    }
  }

  const { data: authData, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authListError) return { ok: false, message: \`Falha ao validar conta: \${authListError.message}\` }
  const authUsers = authData.users ?? []
  const targetAuth = authUsers.find((u) => u.id === userId && !isDeletedAuthUser(u))
  if (!targetAuth) return { ok: false, message: "Conta de autenticação não encontrada ou já excluída." }
  const emailDuplicate = authUsers.find(
    (u) => u.id !== userId && !isDeletedAuthUser(u) && u.email?.toLowerCase() === email,
  )
  if (emailDuplicate) return { ok: false, message: "Já existe outro usuário cadastrado com este e-mail." }

  const { data: duplicateTags, error: tagError } = await admin
    .from("profiles")
    .select("id")
    .eq("consultant_tag", consultantTag)
    .neq("id", userId)
    .limit(1)
  if (tagError) return { ok: false, message: \`Falha ao validar a Tag: \${tagError.message}\` }
  if ((duplicateTags ?? []).length > 0) {
    return { ok: false, message: "Esse Nome no CRM (Tag) já está sendo usado por outro usuário." }
  }

  const previousMetadata = (targetAuth.user_metadata ?? {}) as Record<string, unknown>
  const previousEmail = targetAuth.email || profile.email || ""
  const nextMetadata = {
    ...previousMetadata,
    full_name: fullName,
    role,
    consultant_tag: consultantTag,
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: nextMetadata,
  })
  if (authUpdateError) return { ok: false, message: \`Falha ao atualizar acesso: \${authUpdateError.message}\` }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ full_name: fullName, email, role, consultant_tag: consultantTag })
    .eq("id", userId)
  if (profileUpdateError) {
    await admin.auth.admin.updateUserById(userId, {
      email: previousEmail || undefined,
      email_confirm: true,
      user_metadata: previousMetadata,
    })
    return { ok: false, message: \`Falha ao atualizar perfil: \${profileUpdateError.message}\` }
  }

  let attendanceWarning = ""
  const { error: attendanceError } = await admin.from("attendance_members").upsert(
    { user_id: userId, enabled: input.includeInAttendance, created_by: actor.id },
    { onConflict: "user_id" },
  )
  if (attendanceError) {
    attendanceWarning = \` Participação no Atendimento não pôde ser atualizada: \${attendanceError.message}\`
  } else if (!input.includeInAttendance) {
    const { error: unlinkError } = await admin
      .from("attendance_team_slots")
      .update({ user_id: null, updated_by: actor.id })
      .eq("user_id", userId)
    if (unlinkError) attendanceWarning = \` O usuário saiu do Atendimento, mas o rodízio precisa ser revisado: \${unlinkError.message}\`
  }

  const emailChanged = previousEmail.toLowerCase() !== email
  return {
    ok: true,
    message: \`Usuário atualizado com sucesso. Nome operacional: \${profileDisplayName({ full_name: fullName, consultant_tag: consultantTag })}.\${emailChanged ? " O novo e-mail será usado nos próximos envios e convites." : ""}\${attendanceWarning}\`,
  }
}

export async function sendPasswordRecovery(emailInput: string): Promise<UserAdminResult> {`,
  },
])

patchFile("components/team/gerenciar-usuarios.tsx", [
  {
    label: "import updateManagedUser",
    from: `  listManagedUsers,\n  sendPasswordRecovery,`,
    to: `  listManagedUsers,\n  updateManagedUser,\n  sendPasswordRecovery,`,
  },
  {
    label: "edit state",
    from: `  const [incluirAtendimento, setIncluirAtendimento] = useState(true)\n\n  const [diag, setDiag]`,
    to: `  const [incluirAtendimento, setIncluirAtendimento] = useState(true)\n  const [edicao, setEdicao] = useState<null | {\n    id: string\n    fullName: string\n    email: string\n    role: Role\n    consultantTag: string\n    includeInAttendance: boolean\n    active: boolean\n  }>(null)\n\n  const [diag, setDiag]`,
  },
  {
    label: "edit handlers",
    from: `  const excluir = async (u: ManagedUser) => {`,
    to: `  const abrirEdicao = (u: ManagedUser) => {\n    setFeedback(null)\n    setEdicao({\n      id: u.id,\n      fullName: u.full_name,\n      email: u.email,\n      role: u.role,\n      consultantTag: u.consultant_tag || "",\n      includeInAttendance: u.attendance_enabled,\n      active: u.active,\n    })\n  }\n\n  const salvarEdicao = async (e: React.FormEvent) => {\n    e.preventDefault()\n    if (!edicao) return\n    setOcupado(edicao.id)\n    const r = await updateManagedUser({\n      userId: edicao.id,\n      fullName: edicao.fullName,\n      email: edicao.email,\n      role: edicao.role,\n      consultantTag: edicao.consultantTag,\n      includeInAttendance: edicao.includeInAttendance,\n    })\n    mostrar(r)\n    if (r.ok) {\n      setEdicao(null)\n      await carregar()\n    }\n    setOcupado(null)\n  }\n\n  const excluir = async (u: ManagedUser) => {`,
  },
  {
    label: "edit button",
    from: `<div className="flex flex-wrap justify-end gap-1.5">\n                      <button type="button" className={btnNeutro} disabled={busy || u.id === perfil.id} onClick={() => acao(u.id, () => setActive(u.id, !u.active))}>`,
    to: `<div className="flex flex-wrap justify-end gap-1.5">\n                      <button type="button" className={btnNeutro} disabled={busy || (!ehAdministrador && u.role === "gerente")} onClick={() => abrirEdicao(u)}>Editar</button>\n                      <button type="button" className={btnNeutro} disabled={busy || u.id === perfil.id} onClick={() => acao(u.id, () => setActive(u.id, !u.active))}>`,
  },
  {
    label: "edit modal",
    from: `      {ehAdministrador && (\n        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3">`,
    to: `      {edicao && (\n        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="editar-usuario-titulo">\n          <form onSubmit={salvarEdicao} className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">\n            <div className="flex items-start justify-between gap-4">\n              <div>\n                <h4 id="editar-usuario-titulo" className="text-base font-semibold text-slate-900">Editar usuário</h4>\n                <p className="mt-1 text-xs text-slate-500">Atualize cadastro, nome operacional e acesso sem perder o histórico do CRM.</p>\n              </div>\n              <button type="button" className="rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEdicao(null)} disabled={ocupado === edicao.id} aria-label="Fechar">×</button>\n            </div>\n\n            <div className="mt-5 grid gap-4 sm:grid-cols-2">\n              <label className="flex flex-col gap-1.5">\n                <span className="text-xs font-medium text-slate-700">Nome completo</span>\n                <input className={input} value={edicao.fullName} onChange={(e) => setEdicao({ ...edicao, fullName: e.target.value })} required />\n              </label>\n              <label className="flex flex-col gap-1.5">\n                <span className="text-xs font-medium text-slate-700">Nome no CRM (Tag)</span>\n                <input className={input} value={edicao.consultantTag} onChange={(e) => setEdicao({ ...edicao, consultantTag: e.target.value })} placeholder="Ex.: Madu, Junior França" />\n                <span className="text-[11px] text-slate-400">É o nome exibido em filtros, responsáveis, agendas e registros.</span>\n              </label>\n              <label className="flex flex-col gap-1.5">\n                <span className="text-xs font-medium text-slate-700">E-mail corporativo</span>\n                <input className={input} type="email" value={edicao.email} onChange={(e) => setEdicao({ ...edicao, email: e.target.value })} required />\n                <span className="text-[11px] text-slate-400">Também é usado no login, recuperação de senha e convites de calendário.</span>\n              </label>\n              <label className="flex flex-col gap-1.5">\n                <span className="text-xs font-medium text-slate-700">Perfil de acesso</span>\n                <select\n                  className={input}\n                  value={edicao.role}\n                  disabled={edicao.id === perfil.id || (!ehAdministrador && edicao.role === "gerente")}\n                  onChange={(e) => setEdicao({ ...edicao, role: e.target.value as Role })}\n                >\n                  <option value="consultor_b2b">{rotuloRole("consultor_b2b")}</option>\n                  <option value="high_school">{rotuloRole("high_school")}</option>\n                  <option value="supervisor">{rotuloRole("supervisor")}</option>\n                  {ehAdministrador && <option value="gerente">{rotuloRole("gerente")}</option>}\n                </select>\n                {edicao.id === perfil.id && <span className="text-[11px] text-amber-600">Seu próprio perfil de acesso não pode ser alterado aqui.</span>}\n              </label>\n            </div>\n\n            <label className={\`mt-4 flex items-center gap-3 rounded-lg border px-3 py-3 text-sm \${edicao.active ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800"}\`}>\n              <input\n                type="checkbox"\n                checked={edicao.includeInAttendance}\n                disabled={!edicao.active}\n                onChange={(e) => setEdicao({ ...edicao, includeInAttendance: e.target.checked })}\n                className="h-4 w-4 accent-[#88005b]"\n              />\n              <span>\n                <span className="font-medium">Incluir no Atendimento</span>\n                <span className="ml-1 text-xs opacity-75">— deixa o usuário disponível para a escala operacional.</span>\n              </span>\n            </label>\n\n            {!edicao.active && (\n              <p className="mt-2 text-[11px] text-amber-700">Este usuário está desativado. Ative-o na tabela antes de incluí-lo novamente no Atendimento.</p>\n            )}\n\n            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">\n              <button type="button" className={btnNeutro} disabled={ocupado === edicao.id} onClick={() => setEdicao(null)}>Cancelar</button>\n              <button type="submit" className={btn} disabled={ocupado === edicao.id}>{ocupado === edicao.id ? "Salvando…" : "Salvar alterações"}</button>\n            </div>\n          </form>\n        </div>\n      )}\n\n      {ehAdministrador && (\n        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3">`,
  },
])

console.log("[user-edit] patches aplicados")
