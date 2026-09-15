import fs from "node:fs"

function patchFile(path, patches) {
  let source = fs.readFileSync(path, "utf8")
  for (const { label, from, to } of patches) {
    if (source.includes(to)) continue
    if (!source.includes(from)) throw new Error(`[attendance] Trecho não encontrado em ${path}: ${label}`)
    source = source.replace(from, to)
  }
  fs.writeFileSync(path, source)
}

patchFile("components/attendance/attendance-board.tsx", [
  {
    label: "tipar callback de reload da prévia",
    from: `onReload={async (start, end) => { setAnchor(start); const fresh = await loadAttendanceRange({ start, end }); setData(fresh) }}`,
    to: `onReload={async (start: string, end: string) => { setAnchor(start); const fresh = await loadAttendanceRange({ start, end }); setData(fresh) }}`,
  },
  {
    label: "tipar callback novo compromisso",
    from: `onSave={(payload) => action(() => saveOccurrence(payload), () => setModal(null))}`,
    to: `onSave={(payload: Parameters<typeof saveOccurrence>[0]) => action(() => saveOccurrence(payload), () => setModal(null))}`,
  },
  {
    label: "tipar callback edição",
    from: `onSave={(payload) => action(() => saveOccurrence(payload), () => setModal(null))} onCancel={() => action(() => cancelOccurrence(modal.edit.id), () => setModal(null))}`,
    to: `onSave={(payload: Parameters<typeof saveOccurrence>[0]) => action(() => saveOccurrence(payload), () => setModal(null))} onCancel={() => action(() => cancelOccurrence(modal.edit.id), () => setModal(null))}`,
  },
])

patchFile("components/crm-app.jsx", [
  {
    label: "equipe no formulário de atividade",
    from: `function FormAtividade({ empresa, aoSalvar, aoFechar }) {`,
    to: `function FormAtividade({ empresa, equipe, aoSalvar, aoFechar }) {`,
  },
  {
    label: "estado da agenda do próximo passo",
    from: `    observacao: "", proximaAcao: "", dataProximoContato: somarDias(hoje, 7),\n    leads: "", impactados: "", novaEtapa: empresa.etapa,\n  });`,
    to: `    observacao: "", proximaAcao: "", dataProximoContato: somarDias(hoje, 7),\n    proximoInicio: "09:00", proximoFim: "10:00", proximoLocal: "",\n    proximoResponsavelId: empresa.ownerId || (equipe.find((p) => p.nome === empresa.consultor)?.id || ""),\n    leads: "", impactados: "", novaEtapa: empresa.etapa,\n  });`,
  },
  {
    label: "validar agenda do próximo passo",
    from: `    if (d.data > hoje) return setErro("A data do contato não pode estar no futuro. Para agendar, use o campo de próximo passo.");\n    aoSalvar(d);`,
    to: `    if (d.data > hoje) return setErro("A data do contato não pode estar no futuro. Para agendar, use o campo de próximo passo.");\n    if (d.proximaAcao.trim()) {\n      if (!d.dataProximoContato) return setErro("Informe a data do próximo passo.");\n      if (!d.proximoResponsavelId) return setErro("Selecione o responsável pelo próximo passo para gerar o convite.");\n      if (!d.proximoInicio || !d.proximoFim) return setErro("Informe início e fim do próximo passo.");\n      if (d.proximoFim <= d.proximoInicio) return setErro("O horário final do próximo passo deve ser posterior ao inicial.");\n    }\n    aoSalvar(d);`,
  },
  {
    label: "campos de agenda B2B",
    from: `        <Campo rotulo="Quando" largura="sm:col-span-2"><input type="date" className={\`${inputBase} font-mono\`} value={d.dataProximoContato} onChange={set("dataProximoContato")} /></Campo>\n        <Campo rotulo="Leads gerados" largura="sm:col-span-3"><input type="number" className={\`${inputBase} font-mono\`} value={d.leads} onChange={set("leads")} /></Campo>`,
    to: `        <Campo rotulo="Quando" largura="sm:col-span-2"><input type="date" className={\`${inputBase} font-mono\`} value={d.dataProximoContato} onChange={set("dataProximoContato")} /></Campo>\n        <Campo rotulo="Início" largura="sm:col-span-2"><input type="time" className={\`${inputBase} font-mono\`} value={d.proximoInicio} onChange={set("proximoInicio")} /></Campo>\n        <Campo rotulo="Fim" largura="sm:col-span-2"><input type="time" className={\`${inputBase} font-mono\`} value={d.proximoFim} onChange={set("proximoFim")} /></Campo>\n        <Campo rotulo="Responsável pelo próximo passo" largura="sm:col-span-2">\n          <select className={inputBase} value={d.proximoResponsavelId} onChange={set("proximoResponsavelId")}>\n            <option value="">Selecione</option>\n            {equipe.filter((p) => p.id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}\n          </select>\n        </Campo>\n        <Campo rotulo="Local / link da reunião" largura="sm:col-span-6" dica="Com responsável, data e horário, o UniConecta gera o convite usando o e-mail cadastrado no usuário.">\n          <input className={inputBase} value={d.proximoLocal} onChange={set("proximoLocal")} placeholder="Ex.: Empresa XYZ, Teams ou UniMetrocamp" />\n        </Campo>\n        <Campo rotulo="Leads gerados" largura="sm:col-span-3"><input type="number" className={\`${inputBase} font-mono\`} value={d.leads} onChange={set("leads")} /></Campo>`,
  },
  {
    label: "salvar agenda atual da empresa",
    from: `      proximaAcao: d.proximaAcao, dataProximaAcao: d.proximaAcao ? d.dataProximoContato : "",\n    } : e));`,
    to: `      proximaAcao: d.proximaAcao, dataProximaAcao: d.proximaAcao ? d.dataProximoContato : "",\n      proximaAcaoInicio: d.proximaAcao ? d.proximoInicio : "",\n      proximaAcaoFim: d.proximaAcao ? d.proximoFim : "",\n      proximaAcaoLocal: d.proximaAcao ? d.proximoLocal : "",\n      proximaAcaoOwnerId: d.proximaAcao ? d.proximoResponsavelId : null,\n    } : e));`,
  },
  {
    label: "passar equipe para atividade",
    from: `<FormAtividade empresa={empresaAberta} aoSalvar={guardarAtividade} aoFechar={() => setRegistrando(false)} />`,
    to: `<FormAtividade empresa={empresaAberta} equipe={equipe} aoSalvar={guardarAtividade} aoFechar={() => setRegistrando(false)} />`,
  },
])

console.log("[attendance] patches aplicados")
