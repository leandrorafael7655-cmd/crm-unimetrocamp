"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Briefcase, Building2, CalendarClock, GitBranch, Users, Handshake,
  Plus, Search, Download, X, ArrowRight, AlertTriangle, Phone, Trash2, Pencil, RefreshCw,
  Copy, Check, Link2, GraduationCap
} from "lucide-react";
import { getStorage } from "@/lib/data/storage-context";
import { can, normalizeRole } from "@/lib/domain/roles";
import {
  CHAVES, ETAPAS, ETAPAS_ENCERRADAS, TODAS_ETAPAS, ETAPAS_CONVENIO, CLASSES,
  TIPOS_ATIVIDADE, SEGMENTOS, POTENCIAIS, CARGOS_CONTATO, STATUS_CONVENIO,
  EQUIPE_PADRAO, MARCA_PADRAO, CONFIG_PADRAO, CONVENIO_VAZIO, CORES_SAUDE,
} from "@/lib/domain/constants";
import {
  hojeISO, diffDias, brData, brDataLonga, somarDias, uid, num, meses,
  slug, soDigitos, mascaraCNPJ, cnpjValido, completarCNPJ,
} from "@/lib/domain/utils";
import { dadosExemplo } from "@/lib/domain/seed";
import {
  linkDaEmpresa, linkDefasado, linkAtivo, saudeConvenio, construirFila,
} from "@/lib/domain/pipeline";
import { PainelAnexos } from "@/components/anexos/painel-anexos";

/* Constantes de domínio, paleta e o convênio vazio vivem em lib/domain/constants.ts
   (fonte única). Antes eram redeclaradas aqui — a auditoria confirmou que eram
   idênticas byte a byte, então a duplicata foi removida. */

/* ─────────────────────────  utilidades  ───────────────────────── */

/* Utilidades puras (datas, uid, num, slug, CNPJ) vêm de lib/domain/utils.ts.
   Antes eram definidas aqui; foram extraídas para reuso no seed/mappers e para
   ganhar testes. chaveEmpresa fica aqui porque depende do formato de config. */

/* identificador da empresa dentro do link.
   CNPJ é o padrão porque não muda: nome fantasia editado depois quebraria
   a atribuição de todos os links já entregues ao RH. */
function chaveEmpresa(empresa, config) {
  if (!empresa) return "";
  const cnpj = soDigitos(empresa.cnpj);
  if ((!config || config.empresaChave !== "nome") && cnpj) return cnpj;
  return slug(empresa.nomeFantasia || empresa.razaoSocial);
}

/* link de inscrição (linkDaEmpresa/linkDefasado/linkAtivo), saúde do convênio e
   a fila de prioridade vivem em lib/domain/pipeline.ts (puras e testadas). */

/* gerador de SUGESTÃO, usado só para preencher o campo quando a instituição
   emite links por padrão. O valor que vale é sempre o cadastrado na empresa. */
function montarLink(config, consultorTag, empresa) {
  if (!config || !config.linkBase) return "";
  let bruto = config.linkBase.trim();
  if (!/^https?:\/\//i.test(bruto)) bruto = "https://" + bruto;
  try {
    const url = new URL(bruto);
    if (consultorTag) url.searchParams.set(config.paramConsultor || "consultor", consultorTag);
    if (empresa && config.incluirEmpresa) {
      url.searchParams.set(config.paramEmpresa || "empresa", chaveEmpresa(empresa, config));
    }
    if (config.utm) {
      url.searchParams.set("utm_source", "b2b");
      url.searchParams.set("utm_medium", "consultor");
      if (consultorTag) url.searchParams.set("utm_campaign", consultorTag);
    }
    return url.toString();
  } catch {
    return "";
  }
}

/* mensagem pronta para o consultor entregar o link ao RH */
function mensagemRH(empresa, consultorNome, link, contatoNome) {
  const nome = empresa.nomeFantasia || empresa.razaoSocial;
  const cv = empresa.convenio;
  const temConvenio = cv && cv.ativo && cv.status === "Ativo";
  const saudacao = contatoNome ? `Olá, ${contatoNome}!` : "Olá!";
  const linhas = [saudacao, ""];

  linhas.push(
    `Sou ${consultorNome}, da UniMetrocamp. Segue o link exclusivo de inscrição para os colaboradores da ${nome}:`,
    "", link || "[configure a URL de inscrição no sistema]", ""
  );

  if (temConvenio) {
    const partes = [];
    if (cv.percentual) partes.push(`${cv.percentual}% de desconto`);
    if (cv.cursos) partes.push(`em ${cv.cursos}`);
    if (cv.modalidades) partes.push(`(${cv.modalidades})`);
    if (partes.length) linhas.push(`Pelo convênio, os colaboradores têm ${partes.join(" ")}.`);
    if (cv.dependentes && cv.dependentes !== "Não") linhas.push(`O benefício também vale para dependentes: ${cv.dependentes.replace(/^Sim — /, "")}.`);
    linhas.push("");
  }

  linhas.push(
    "É importante que as inscrições sejam feitas por este link — é ele que identifica a empresa e garante que o benefício seja aplicado automaticamente.",
    "",
    "Se preferir, posso enviar um material pronto para divulgação interna (e-mail, mural ou grupo dos colaboradores).",
    "", "Fico à disposição.", consultorNome
  );
  return linhas.join("\n");
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

async function ler(chave, compartilhado, padrao) {
  try {
    const r = await getStorage().get(chave, compartilhado);
    return r && r.value ? JSON.parse(r.value) : padrao;
  } catch { return padrao; }
}
async function gravar(chave, valor, compartilhado) {
  try {
    await getStorage().set(chave, JSON.stringify(valor), compartilhado);
    return true;
  } catch { return false; }
}

/* ─────────────────────────  tema da marca  ───────────────────────── */

const hexValido = (v) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test((v || "").trim());

function hexParaHsl(hex) {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hu = 0;
  if (d) {
    if (mx === r) hu = ((g - b) / d) % 6;
    else if (mx === g) hu = (b - r) / d + 2;
    else hu = (r - g) / d + 4;
    hu *= 60; if (hu < 0) hu += 360;
  }
  const l = (mx + mn) / 2;
  const sa = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hu, s: sa * 100, l: l * 100 };
}

function hslParaHex(h, s, l) {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const f = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + f(r) + f(g) + f(b);
}

/* rampa completa: famílias separadas porque menta não é um tom claro de magenta */
function rampa(cfg) {
  const c = { ...MARCA_PADRAO, ...(cfg || {}) };
  const cor = (v, padrao) => (hexValido(v) ? (v.startsWith("#") ? v : "#" + v) : padrao);
  const pri = cor(c.corPrimaria, MARCA_PADRAO.corPrimaria);
  const rail = cor(c.corRail, MARCA_PADRAO.corRail);
  const suave = cor(c.corSuave, MARCA_PADRAO.corSuave);
  const alerta = cor(c.corAlerta, MARCA_PADRAO.corAlerta);
  const atencao = cor(c.corAtencao, MARCA_PADRAO.corAtencao);

  const p = hexParaHsl(pri), r = hexParaHsl(rail), v = hexParaHsl(suave);
  const a = hexParaHsl(alerta), t = hexParaHsl(atencao);

  return {
    /* menta: fundos leves, bordas e texto sobre o escuro */
    m50: hslParaHex(v.h, Math.min(v.s, 90), Math.max(v.l, 93)),
    m200: hslParaHex(v.h, Math.min(v.s, 72), Math.max(v.l - 12, 62)),
    m300: hslParaHex(v.h, Math.min(v.s, 70), Math.max(v.l - 22, 52)),
    m400: suave,
    /* magenta: interação */
    m500: hslParaHex(p.h, p.s, Math.min(p.l + 18, 58)),
    m600: hslParaHex(p.h, p.s, Math.min(p.l + 10, 50)),
    m700: pri,
    m800: hslParaHex(p.h, p.s, Math.max(p.l - 8, 10)),
    /* verde profundo: menu e cabeçalhos */
    rail, rail2: hslParaHex(r.h, r.s, Math.min(r.l + 7, 26)),
    rail3: hslParaHex(r.h, Math.max(r.s - 30, 20), Math.min(r.l + 13, 32)),
    /* vermelho: crítico */
    a50: hslParaHex(a.h, Math.min(a.s, 95), 95),
    a100: hslParaHex(a.h, Math.min(a.s, 95), 90),
    a200: hslParaHex(a.h, Math.min(a.s, 90), 84),
    a300: hslParaHex(a.h, Math.min(a.s, 90), 74),
    a400: hslParaHex(a.h, a.s, 64),
    a600: alerta,
    a700: hslParaHex(a.h, a.s, Math.max(a.l - 14, 26)),
    a800: hslParaHex(a.h, a.s, Math.max(a.l - 22, 22)),
    a900: hslParaHex(a.h, a.s, Math.max(a.l - 30, 18)),
    /* âmbar: atenção e classificação Ouro */
    t50: hslParaHex(t.h, Math.min(t.s, 95), 94),
    t100: hslParaHex(t.h, Math.min(t.s, 95), 88),
    t200: hslParaHex(t.h, Math.min(t.s, 92), 80),
    t300: hslParaHex(t.h, Math.min(t.s, 92), 70),
    t500: atencao,
    t800: hslParaHex(t.h, Math.min(t.s + 5, 100), Math.max(t.l - 32, 20)),
    t900: hslParaHex(t.h, Math.min(t.s + 5, 100), Math.max(t.l - 38, 16)),
  };
}

/* remapeia as classes utilitárias para a paleta da marca,
   sem reescrever as centenas de usos espalhados pelo app */
function Tema({ config }) {
  const c = rampa(config);
  const vars = Object.entries(c).map(([k, v]) => `--${k}:${v}`).join(";");
  const css = `
:root{${vars}}
.bg-teal-700{background-color:var(--m700)!important}
.bg-teal-50{background-color:var(--m50)!important}
.text-teal-700{color:var(--m700)!important}
.text-teal-800{color:var(--m800)!important}
.text-teal-400{color:var(--m400)!important}
.border-teal-200{border-color:var(--m200)!important}
.border-teal-300{border-color:var(--m300)!important}
.hover\:bg-teal-800:hover{background-color:var(--m800)!important}
.hover\:bg-teal-50:hover{background-color:var(--m50)!important}
.hover\:border-teal-500:hover{border-color:var(--m500)!important}
.hover\:border-teal-600:hover{border-color:var(--m600)!important}
.hover\:text-teal-700:hover{color:var(--m700)!important}
.hover\:text-teal-800:hover{color:var(--m800)!important}
.group:hover .group-hover\:text-teal-700{color:var(--m700)!important}
.group:hover .group-hover\:bg-teal-600{background-color:var(--m600)!important}
.focus\:border-teal-600:focus{border-color:var(--m600)!important}
.focus\:ring-teal-600\/20:focus{--tw-ring-color:var(--m300)!important}
.focus\:ring-teal-600\/40:focus{--tw-ring-color:var(--m400)!important}
.bg-slate-900{background-color:var(--rail)!important}
.bg-slate-800{background-color:var(--rail2)!important}
.hover\:bg-slate-800:hover{background-color:var(--rail2)!important}
.border-slate-800{border-color:var(--rail3)!important}
.bg-rose-50{background-color:var(--a50)!important}
.bg-rose-100{background-color:var(--a100)!important}
.bg-rose-600{background-color:var(--a600)!important}
.hover\:bg-rose-50:hover{background-color:var(--a50)!important}
.hover\:bg-rose-100:hover{background-color:var(--a100)!important}
.border-rose-200{border-color:var(--a200)!important}
.border-rose-300{border-color:var(--a300)!important}
.border-rose-400{border-color:var(--a400)!important}
.text-rose-300{color:var(--a300)!important}
.text-rose-400{color:var(--a400)!important}
.text-rose-600{color:var(--a700)!important}
.text-rose-700{color:var(--a700)!important}
.text-rose-800{color:var(--a800)!important}
.text-rose-900{color:var(--a900)!important}
.hover\:text-rose-600:hover{color:var(--a700)!important}
.bg-amber-50{background-color:var(--t50)!important}
.bg-amber-100{background-color:var(--t100)!important}
.bg-amber-500{background-color:var(--t500)!important}
.border-amber-200{border-color:var(--t200)!important}
.border-amber-300{border-color:var(--t300)!important}
.text-amber-300{color:var(--t300)!important}
.text-amber-800{color:var(--t800)!important}
.text-amber-900{color:var(--t900)!important}
`;
  return <style>{css}</style>;
}

function CampoCor({ rotulo, valor, padrao, dica, aoMudar }) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <div className="flex items-center gap-2">
        <input type="color" value={hexValido(valor) ? valor : padrao} onChange={(e) => aoMudar(e.target.value)}
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
        <input className={`${inputBase} font-mono text-xs uppercase`} value={valor || ""}
          onChange={(e) => aoMudar(e.target.value)} placeholder={padrao} />
      </div>
    </Campo>
  );
}

/* marca no topo: logo oficial quando informado, tipografia quando não */
function Marca({ config, escuro }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [config.logoUrl]);
  if (config.logoUrl && !falhou) {
    return <img src={config.logoUrl} alt={config.nomeUnidade} onError={() => setFalhou(true)}
      className="h-8 w-auto max-w-[170px] object-contain object-left" />;
  }
  return (
    <div>
      <p className={`font-mono text-[10px] uppercase tracking-widest ${escuro ? "text-teal-400" : "text-teal-700"}`}>
        {config.nomeUnidade || MARCA_PADRAO.nomeUnidade}
      </p>
      <p className={`text-sm font-semibold ${escuro ? "text-white" : "text-slate-900"}`}>Comercial B2B</p>
    </div>
  );
}

/* ─────────────────────────  peças de interface  ───────────────────────── */

function Chip({ texto, classe }) {
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight ${classe}`}>{texto}</span>;
}
function ChipClasse({ valor }) {
  return <Chip texto={valor} classe={(CLASSES[valor] || CLASSES.Mapeada).chip} />;
}
function Campo({ rotulo, children, dica, largura = "" }) {
  return (
    <label className={`block ${largura}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-slate-500">{dica}</span>}
    </label>
  );
}
const inputBase =
  "w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:bg-slate-100";

function Modal({ titulo, subtitulo, aoFechar, children, largo = false }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <div className={`w-full ${largo ? "max-w-5xl" : "max-w-2xl"} rounded-lg bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Botao({ children, onClick, tipo = "primario", tamanho = "md", ...resto }) {
  const estilos = {
    primario: "bg-teal-700 text-white hover:bg-teal-800",
    neutro: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    perigo: "border border-rose-300 bg-white text-rose-700 hover:bg-rose-50",
  };
  const tam = tamanho === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-600/40 ${estilos[tipo]} ${tam}`} {...resto}>
      {children}
    </button>
  );
}

/* caixa do link tagueado, com cópia */
function CaixaLink({ link, rotulo = "Link de inscrição tagueado", aviso }) {
  const [copiado, setCopiado] = useState(false);
  if (!link) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
        <p className="mt-0.5 text-xs text-slate-500">{aviso || "Link de inscrição ainda não configurado."}</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-teal-200 bg-teal-50 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
        <Link2 className="h-3 w-3" />{rotulo}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded border border-teal-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700" />
        <button
          onClick={async () => { const ok = await copiar(link); setCopiado(ok); setTimeout(() => setCopiado(false), 2000); }}
          className="inline-flex shrink-0 items-center gap-1 rounded bg-teal-700 px-2 py-1 text-xs font-medium text-white hover:bg-teal-800"
        >
          {copiado ? <><Check className="h-3 w-3" />Copiado</> : <><Copy className="h-3 w-3" />Copiar</>}
        </button>
      </div>
    </div>
  );
}

/* botão de cópia compacto, para tabelas */
function CopiarMini({ texto, titulo }) {
  const [ok, setOk] = useState(false);
  if (!texto) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <button
      title={titulo || "Copiar link"}
      onClick={async (ev) => { ev.stopPropagation(); const r = await copiar(texto); setOk(r); setTimeout(() => setOk(false), 1500); }}
      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-teal-700"
    >
      {ok ? <Check className="h-3.5 w-3.5 text-teal-700" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* mensagem pronta para entregar ao RH */
function MensagemRH({ empresa, consultorNome, link, semConvenio }) {
  const [aberto, setAberto] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [copiado, setCopiado] = useState(false);
  const decisor = (empresa.contatos || []).find((c) => c.papel === "Decisor" || c.papel === "RH");
  const texto = mensagemRH(empresa, consultorNome, link, destinatario || (decisor && decisor.nome.split(" ")[0]));

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-teal-700 transition hover:border-teal-500 hover:bg-teal-50">
        Gerar mensagem para o RH →
      </button>
    );
  }
  return (
    <div className="rounded border border-slate-300 bg-white p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mensagem para o RH</p>
        <button onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input className={`${inputBase} mt-1.5 text-xs`} placeholder="Primeiro nome de quem vai receber (opcional)"
        value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
      {semConvenio && (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          Sem convênio cadastrado, a mensagem sai sem desconto nem cursos. Cadastre o convênio para o texto ficar completo.
        </p>
      )}
      <textarea readOnly rows={10} value={texto}
        className="mt-1.5 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-700" />
      <div className="mt-1.5 flex justify-end">
        <Botao tamanho="sm" onClick={async () => { const r = await copiar(texto); setCopiado(r); setTimeout(() => setCopiado(false), 2000); }}>
          {copiado ? <><Check className="h-3 w-3" />Copiado</> : <><Copy className="h-3 w-3" />Copiar mensagem</>}
        </Botao>
      </div>
    </div>
  );
}

/* bloco do link: cada consultor cadastra o seu link para cada empresa da carteira */
function BlocoLinkEmpresa({ empresa, config, consultorTag, aoSalvarLink }) {
  const bruto = linkDaEmpresa(empresa);
  const defasado = linkDefasado(empresa);
  const ativo = defasado ? "" : bruto;
  const [editando, setEditando] = useState(!ativo);
  const [valor, setValor] = useState(ativo);
  const [copiado, setCopiado] = useState(false);
  const sugestao = montarLink(config, consultorTag, empresa);

  useEffect(() => {
    const d = linkDefasado(empresa);
    const a = d ? "" : linkDaEmpresa(empresa);
    setValor(a);
    setEditando(!a);
  }, [empresa.id, empresa.linkInscricao, empresa.linkConsultor, empresa.consultor]);

  if (!editando && ativo) {
    return (
      <div className="rounded border border-teal-200 bg-teal-50 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
            <Link2 className="h-3 w-3" />Link de {empresa.consultor} para esta empresa
          </p>
          <button onClick={() => setEditando(true)} className="text-[11px] font-medium text-teal-700 hover:underline">alterar</button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input readOnly value={ativo} onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded border border-teal-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700" />
          <button
            onClick={async () => { const ok = await copiar(ativo); setCopiado(ok); setTimeout(() => setCopiado(false), 2000); }}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-teal-700 px-2 py-1 text-xs font-medium text-white hover:bg-teal-800">
            {copiado ? <><Check className="h-3 w-3" />Copiado</> : <><Copy className="h-3 w-3" />Copiar</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded border px-2.5 py-2 ${defasado ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${defasado ? "text-rose-800" : "text-slate-600"}`}>
        {defasado ? "Link precisa ser refeito" : "Link de inscrição desta empresa"}
      </p>

      {defasado ? (
        <>
          <p className="mt-0.5 text-[11px] text-rose-800">
            O link cadastrado é de <span className="font-medium">{empresa.linkConsultor}</span>, que não atende mais esta conta.
            Enquanto ele estiver circulando no RH, as inscrições continuam sendo atribuídas a {empresa.linkConsultor}.
            Cadastre o seu link e reavise o RH — trocar aqui não troca o que já foi divulgado lá dentro.
          </p>
          <p className="mt-1.5 break-all rounded border border-rose-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-400 line-through">
            {bruto}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Cole o seu link de inscrição para esta empresa. É ele que o RH divulga e que faz a matrícula
          chegar atribuída a você.
        </p>
      )}

      <input className={`${inputBase} mt-1.5 font-mono text-xs`} value={valor} onChange={(e) => setValor(e.target.value)}
        placeholder="https://inscricao.unimetrocamp.com.br/..." />
      {sugestao && !valor && (
        <button onClick={() => setValor(sugestao)} className="mt-1.5 block text-left text-[11px] font-medium text-teal-700 hover:underline">
          Usar o padrão configurado: <span className="font-mono">{sugestao.slice(0, 55)}{sugestao.length > 55 ? "…" : ""}</span>
        </button>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {ativo && <Botao tamanho="sm" tipo="neutro" onClick={() => { setValor(ativo); setEditando(false); }}>Cancelar</Botao>}
        <Botao tamanho="sm" onClick={() => { aoSalvarLink(valor.trim()); setEditando(false); }}>
          {defasado ? "Salvar meu link" : "Salvar link"}
        </Botao>
      </div>
    </div>
  );
}

/* ────────────��──����─────────  fila de prioridade  ───────────────────────── */


const CORES_NIVEL = {
  critico: { barra: "bg-rose-600", texto: "text-rose-700", fundo: "bg-rose-50" },
  hoje: { barra: "bg-amber-500", texto: "text-amber-800", fundo: "bg-amber-50" },
  atencao: { barra: "bg-slate-400", texto: "text-slate-600", fundo: "bg-white" },
};

function FilaDoDia({ fila, aoAbrir, escopo }) {
  const [expandido, setExpandido] = useState(false);
  const visiveis = expandido ? fila : fila.slice(0, 8);
  const criticos = fila.filter((i) => i.nivel === "critico").length;
  const paraHoje = fila.filter((i) => i.nivel === "hoje").length;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Fila de hoje</h2>
          <p className="text-xs text-slate-400">{escopo}</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
          <span className="text-rose-300">{criticos} crítico{criticos === 1 ? "" : "s"}</span>
          <span className="text-amber-300">{paraHoje} para hoje</span>
          <span className="text-slate-400">{fila.length} no total</span>
        </div>
      </header>
      {fila.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Nenhuma conta pedindo atenção agora. Toda empresa da carteira tem próximo passo em dia.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visiveis.map((item) => {
            const c = CORES_NIVEL[item.nivel];
            return (
              <li key={item.empresa.id}>
                <button onClick={() => aoAbrir(item.empresa.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 ${c.fundo}`}>
                  <span className={`h-9 w-1 shrink-0 rounded-full ${c.barra}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{item.empresa.nomeFantasia || item.empresa.razaoSocial}</span>
                      <ChipClasse valor={item.empresa.classificacao} />
                    </span>
                    <span className={`mt-0.5 block truncate text-xs ${c.texto}`}>{item.motivos.join(" · ")}</span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="block text-xs font-medium text-slate-700">{item.empresa.consultor}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{item.empresa.etapa}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {fila.length > 8 && (
        <button onClick={() => setExpandido(!expandido)} className="w-full border-t border-slate-100 py-2 text-xs font-medium text-teal-700 hover:bg-slate-50">
          {expandido ? "Mostrar menos" : `Ver as outras ${fila.length - 8}`}
        </button>
      )}
    </section>
  );
}

/* ─────────────────────────  consulta: de quem é a empresa  ───────────────────────── */

function Consulta({ empresas, equipe, config, usuario, aoAbrir, aoCadastrar }) {
  const [busca, setBusca] = useState("");
  const hoje = hojeISO();
  const q = busca.trim().toLowerCase();
  const qd = soDigitos(busca);

  const achados = useMemo(() => {
    if (q.length < 2 && qd.length < 3) return [];
    return empresas.filter((e) => {
      if (qd.length >= 3 && soDigitos(e.cnpj).includes(qd)) return true;
      return `${e.razaoSocial} ${e.nomeFantasia} ${e.cidade}`.toLowerCase().includes(q);
    }).slice(0, 20);
  }, [empresas, q, qd]);

  const buscou = q.length >= 2 || qd.length >= 3;

  return (
    <div className="max-w-3xl space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">De quem é esta empresa?</h2>
        <p className="mt-1 text-xs text-slate-600">
          Busca em toda a operação, não só na sua carteira. Antes de prospectar, confira aqui se a conta
          já tem dono — e pegue o link tagueado do consultor responsável para encaminhar o contato.
        </p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={`${inputBase} py-2 pl-8 text-base`}
            placeholder="CNPJ, razão social ou nome fantasia"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoFocus
          />
        </div>
      </section>

      {!buscou && (
        <p className="px-1 text-xs text-slate-500">Digite ao menos 3 dígitos do CNPJ ou 2 letras do nome.</p>
      )}

      {buscou && achados.length === 0 && (
        <section className="rounded-lg border border-dashed border-teal-300 bg-teal-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-slate-900">Nenhuma empresa encontrada</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
            Ninguém da equipe está trabalhando essa conta. Ela está livre para você cadastrar na sua carteira.
          </p>
          <div className="mt-3">
            <Botao tamanho="sm" onClick={aoCadastrar}><Plus className="h-3 w-3" />Cadastrar na minha carteira</Botao>
          </div>
        </section>
      )}

      {achados.map((e) => {
        const dono = equipe.find((p) => p.nome === e.consultor);
        const link = linkAtivo(e);
        const sem = diffDias(e.ultimoContato, hoje);
        const meu = usuario.nome === e.consultor;
        const cv = e.convenio;
        return (
          <section key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{e.nomeFantasia || e.razaoSocial}</h3>
                <p className="font-mono text-[11px] text-slate-500">
                  {e.cnpj || "sem CNPJ"} · {e.cidade} · {e.segmento}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ChipClasse valor={e.classificacao} />
                {cv && cv.ativo && cv.status === "Ativo" && <Chip texto="Conveniada" classe="bg-teal-50 text-teal-800 border-teal-200" />}
              </div>
            </div>

            <div className={`mt-3 rounded border px-3 py-2 ${meu ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Consultor responsável</p>
              <p className="text-sm font-semibold text-slate-900">
                {e.consultor}{meu && <span className="ml-1.5 text-xs font-normal text-teal-700">— é você</span>}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                tag: {dono && dono.tag ? dono.tag : "não definida"} · etapa: {e.etapa} ·
                {e.ultimoContato ? ` último contato há ${sem}d` : " nunca contatada"}
              </p>
            </div>

            <div className="mt-2">
              <CaixaLink
                link={link}
                rotulo={`Link de inscrição de ${e.nomeFantasia || e.razaoSocial}`}
                aviso={linkDefasado(e)
                  ? `O link cadastrado ainda é de ${e.linkConsultor}, que não atende mais esta conta. ${e.consultor} precisa cadastrar o dele.`
                  : "Esta empresa ainda não tem link de inscrição cadastrado."}
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Botao tamanho="sm" tipo="neutro" onClick={() => aoAbrir(e.id)}>
                {meu ? "Abrir ficha" : "Ver ficha"}<ArrowRight className="h-3 w-3" />
              </Botao>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ─────────────────────────  painel  ───────────────────────── */

function Indicador({ rotulo, valor, detalhe, alerta }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${alerta ? "text-rose-700" : "text-slate-900"}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

function Painel({ empresas, atividades, equipe, fila, aoAbrir, escopo, aoIrPara }) {
  const hoje = hojeISO();
  const inicioMes = hoje.slice(0, 8) + "01";
  const conveniadas = empresas.filter((e) => e.convenio && e.convenio.ativo && e.convenio.status !== "Encerrado");
  const semMatricula = conveniadas.filter((e) => saudeConvenio(e, hoje).nivel === "vazio").length;
  const negociacao = empresas.filter((e) => ["Reunião agendada", "Diagnóstico realizado", "Proposta enviada", "Formalização"].includes(e.etapa)).length;
  const paradas = empresas.filter((e) => { const d = diffDias(e.ultimoContato, hoje); return d === null || d > 30; }).length;
  const atividadesMes = atividades.filter((a) => a.data >= inicioMes).length;
  const leadsMes = atividades.filter((a) => a.data >= inicioMes).reduce((s, a) => s + num(a.leads), 0);
  const matriculas = conveniadas.reduce((s, e) => s + num(e.convenio.matriculasAcademicas), 0);

  const porEtapa = ETAPAS.map((et) => ({ etapa: et, total: empresas.filter((e) => e.etapa === et).length }));
  const maxEtapa = Math.max(1, ...porEtapa.map((p) => p.total));

  const ranking = equipe
    .filter((p) => p.papel === "Consultor")
    .map((p) => {
      const carteira = empresas.filter((e) => e.consultor === p.nome);
      return {
        nome: p.nome,
        carteira: carteira.length,
        conveniadas: carteira.filter((e) => e.convenio && e.convenio.ativo && e.convenio.status !== "Encerrado").length,
        matriculas: carteira.reduce((s, e) => s + (e.convenio ? num(e.convenio.matriculasAcademicas) : 0), 0),
        atividades: atividades.filter((a) => a.consultor === p.nome && a.data >= inicioMes).length,
      };
    })
    .sort((a, b) => b.matriculas - a.matriculas || b.conveniadas - a.conveniadas);

  return (
    <div className="space-y-4">
      <FilaDoDia fila={fila} aoAbrir={aoAbrir} escopo={escopo} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Indicador rotulo="Empresas" valor={empresas.length} detalhe="na carteira" />
        <Indicador rotulo="Conveniadas" valor={conveniadas.length} detalhe="convênio vigente" />
        <Indicador rotulo="Sem matrícula" valor={semMatricula} detalhe="conveniadas há +90 dias" alerta={semMatricula > 0} />
        <Indicador rotulo="Matrículas" valor={matriculas} detalhe="acadêmicas via convênio" />
        <Indicador rotulo="Paradas" valor={paradas} detalhe="+30 dias sem contato" alerta={paradas > 0} />
        <Indicador rotulo="No mês" valor={atividadesMes} detalhe={`${leadsMes} leads · ${negociacao} em negociação`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
          <h3 className="text-sm font-semibold text-slate-900">Funil B2B</h3>
          <p className="mb-3 text-[11px] text-slate-500">Conveniada e Relacionamento ativo continuam na carteira do consultor.</p>
          <ul className="space-y-1.5">
            {porEtapa.map((p) => (
              <li key={p.etapa}>
                <button onClick={() => aoIrPara("empresas", { etapa: p.etapa })} className="group flex w-full items-center gap-3 text-left">
                  <span className="w-40 shrink-0 truncate text-xs text-slate-600 group-hover:text-teal-700">{p.etapa}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded-sm bg-slate-100">
                    <span className="block h-full rounded-sm bg-teal-700 transition-all group-hover:bg-teal-600" style={{ width: `${(p.total / maxEtapa) * 100}%` }} />
                  </span>
                  <span className="w-7 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-slate-700">{p.total}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Consultores</h3>
          <p className="mb-3 text-[11px] text-slate-500">Ordenado por matrículas geradas, não por atividade.</p>
          {ranking.length === 0 ? (
            <p className="text-xs text-slate-500">Cadastre consultores em Equipe.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-1.5 text-left font-semibold">Consultor</th>
                  <th className="pb-1.5 text-right font-semibold">Cart.</th>
                  <th className="pb-1.5 text-right font-semibold">Ativ.</th>
                  <th className="pb-1.5 text-right font-semibold">Conv.</th>
                  <th className="pb-1.5 text-right font-semibold">Matr.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranking.map((r) => (
                  <tr key={r.nome}>
                    <td className="py-1.5 pr-2 text-slate-800">{r.nome}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-600">{r.carteira}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-600">{r.atividades}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-600">{r.conveniadas}</td>
                    <td className="py-1.5 text-right font-mono font-semibold tabular-nums text-teal-800">{r.matriculas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────  convênios (recorte da carteira)  ───────────────────────── */

function Convenios({ empresas, equipe, config, aoAbrir, aoCadastrar }) {
  const hoje = hojeISO();
  const comConvenio = empresas.filter((e) => e.convenio && e.convenio.ativo);
  const pendentes = empresas.filter((e) => ETAPAS_CONVENIO.includes(e.etapa) && !(e.convenio && e.convenio.ativo));
  const vigentes = comConvenio.filter((e) => e.convenio.status !== "Encerrado");
  const encerrados = comConvenio.filter((e) => e.convenio.status === "Encerrado");

  const totalMat = vigentes.reduce((s, e) => s + num(e.convenio.matriculasAcademicas), 0);
  const totalInsc = vigentes.reduce((s, e) => s + num(e.convenio.inscricoes), 0);
  const noPapel = vigentes.filter((e) => saudeConvenio(e, hoje).nivel === "vazio");
  const semLink = vigentes.filter((e) => !linkAtivo(e));
  const colabTotal = vigentes.reduce((s, e) => s + num(e.colaboradores), 0);
  const penMedia = colabTotal > 0 ? (totalMat / colabTotal) * 100 : null;

  /* o mais produtivo primeiro não ajuda; o que precisa de ação, sim */
  const peso = (e) => ({ vazio: 0, alerta: 1, novo: 2, ok: 3 }[saudeConvenio(e, hoje).nivel] ?? 4);
  const ordenados = [...vigentes].sort((a, b) => peso(a) - peso(b) || (a.convenio.dataInicio || "").localeCompare(b.convenio.dataInicio || ""));

  return (
    <div className="space-y-4">
      <p className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        Convênio não vence — vale enquanto não for encerrado. Empresa conveniada continua sendo empresa de
        carteira: ela aparece aqui <span className="font-medium text-slate-800">e</span> na carteira do consultor,
        e continua entrando na fila de contato como qualquer outra conta.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Indicador rotulo="Convênios vigentes" valor={vigentes.length} detalhe="ativos ou suspensos" />
        <Indicador rotulo="Sem link" valor={semLink.length} detalhe="matrículas não atribuídas" alerta={semLink.length > 0} />
        <Indicador rotulo="Sem matrícula" valor={noPapel.length} detalhe="assinados há +90 dias" alerta={noPapel.length > 0} />
        <Indicador rotulo="Inscrições" valor={totalInsc} detalhe="acumuladas" />
        <Indicador rotulo="Matrículas" valor={totalMat} detalhe="acadêmicas confirmadas" />
        <Indicador rotulo="Penetração média" valor={penMedia === null ? "—" : penMedia.toFixed(1) + "%"} detalhe="matrículas ÷ colaboradores" />
      </div>

      {noPapel.length > 0 && (
        <section className="rounded-lg border border-rose-300 bg-rose-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" />
            Convênio no papel: {noPapel.length} empresa{noPapel.length === 1 ? "" : "s"} sem nenhuma matrícula
          </h3>
          <p className="mt-1 text-xs text-rose-800">
            Como o convênio não expira, ele nunca cobra atenção sozinho — pode ficar anos parado sem ninguém notar.
            Assinado há mais de 90 dias e zero aluno quase sempre é falta de divulgação interna, não falta de interesse.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {noPapel.map((e) => {
              const div = e.convenio.ultimaDivulgacao;
              return (
                <li key={e.id}>
                  <button onClick={() => aoAbrir(e.id)} className="rounded border border-rose-400 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100">
                    {e.nomeFantasia || e.razaoSocial}
                    <span className="ml-1.5 font-mono text-[10px] text-rose-700">
                      {div ? `divulgado ${brData(div)}` : "nunca divulgado"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {semLink.length > 0 && (
        <section className="rounded-lg border border-rose-300 bg-rose-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" />
            {semLink.length} conveniada{semLink.length === 1 ? "" : "s"} sem link de inscrição
          </h3>
          <p className="mt-1 text-xs text-rose-800">
            Cada consultor tem o seu link para cada empresa. Sem link válido, o colaborador se inscreve pela
            página genérica e a matrícula não é atribuída a ninguém — ou, pior, continua sendo creditada ao
            consultor anterior. O aluno entra; o resultado se perde.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {semLink.map((e) => (
              <li key={e.id}>
                <button onClick={() => aoAbrir(e.id)} className="rounded border border-rose-400 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100">
                  {e.nomeFantasia || e.razaoSocial}
                  <span className="text-rose-600"> · {linkDefasado(e) ? `link ainda é de ${e.linkConsultor}` : "cadastrar link"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendentes.length > 0 && (
        <section className="rounded-lg border border-slate-300 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Aguardando cadastro do convênio</h3>
          <p className="mt-1 text-xs text-slate-600">
            Marcadas como conveniadas no funil, mas sem desconto, cursos e data de início registrados.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pendentes.map((e) => (
              <li key={e.id}>
                <button onClick={() => aoCadastrar(e.id)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:border-teal-600 hover:text-teal-800">
                  {e.nomeFantasia || e.razaoSocial} <span className="text-slate-400">· cadastrar</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ordenados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Handshake className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Nenhum convênio cadastrado</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Abra a ficha de uma empresa conveniada e use "cadastrar" no bloco de convênio.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                <th className="px-3 py-2 text-left font-semibold">Saúde</th>
                <th className="px-3 py-2 text-left font-semibold">Desde</th>
                <th className="px-3 py-2 text-right font-semibold">Desc.</th>
                <th className="px-3 py-2 text-right font-semibold">Inscr.</th>
                <th className="px-3 py-2 text-right font-semibold">Mat. fin.</th>
                <th className="px-3 py-2 text-right font-semibold">Mat. acad.</th>
                <th className="px-3 py-2 text-right font-semibold">Penetr.</th>
                <th className="px-3 py-2 text-left font-semibold">Últ. divulg.</th>
                <th className="px-3 py-2 text-center font-semibold">Link</th>
                <th className="px-3 py-2 text-left font-semibold">Consultor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordenados.map((e) => {
                const cv = e.convenio;
                const s = saudeConvenio(e, hoje);
                const colab = num(e.colaboradores);
                const pen = colab > 0 ? (num(cv.matriculasAcademicas) / colab) * 100 : null;
                const dono = equipe.find((p) => p.nome === e.consultor);
                return (
                  <tr key={e.id} onClick={() => aoAbrir(e.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-slate-900">{e.nomeFantasia || e.razaoSocial}</span>
                      <span className="block font-mono text-[11px] text-slate-400">{e.cidade} · {colab || "?"} colab.</span>
                    </td>
                    <td className="px-3 py-2">
                      <Chip texto={s.rotulo} classe={CORES_SAUDE[s.nivel]} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-600">
                      {brDataLonga(cv.dataInicio)}
                      <span className="block text-[10px] text-slate-400">{meses(s.idade)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-700">{cv.percentual ? cv.percentual + "%" : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600">{num(cv.inscricoes) || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600">{num(cv.matriculasFinanceiras) || "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums ${num(cv.matriculasAcademicas) > 0 ? "text-teal-800" : "text-rose-400"}`}>
                      {num(cv.matriculasAcademicas) || "0"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-500">{pen === null ? "—" : pen.toFixed(1) + "%"}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-500">{cv.ultimaDivulgacao ? brData(cv.ultimaDivulgacao) : "nunca"}</td>
                    <td className="px-3 py-2 text-center">
                      {linkAtivo(e)
                        ? <CopiarMini texto={linkAtivo(e)} titulo="Copiar link de inscrição desta empresa" />
                        : <span className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                            {linkDefasado(e) ? "defasado" : "falta"}
                          </span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{e.consultor}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {encerrados.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700">Encerrados <span className="font-mono text-xs font-normal text-slate-400">{encerrados.length}</span></h3>
          <ul className="flex flex-wrap gap-1.5">
            {encerrados.map((e) => (
              <li key={e.id}>
                <button onClick={() => aoAbrir(e.id)} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-slate-400">
                  {e.nomeFantasia || e.razaoSocial}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FormConvenio({ empresa, aoSalvar, aoFechar, aoEncerrar }) {
  const [d, setD] = useState({ ...CONVENIO_VAZIO, ...(empresa.convenio || {}) });
  const [erro, setErro] = useState("");
  const set = (k) => (ev) => setD({ ...d, [k]: ev.target.value });
  const salvar = () => {
    if (!d.dataInicio) return setErro("Informe a data de início. Como o convênio não tem vencimento, é ela que mede há quanto tempo ele existe sem gerar aluno.");
    if (d.dataInicio > hojeISO()) return setErro("A data de início não pode estar no futuro.");
    aoSalvar({ ...d, ativo: true });
  };
  return (
    <Modal titulo={empresa.convenio && empresa.convenio.ativo ? "Editar convênio" : "Cadastrar convênio"} subtitulo={empresa.nomeFantasia || empresa.razaoSocial} aoFechar={aoFechar} largo>
      <div className="grid gap-3 sm:grid-cols-6">
        <Campo rotulo="Assinado em" largura="sm:col-span-2" dica="Convênio vigora por prazo indeterminado.">
          <input type="date" className={`${inputBase} font-mono`} value={d.dataInicio} onChange={set("dataInicio")} />
        </Campo>
        <Campo rotulo="Status" largura="sm:col-span-2">
          <select className={inputBase} value={d.status} onChange={set("status")}>
            {STATUS_CONVENIO.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Desconto (%)" largura="sm:col-span-2">
          <input type="number" className={`${inputBase} font-mono`} value={d.percentual} onChange={set("percentual")} placeholder="Ex.: 25" />
        </Campo>
        <Campo rotulo="Modalidades" largura="sm:col-span-3">
          <select className={inputBase} value={d.modalidades} onChange={set("modalidades")}>
            <option>Presencial e EAD</option><option>Somente presencial</option><option>Somente EAD</option><option>Presencial, EAD e semipresencial</option>
          </select>
        </Campo>
        <Campo rotulo="Vale para dependentes?" largura="sm:col-span-3">
          <select className={inputBase} value={d.dependentes} onChange={set("dependentes")}>
            <option>Não</option><option>Sim — cônjuge e filhos</option><option>Sim — qualquer dependente legal</option>
          </select>
        </Campo>
        <Campo rotulo="Cursos contemplados" largura="sm:col-span-3">
          <input className={inputBase} value={d.cursos} onChange={set("cursos")} placeholder="Ex.: graduação e pós, exceto Medicina" />
        </Campo>
        <Campo rotulo="Responsável pela assinatura" largura="sm:col-span-3">
          <input className={inputBase} value={d.responsavelAssinatura} onChange={set("responsavelAssinatura")} placeholder="Nome e cargo" />
        </Campo>
        <Campo rotulo="Contrapartidas acordadas" largura="sm:col-span-3">
          <input className={inputBase} value={d.contrapartidas} onChange={set("contrapartidas")} placeholder="Ex.: 2 palestras/ano, espaço no mural" />
        </Campo>
        <Campo rotulo="Link do contrato" largura="sm:col-span-3">
          <input className={inputBase} value={d.contrato} onChange={set("contrato")} placeholder="Caminho na rede ou link do arquivo" />
        </Campo>

        <div className="sm:col-span-6 mt-1 border-t border-slate-200 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resultado gerado</p>
          <p className="mb-2 text-[11px] text-slate-500">
            Sem vencimento, este bloco é o único termômetro do convênio. Atualize a cada ciclo de captação.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo rotulo="Inscrições">
              <input type="number" className={`${inputBase} font-mono`} value={d.inscricoes} onChange={set("inscricoes")} />
            </Campo>
            <Campo rotulo="Matrículas financeiras">
              <input type="number" className={`${inputBase} font-mono`} value={d.matriculasFinanceiras} onChange={set("matriculasFinanceiras")} />
            </Campo>
            <Campo rotulo="Matrículas acadêmicas">
              <input type="number" className={`${inputBase} font-mono`} value={d.matriculasAcademicas} onChange={set("matriculasAcademicas")} />
            </Campo>
            <Campo rotulo="Última divulgação interna">
              <input type="date" className={`${inputBase} font-mono`} value={d.ultimaDivulgacao} onChange={set("ultimaDivulgacao")} />
            </Campo>
          </div>
        </div>

        <Campo rotulo="Observações do convênio" largura="sm:col-span-6">
          <textarea rows={2} className={inputBase} value={d.observacoes} onChange={set("observacoes")} />
        </Campo>
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
        {empresa.convenio && empresa.convenio.ativo && <Botao tipo="perigo" onClick={aoEncerrar}>Remover convênio</Botao>}
        <span className="flex-1" />
        <Botao tipo="neutro" onClick={aoFechar}>Cancelar</Botao>
        <Botao onClick={salvar}>Salvar convênio</Botao>
      </div>
    </Modal>
  );
}

/* ─────────────────────────  tabela de empresas  ───────────────────────── */

function TabelaEmpresas({ empresas, aoAbrir, hoje }) {
  if (empresas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <Building2 className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Nenhuma empresa com esses filtros</p>
        <p className="mt-1 text-xs text-slate-500">Ajuste os filtros ou cadastre uma nova empresa.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left font-semibold">Empresa</th>
            <th className="px-3 py-2 text-left font-semibold">Classificação</th>
            <th className="px-3 py-2 text-left font-semibold">Etapa</th>
            <th className="px-3 py-2 text-left font-semibold">Últ. contato</th>
            <th className="px-3 py-2 text-left font-semibold">Próxima ação</th>
            <th className="px-3 py-2 text-left font-semibold">Pot.</th>
            <th className="px-3 py-2 text-left font-semibold">Consultor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empresas.map((e) => {
            const sem = diffDias(e.ultimoContato, hoje);
            const atraso = e.dataProximaAcao ? diffDias(e.dataProximaAcao, hoje) : null;
            const conv = e.convenio && e.convenio.ativo && e.convenio.status !== "Encerrado";
            return (
              <tr key={e.id} onClick={() => aoAbrir(e.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900">{e.nomeFantasia || e.razaoSocial}</span>
                    {conv && <Handshake className="h-3.5 w-3.5 text-teal-700" />}
                  </span>
                  <span className="block font-mono text-[11px] text-slate-400">{e.cidade} · {e.segmento}</span>
                </td>
                <td className="px-3 py-2"><ChipClasse valor={e.classificacao} /></td>
                <td className="px-3 py-2 text-xs text-slate-700">{e.etapa}</td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums">
                  <span className={sem === null || sem > 30 ? "text-rose-600" : "text-slate-600"}>
                    {e.ultimoContato ? `${brData(e.ultimoContato)} · ${sem}d` : "nunca"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.proximaAcao ? (
                    <>
                      <span className="block text-slate-700">{e.proximaAcao}</span>
                      <span className={`block font-mono text-[11px] tabular-nums ${atraso > 0 ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                        {brData(e.dataProximaAcao)}{atraso > 0 ? ` · ${atraso}d atrás` : ""}
                      </span>
                    </>
                  ) : (<span className="text-slate-400">definir</span>)}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{e.potencial}</td>
                <td className="px-3 py-2 text-xs text-slate-700">{e.consultor}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────  formulários  ───────────────────────── */

const EMPRESA_VAZIA = {
  razaoSocial: "", nomeFantasia: "", cnpj: "", segmento: "Indústria", colaboradores: "",
  cidade: "Campinas", bairro: "", telefone: "", site: "", origem: "Prospecção ativa",
  consultor: "", classificacao: "Mapeada", etapa: "Mapeada", potencial: "Médio",
  possuiBeneficio: "Não sei", observacoes: "", contatos: [], linkInscricao: "", linkConsultor: "",
};

function FormEmpresa({ inicial, equipe, empresas, aoSalvar, aoFechar, aoExcluir, podeGerir }) {
  const [d, setD] = useState({ ...EMPRESA_VAZIA, ...inicial });
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const set = (k) => (ev) => setD({ ...d, [k]: ev.target.value });

  const salvar = () => {
    if (!d.razaoSocial.trim()) return setErro("Informe a razão social.");
    if (!d.consultor) return setErro("Escolha o consultor responsável.");
    if (d.cnpj && !cnpjValido(d.cnpj)) return setErro("CNPJ inválido — confira os dígitos.");
    if (d.cnpj) {
      const dup = empresas.find((e) => soDigitos(e.cnpj) === soDigitos(d.cnpj) && e.id !== d.id);
      if (dup) return setErro(`Esse CNPJ já está cadastrado como "${dup.nomeFantasia || dup.razaoSocial}", na carteira de ${dup.consultor}.`);
    }
    aoSalvar({ ...d, cnpj: d.cnpj ? mascaraCNPJ(d.cnpj) : "" });
  };

  return (
    <Modal titulo={inicial && inicial.id ? "Editar empresa" : "Nova empresa"} subtitulo="O CNPJ é opcional, mas quando preenchido bloqueia cadastro duplicado." aoFechar={aoFechar} largo>
      <div className="grid gap-3 sm:grid-cols-6">
        <Campo rotulo="Razão social" largura="sm:col-span-4">
          <input className={inputBase} value={d.razaoSocial} onChange={set("razaoSocial")} autoFocus />
        </Campo>
        <Campo rotulo="CNPJ" largura="sm:col-span-2">
          <input className={`${inputBase} font-mono`} value={d.cnpj} onChange={(e) => setD({ ...d, cnpj: mascaraCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" />
        </Campo>
        <Campo rotulo="Nome fantasia" largura="sm:col-span-3">
          <input className={inputBase} value={d.nomeFantasia} onChange={set("nomeFantasia")} />
        </Campo>
        <Campo rotulo="Segmento" largura="sm:col-span-3">
          <select className={inputBase} value={d.segmento} onChange={set("segmento")}>{SEGMENTOS.map((s) => <option key={s}>{s}</option>)}</select>
        </Campo>
        <Campo rotulo="Cidade" largura="sm:col-span-2"><input className={inputBase} value={d.cidade} onChange={set("cidade")} /></Campo>
        <Campo rotulo="Bairro" largura="sm:col-span-2"><input className={inputBase} value={d.bairro} onChange={set("bairro")} /></Campo>
        <Campo rotulo="Colaboradores" largura="sm:col-span-2" dica="Base do cálculo de penetração.">
          <input type="number" className={`${inputBase} font-mono`} value={d.colaboradores} onChange={set("colaboradores")} />
        </Campo>
        <Campo rotulo="Telefone" largura="sm:col-span-2"><input className={inputBase} value={d.telefone} onChange={set("telefone")} /></Campo>
        <Campo rotulo="Site ou LinkedIn" largura="sm:col-span-4"><input className={inputBase} value={d.site} onChange={set("site")} /></Campo>
        <Campo rotulo="Link de inscrição desta empresa" largura="sm:col-span-6"
          dica="Um link por empresa. É ele que o RH divulga e que faz a matrícula chegar atribuída.">
          <input className={`${inputBase} font-mono text-xs`} value={d.linkInscricao || ""} onChange={set("linkInscricao")}
            placeholder="https://inscricao.unimetrocamp.com.br/..." />
        </Campo>

        <div className="sm:col-span-6 mt-1 border-t border-slate-200 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estratégia</p>
          <div className="grid gap-3 sm:grid-cols-6">
            <Campo rotulo="Consultor responsável" largura="sm:col-span-2">
              <select className={inputBase} value={d.consultor} onChange={set("consultor")}>
                <option value="">Selecione</option>
                {equipe.map((p) => <option key={p.nome}>{p.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Classificação" largura="sm:col-span-2">
              <select className={inputBase} value={d.classificacao} onChange={set("classificacao")}>{Object.keys(CLASSES).map((c) => <option key={c}>{c}</option>)}</select>
            </Campo>
            <Campo rotulo="Etapa do funil" largura="sm:col-span-2">
              <select className={inputBase} value={d.etapa} onChange={set("etapa")}>
                <optgroup label="Funil">{ETAPAS.map((e) => <option key={e}>{e}</option>)}</optgroup>
                <optgroup label="Encerradas">{ETAPAS_ENCERRADAS.map((e) => <option key={e}>{e}</option>)}</optgroup>
              </select>
            </Campo>
            <Campo rotulo="Potencial" largura="sm:col-span-2">
              <select className={inputBase} value={d.potencial} onChange={set("potencial")}>{POTENCIAIS.map((p) => <option key={p}>{p}</option>)}</select>
            </Campo>
            <Campo rotulo="Origem" largura="sm:col-span-2"><input className={inputBase} value={d.origem} onChange={set("origem")} /></Campo>
            <Campo rotulo="Já tem benefício educacional?" largura="sm:col-span-2">
              <select className={inputBase} value={d.possuiBeneficio} onChange={set("possuiBeneficio")}>
                <option>Não sei</option><option>Não tem</option><option>Tem com outra instituição</option><option>Tem conosco</option>
              </select>
            </Campo>
            <Campo rotulo="Observações estratégicas" largura="sm:col-span-6">
              <textarea rows={2} className={inputBase} value={d.observacoes} onChange={set("observacoes")} />
            </Campo>
          </div>
        </div>
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
        {inicial && inicial.id && podeGerir && (
          confirmando ? (
            <span className="mr-auto flex items-center gap-2 text-xs text-rose-800">
              Excluir e apagar todo o histórico?
              <Botao tipo="perigo" tamanho="sm" onClick={aoExcluir}>Sim, excluir</Botao>
              <Botao tipo="neutro" tamanho="sm" onClick={() => setConfirmando(false)}>Não</Botao>
            </span>
          ) : (
            <Botao tipo="perigo" tamanho="sm" onClick={() => setConfirmando(true)}><Trash2 className="h-3 w-3" />Excluir empresa</Botao>
          )
        )}
        {!confirmando && <span className="flex-1" />}
        <Botao tipo="neutro" onClick={aoFechar}>Cancelar</Botao>
        <Botao onClick={salvar}>Salvar empresa</Botao>
      </div>
    </Modal>
  );
}

function FormAtividade({ empresa, aoSalvar, aoFechar }) {
  const hoje = hojeISO();
  const [d, setD] = useState({
    data: hoje, tipo: "Ligação", contato: "", resultado: "Contato realizado",
    observacao: "", proximaAcao: "", dataProximoContato: somarDias(hoje, 7),
    leads: "", impactados: "", novaEtapa: empresa.etapa,
  });
  const [erro, setErro] = useState("");
  const set = (k) => (ev) => setD({ ...d, [k]: ev.target.value });
  const salvar = () => {
    if (!d.observacao.trim()) return setErro("Escreva o que aconteceu no contato — é isso que vira histórico da conta.");
    if (d.data > hoje) return setErro("A data do contato não pode estar no futuro. Para agendar, use o campo de próximo passo.");
    aoSalvar(d);
  };
  return (
    <Modal titulo="Registrar contato" subtitulo={empresa.nomeFantasia || empresa.razaoSocial} aoFechar={aoFechar}>
      <div className="grid gap-3 sm:grid-cols-6">
        <Campo rotulo="Data" largura="sm:col-span-2"><input type="date" className={`${inputBase} font-mono`} value={d.data} onChange={set("data")} /></Campo>
        <Campo rotulo="Tipo" largura="sm:col-span-2">
          <select className={inputBase} value={d.tipo} onChange={set("tipo")}>{TIPOS_ATIVIDADE.map((t) => <option key={t}>{t}</option>)}</select>
        </Campo>
        <Campo rotulo="Resultado" largura="sm:col-span-2">
          <select className={inputBase} value={d.resultado} onChange={set("resultado")}>
            <option>Contato realizado</option><option>Sem retorno</option><option>Reunião agendada</option>
            <option>Proposta enviada</option><option>Interesse confirmado</option><option>Sem interesse</option>
          </select>
        </Campo>
        <Campo rotulo="Com quem falou" largura="sm:col-span-3"><input className={inputBase} value={d.contato} onChange={set("contato")} placeholder="Nome e cargo" /></Campo>
        <Campo rotulo="Etapa depois deste contato" largura="sm:col-span-3">
          <select className={inputBase} value={d.novaEtapa} onChange={set("novaEtapa")}>
            <optgroup label="Funil">{ETAPAS.map((e) => <option key={e}>{e}</option>)}</optgroup>
            <optgroup label="Encerradas">{ETAPAS_ENCERRADAS.map((e) => <option key={e}>{e}</option>)}</optgroup>
          </select>
        </Campo>
        <Campo rotulo="O que aconteceu" largura="sm:col-span-6">
          <textarea rows={3} className={inputBase} value={d.observacao} onChange={set("observacao")} placeholder="Dor identificada, objeção, decisor, próximo movimento…" />
        </Campo>
        <Campo rotulo="Próximo passo" largura="sm:col-span-4">
          <input className={inputBase} value={d.proximaAcao} onChange={set("proximaAcao")} placeholder="Ex.: enviar proposta de convênio" />
        </Campo>
        <Campo rotulo="Quando" largura="sm:col-span-2"><input type="date" className={`${inputBase} font-mono`} value={d.dataProximoContato} onChange={set("dataProximoContato")} /></Campo>
        <Campo rotulo="Leads gerados" largura="sm:col-span-3"><input type="number" className={`${inputBase} font-mono`} value={d.leads} onChange={set("leads")} /></Campo>
        <Campo rotulo="Colaboradores impactados" largura="sm:col-span-3"><input type="number" className={`${inputBase} font-mono`} value={d.impactados} onChange={set("impactados")} /></Campo>
      </div>
      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Botao tipo="neutro" onClick={aoFechar}>Cancelar</Botao>
        <Botao onClick={salvar}>Registrar contato</Botao>
      </div>
    </Modal>
  );
}

/* ─────────────────────────  ficha da empresa  ───────────────────────── */

function FichaEmpresa({ empresa, atividades, equipe, config, podeGerir, usuario, modo, aoFechar, aoEditar, aoRegistrar, aoTransferir, aoAdicionarContato, aoRemoverContato, aoAbrirConvenio, aoExcluirAtividade, aoSalvarLink }) {
  const [novoContato, setNovoContato] = useState(null);
  const hoje = hojeISO();
  const sem = diffDias(empresa.ultimoContato, hoje);
  const hist = atividades.filter((a) => a.empresaId === empresa.id).sort((a, b) => b.data.localeCompare(a.data));
  const cv = empresa.convenio;
  const s = saudeConvenio(empresa, hoje);
  const dono = equipe.find((p) => p.nome === empresa.consultor);
  const link = linkAtivo(empresa);

  return (
    <Modal titulo={empresa.nomeFantasia || empresa.razaoSocial} subtitulo={empresa.razaoSocial} aoFechar={aoFechar} largo>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <ChipClasse valor={empresa.classificacao} />
        <Chip texto={empresa.etapa} classe="bg-teal-50 text-teal-800 border-teal-200" />
        <Chip texto={`Potencial ${empresa.potencial}`} classe="bg-slate-100 text-slate-700 border-slate-200" />
        {cv && cv.ativo && <Chip texto={`Convênio · ${s.rotulo}`} classe={CORES_SAUDE[s.nivel]} />}
        <span className="ml-auto flex gap-2">
          <Botao tamanho="sm" tipo="neutro" onClick={aoEditar}><Pencil className="h-3 w-3" />Editar</Botao>
          <Botao tamanho="sm" onClick={aoRegistrar}><Phone className="h-3 w-3" />Registrar contato</Botao>
        </span>
      </div>

      <div className="grid gap-4 py-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <dl className="space-y-1.5 text-xs">
            {[
              ["CNPJ", empresa.cnpj || "—", true],
              ["Segmento", empresa.segmento],
              ["Colaboradores", empresa.colaboradores || "—", true],
              ["Cidade", `${empresa.cidade}${empresa.bairro ? " · " + empresa.bairro : ""}`],
              ["Telefone", empresa.telefone || "—", true],
              ["Origem", empresa.origem],
              ["Benefício educacional", empresa.possuiBeneficio],
              ["Último contato", empresa.ultimoContato ? `${brDataLonga(empresa.ultimoContato)} (${sem}d)` : "nunca", true],
            ].map(([k, v, mono]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                <dt className="text-slate-500">{k}</dt>
                <dd className={`text-right text-slate-800 ${mono ? "font-mono tabular-nums" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <BlocoLinkEmpresa
            empresa={empresa}
            config={config}
            consultorTag={dono && dono.tag}
            aoSalvarLink={aoSalvarLink}
          />

          <MensagemRH
            empresa={empresa}
            consultorNome={empresa.consultor}
            link={link}
            semConvenio={!(cv && cv.ativo && cv.status === "Ativo")}
          />

          <div className={`rounded border p-2.5 ${cv && cv.ativo ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Convênio</p>
              <button onClick={aoAbrirConvenio} className="text-[11px] font-medium text-teal-700 hover:underline">
                {cv && cv.ativo ? "editar" : "cadastrar"}
              </button>
            </div>
            {cv && cv.ativo ? (
              <dl className="mt-1.5 space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Assinado em</dt>
                  <dd className="font-mono tabular-nums text-slate-800">{brDataLonga(cv.dataInicio)} · {meses(s.idade)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Desconto</dt>
                  <dd className="font-mono tabular-nums text-slate-800">{cv.percentual ? cv.percentual + "%" : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Cursos</dt><dd className="text-right text-slate-800">{cv.cursos || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Assinou</dt><dd className="text-right text-slate-800">{cv.responsavelAssinatura || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Última divulgação</dt>
                  <dd className="font-mono tabular-nums text-slate-800">{cv.ultimaDivulgacao ? brDataLonga(cv.ultimaDivulgacao) : "nunca"}</dd></div>
                <div className="mt-1 flex justify-between border-t border-teal-200 pt-1">
                  <dt className="text-slate-500">Inscr. / Fin. / Acad.</dt>
                  <dd className="font-mono font-semibold tabular-nums text-teal-800">
                    {num(cv.inscricoes)} / {num(cv.matriculasFinanceiras)} / {num(cv.matriculasAcademicas)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {ETAPAS_CONVENIO.includes(empresa.etapa)
                  ? "Marcada como conveniada no funil, mas sem desconto nem data de assinatura."
                  : "Nenhum convênio ativo."}
              </p>
            )}
          </div>

          {podeGerir ? (
            <Campo rotulo="Consultor responsável" dica="Ao transferir, o link do consultor anterior deixa de valer: o novo precisa cadastrar o dele e reavisar o RH.">
              <select className={inputBase} value={empresa.consultor} onChange={(e) => aoTransferir(e.target.value)}>
                {equipe.map((p) => <option key={p.nome}>{p.nome}</option>)}
              </select>
            </Campo>
          ) : (
            <p className="text-xs text-slate-500">Consultor: <span className="font-medium text-slate-800">{empresa.consultor}</span></p>
          )}

          {empresa.observacoes && (
            <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observações</p>
              <p className="mt-1 text-xs text-slate-700">{empresa.observacoes}</p>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contatos</p>
              <button onClick={() => setNovoContato({ nome: "", cargo: "", papel: "Decisor", telefone: "", email: "" })} className="text-[11px] font-medium text-teal-700 hover:underline">+ adicionar</button>
            </div>
            {(empresa.contatos || []).length === 0 && !novoContato && (
              <p className="text-xs text-slate-500">Nenhum contato registrado. Sem nome e telefone do decisor, a conta não anda.</p>
            )}
            <ul className="space-y-1.5">
              {(empresa.contatos || []).map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-2 rounded border border-slate-200 p-2 text-xs">
                  <span>
                    <span className="block font-medium text-slate-900">{c.nome} <span className="font-normal text-slate-500">· {c.papel}</span></span>
                    <span className="block text-slate-600">{c.cargo}</span>
                    <span className="block font-mono text-[11px] text-slate-500">{[c.telefone, c.email].filter(Boolean).join(" · ")}</span>
                  </span>
                  <button onClick={() => aoRemoverContato(i)} className="text-slate-300 hover:text-rose-600" aria-label="Remover contato"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            {novoContato && (
              <div className="mt-2 space-y-2 rounded border border-teal-200 bg-teal-50 p-2">
                <input className={inputBase} placeholder="Nome" value={novoContato.nome} onChange={(e) => setNovoContato({ ...novoContato, nome: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputBase} placeholder="Cargo" value={novoContato.cargo} onChange={(e) => setNovoContato({ ...novoContato, cargo: e.target.value })} />
                  <select className={inputBase} value={novoContato.papel} onChange={(e) => setNovoContato({ ...novoContato, papel: e.target.value })}>
                    {CARGOS_CONTATO.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputBase} placeholder="Telefone" value={novoContato.telefone} onChange={(e) => setNovoContato({ ...novoContato, telefone: e.target.value })} />
                  <input className={inputBase} placeholder="E-mail" value={novoContato.email} onChange={(e) => setNovoContato({ ...novoContato, email: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Botao tamanho="sm" tipo="neutro" onClick={() => setNovoContato(null)}>Cancelar</Botao>
                  <Botao tamanho="sm" onClick={() => { if (novoContato.nome.trim()) { aoAdicionarContato(novoContato); setNovoContato(null); } }}>Adicionar</Botao>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Histórico</h3>
            <span className="font-mono text-[11px] text-slate-400">{hist.length} registro{hist.length === 1 ? "" : "s"}</span>
          </div>

          {empresa.proximaAcao && (
            <div className={`mb-3 rounded border px-3 py-2 ${diffDias(empresa.dataProximaAcao, hoje) > 0 ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Próximo passo</p>
              <p className="text-sm text-slate-900">{empresa.proximaAcao}</p>
              <p className="font-mono text-xs tabular-nums text-slate-600">{brDataLonga(empresa.dataProximaAcao)}</p>
            </div>
          )}

          {hist.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
              Nada registrado ainda. Cada ligação, visita ou reunião anotada aqui vira o histórico da conta.
            </p>
          ) : (
            <ol className="space-y-2">
              {hist.map((a) => (
                <li key={a.id} className="group border-l-2 border-slate-200 pl-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">{brDataLonga(a.data)}</span>
                    <Chip texto={a.tipo} classe="bg-slate-100 text-slate-700 border-slate-200" />
                    <span className="text-[11px] text-slate-500">{a.resultado}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{a.consultor}</span>
                      {(podeGerir || a.consultor === usuario.nome) && (
                        <button onClick={() => aoExcluirAtividade(a.id)} className="text-slate-200 opacity-0 transition group-hover:opacity-100 hover:text-rose-600" aria-label="Excluir registro">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  </div>
                  {a.etapaAnterior && a.etapaNova && a.etapaAnterior !== a.etapaNova && (
                    <p className="mt-0.5 font-mono text-[11px] text-teal-700">{a.etapaAnterior} → {a.etapaNova}</p>
                  )}
                  {a.contato && <p className="text-[11px] text-slate-500">com {a.contato}</p>}
                  <p className="mt-0.5 text-xs text-slate-700">{a.observacao}</p>
                  {(num(a.leads) > 0 || num(a.impactados) > 0) && (
                    <p className="mt-0.5 font-mono text-[11px] text-teal-800">
                      {num(a.leads) > 0 && `${a.leads} leads`}
                      {num(a.leads) > 0 && num(a.impactados) > 0 && " · "}
                      {num(a.impactados) > 0 && `${a.impactados} impactados`}
                    </p>
                  )}
                  {a.proximaAcao && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Próximo passo combinado: <span className="text-slate-700">{a.proximaAcao}</span>
                      {a.dataProximoContato && <span className="font-mono"> · {brDataLonga(a.dataProximoContato)}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* Anexos só no modo Supabase: dependem de auth real + RLS. No demo
              a empresa não tem UUID persistido nem sessão para assinar URLs. */}
          {modo !== "demo" && usuario && empresa.id && (
            <div className="mt-4">
              <PainelAnexos
                entityType="company"
                entityId={empresa.id}
                usuarioId={usuario.id}
                ehGestor={podeGerir}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────  agenda e funil  ───────────────────────── */

function Agenda({ empresas, aoAbrir }) {
  const hoje = hojeISO();
  const com = empresas.filter((e) => e.dataProximaAcao && !ETAPAS_ENCERRADAS.includes(e.etapa));
  const grupos = [
    { titulo: "Atrasados", cor: "border-rose-300 bg-rose-50", itens: com.filter((e) => diffDias(e.dataProximaAcao, hoje) > 0) },
    { titulo: "Hoje", cor: "border-amber-300 bg-amber-50", itens: com.filter((e) => diffDias(e.dataProximaAcao, hoje) === 0) },
    { titulo: "Próximos 7 dias", cor: "border-slate-300 bg-white", itens: com.filter((e) => { const d = diffDias(e.dataProximaAcao, hoje); return d < 0 && d >= -7; }) },
    { titulo: "Depois", cor: "border-slate-200 bg-white", itens: com.filter((e) => diffDias(e.dataProximaAcao, hoje) < -7) },
    { titulo: "Sem próximo passo", cor: "border-slate-300 bg-slate-50", itens: empresas.filter((e) => !e.dataProximaAcao && !ETAPAS_ENCERRADAS.includes(e.etapa)) },
  ];
  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h3 className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-slate-900">
            {g.titulo}<span className="font-mono text-xs font-normal tabular-nums text-slate-400">{g.itens.length}</span>
          </h3>
          {g.itens.length === 0 ? (
            <p className="rounded border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">Nada aqui.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.itens.slice().sort((a, b) => (a.dataProximaAcao || "9").localeCompare(b.dataProximaAcao || "9")).map((e) => (
                <li key={e.id}>
                  <button onClick={() => aoAbrir(e.id)} className={`w-full rounded border px-3 py-2 text-left transition hover:border-teal-500 ${g.cor}`}>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{e.nomeFantasia || e.razaoSocial}</span>
                      <ChipClasse valor={e.classificacao} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">{e.proximaAcao || "definir próximo passo"}</span>
                    <span className="mt-0.5 flex justify-between font-mono text-[11px] tabular-nums text-slate-500">
                      <span>{e.dataProximaAcao ? brDataLonga(e.dataProximaAcao) : "sem data"}</span><span>{e.consultor}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Funil({ empresas, aoAbrir }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ETAPAS.map((etapa) => {
        const itens = empresas.filter((e) => e.etapa === etapa);
        return (
          <section key={etapa} className="w-60 shrink-0 rounded-lg border border-slate-200 bg-slate-50">
            <header className="flex items-baseline justify-between border-b border-slate-200 px-3 py-2">
              <h3 className="text-xs font-semibold text-slate-800">{etapa}</h3>
              <span className="font-mono text-xs tabular-nums text-slate-500">{itens.length}</span>
            </header>
            <ul className="space-y-1.5 p-2">
              {itens.map((e) => (
                <li key={e.id}>
                  <button onClick={() => aoAbrir(e.id)} className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-teal-500">
                    <span className="block truncate text-xs font-medium text-slate-900">{e.nomeFantasia || e.razaoSocial}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-1">
                      <ChipClasse valor={e.classificacao} />
                      <span className="truncate font-mono text-[10px] text-slate-400">{e.consultor}</span>
                    </span>
                  </button>
                </li>
              ))}
              {itens.length === 0 && <li className="px-1 py-3 text-center text-[11px] text-slate-400">vazio</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ─────────────────────────  equipe e links  ───────────────────────── */

function Equipe({ equipe, empresas, config, aoSalvarEquipe, aoSalvarConfig, painelEquipe = null }) {
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("Consultor");
  const [cfg, setCfg] = useState(config);
  const [salvo, setSalvo] = useState(false);
  const [salvoMarca, setSalvoMarca] = useState(false);

  useEffect(() => setCfg(config), [config]);

  const editarTag = (pessoa, tag) =>
    aoSalvarEquipe(equipe.map((p) => (p.nome === pessoa.nome ? { ...p, tag: slug(tag) } : p)));

  return (
    <div className="max-w-3xl space-y-4">
      {painelEquipe}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Identidade visual</h3>
        <p className="mt-1 text-xs text-slate-600">
          Cada cor tem um papel fixo. Os tons intermediários — bordas, fundos leves, estados de hover —
          são derivados delas, então a interface nunca usa uma cor que não seja da marca.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome da unidade">
            <input className={inputBase} value={cfg.nomeUnidade || ""} onChange={(e) => setCfg({ ...cfg, nomeUnidade: e.target.value })} />
          </Campo>
          <Campo rotulo="URL do logo" dica="Versão clara, fundo transparente — o topo é escuro.">
            <input className={`${inputBase} font-mono text-xs`} value={cfg.logoUrl || ""} onChange={(e) => setCfg({ ...cfg, logoUrl: e.target.value })}
              placeholder="https://…/logo-unimetrocamp-branco.svg" />
          </Campo>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <CampoCor rotulo="Primária" valor={cfg.corPrimaria} padrao={MARCA_PADRAO.corPrimaria}
            dica="Botões, links, funil" aoMudar={(v) => setCfg({ ...cfg, corPrimaria: v })} />
          <CampoCor rotulo="Menu lateral" valor={cfg.corRail} padrao={MARCA_PADRAO.corRail}
            dica="Fundo escuro" aoMudar={(v) => setCfg({ ...cfg, corRail: v })} />
          <CampoCor rotulo="Suave" valor={cfg.corSuave} padrao={MARCA_PADRAO.corSuave}
            dica="Fundos leves e bordas" aoMudar={(v) => setCfg({ ...cfg, corSuave: v })} />
          <CampoCor rotulo="Crítico" valor={cfg.corAlerta} padrao={MARCA_PADRAO.corAlerta}
            dica="Atrasos e falhas" aoMudar={(v) => setCfg({ ...cfg, corAlerta: v })} />
          <CampoCor rotulo="Atenção" valor={cfg.corAtencao} padrao={MARCA_PADRAO.corAtencao}
            dica="Hoje e classificação Ouro" aoMudar={(v) => setCfg({ ...cfg, corAtencao: v })} />
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tons derivados</p>
          {(() => {
            const c = rampa(cfg);
            const familias = [
              ["Menta", ["m50", "m200", "m300", "m400"]],
              ["Magenta", ["m500", "m600", "m700", "m800"]],
              ["Escuro", ["rail", "rail2", "rail3"]],
              ["Crítico", ["a50", "a200", "a600", "a800"]],
              ["Atenção", ["t50", "t200", "t500", "t900"]],
            ];
            return (
              <div className="flex flex-wrap gap-3">
                {familias.map(([nome, chaves]) => (
                  <div key={nome}>
                    <div className="flex overflow-hidden rounded border border-slate-200">
                      {chaves.map((k) => <span key={k} className="h-7 w-7" style={{ background: c[k] }} title={`${k} · ${c[k]}`} />)}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">{nome}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Botao tipo="neutro" tamanho="sm" onClick={() => setCfg({ ...cfg, ...MARCA_PADRAO })}>Restaurar paleta oficial</Botao>
          {salvoMarca && <span className="text-xs text-teal-700">Salvo</span>}
          <Botao onClick={() => { aoSalvarConfig(cfg); setSalvoMarca(true); setTimeout(() => setSalvoMarca(false), 2000); }}>
            Aplicar identidade
          </Botao>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Padrão de link <span className="font-normal text-slate-500">(opcional)</span></h3>
        <p className="mt-1 text-xs text-slate-600">
          Cada empresa tem o seu próprio link de inscrição, cadastrado na ficha dela. Preencha aqui apenas se
          a instituição emite esses links seguindo um padrão — aí o sistema oferece a URL pronta na hora de
          cadastrar, e você só confere. Se cada link for gerado manualmente lá, pode deixar em branco.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <Campo rotulo="URL de inscrição" largura="sm:col-span-6">
            <input className={inputBase} value={cfg.linkBase} onChange={(e) => setCfg({ ...cfg, linkBase: e.target.value })}
              placeholder="inscricao.unimetrocamp.com.br/graduacao" />
          </Campo>
          <Campo rotulo="Parâmetro do consultor" largura="sm:col-span-2">
            <input className={`${inputBase} font-mono`} value={cfg.paramConsultor} onChange={(e) => setCfg({ ...cfg, paramConsultor: e.target.value })} />
          </Campo>
          <Campo rotulo="Parâmetro da empresa" largura="sm:col-span-2">
            <input className={`${inputBase} font-mono`} value={cfg.paramEmpresa} onChange={(e) => setCfg({ ...cfg, paramEmpresa: e.target.value })} disabled={!cfg.incluirEmpresa} />
          </Campo>
          <Campo rotulo="Identificar a empresa por" largura="sm:col-span-2"
            dica={cfg.empresaChave === "nome"
              ? "Atenção: se alguém editar o nome fantasia, os links já entregues param de atribuir."
              : "Recomendado: o CNPJ não muda, então links antigos continuam válidos."}>
            <select className={inputBase} value={cfg.empresaChave} onChange={(e) => setCfg({ ...cfg, empresaChave: e.target.value })} disabled={!cfg.incluirEmpresa}>
              <option value="cnpj">CNPJ (estável)</option>
              <option value="nome">Nome fantasia (legível)</option>
            </select>
          </Campo>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={cfg.incluirEmpresa} onChange={(e) => setCfg({ ...cfg, incluirEmpresa: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700" />
              Incluir a empresa no link
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={cfg.utm} onChange={(e) => setCfg({ ...cfg, utm: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700" />
              Acrescentar UTMs
            </label>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Prévia</p>
          <p className="break-all rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-600">
            {montarLink(cfg, (equipe.find((p) => p.papel === "Consultor") || {}).tag || "consultor", { nomeFantasia: "Empresa Exemplo", cnpj: "12.345.678/0001-95" })
              || "Preencha a URL para ver como o link ficará."}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          {salvo && <span className="text-xs text-teal-700">Salvo</span>}
          <Botao onClick={() => { aoSalvarConfig(cfg); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }}>
            Salvar configuração
          </Botao>
        </div>
      </section>

      {/* Cadastro local de "pessoas" (roster + adicionar). Só faz sentido no modo
          demo: ali a equipe é fictícia e vive no armazenamento local. No modo
          Supabase quem manda são os usuários reais em `painelEquipe`, então este
          bloco fantasma — que criava nomes sem conta de acesso — fica oculto para
          não confundir a gestão. */}
      {!painelEquipe && (
        <>
          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold">Papel</th>
                  <th className="px-3 py-2 text-left font-semibold">Tag no link</th>
                  <th className="px-3 py-2 text-right font-semibold">Carteira</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {equipe.map((p) => {
                  const carteira = empresas.filter((e) => e.consultor === p.nome).length;
                  return (
                    <tr key={p.nome}>
                      <td className="px-3 py-2 text-slate-900">{p.nome}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{p.papel}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            className={`${inputBase} font-mono text-xs`}
                            value={p.tag || ""}
                            onChange={(e) => editarTag(p, e.target.value)}
                            placeholder={slug(p.nome)}
                          />
                          <CopiarMini texto={montarLink(config, p.tag, null)} titulo="Copiar link do padrão sem empresa — para feiras e eventos" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600">{carteira}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => carteira === 0 && aoSalvarEquipe(equipe.filter((x) => x.nome !== p.nome))} disabled={carteira > 0}
                          title={carteira > 0 ? "Transfira as empresas antes de remover" : "Remover"}
                          className="text-slate-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:hover:text-slate-200">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Adicionar pessoa</h3>
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Nome" largura="min-w-[200px] flex-1"><input className={inputBase} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
              <Campo rotulo="Papel">
                <select className={inputBase} value={papel} onChange={(e) => setPapel(e.target.value)}>
                  <option>Consultor</option><option>Supervisor</option><option>Gerente</option>
                </select>
              </Campo>
              <Botao onClick={() => {
                const n = nome.trim();
                if (n && !equipe.some((p) => p.nome === n)) { aoSalvarEquipe([...equipe, { nome: n, papel, tag: slug(n) }]); setNome(""); }
              }}>Adicionar</Botao>
            </div>
          </section>
        </>
      )}
    </div>
  );
}


/* ─────────────────────────  aplicação  ───────────────────────── */

const NAV = [
  { id: "painel", rotulo: "Painel", Icone: LayoutDashboard, todos: true },
  { id: "carteira", rotulo: "Minha carteira", Icone: Briefcase, todos: true },
  { id: "consulta", rotulo: "De quem é?", Icone: Search, todos: true },
  { id: "empresas", rotulo: "Todas as empresas", Icone: Building2, todos: false },
  { id: "agenda", rotulo: "Agenda", Icone: CalendarClock, todos: true },
  { id: "funil", rotulo: "Funil", Icone: GitBranch, todos: true },
  { id: "convenios", rotulo: "Convênios", Icone: Handshake, todos: true },
  { id: "equipe", rotulo: "Equipe e links", Icone: Users, todos: false },
];

/**
 * @param {{ modo?: string, aoSair?: any, usuarioInicial?: any, painelEquipe?: any }} props
 */
export default function CrmApp({ modo = "demo", aoSair, usuarioInicial = null, painelEquipe = null }) {
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [equipe, setEquipe] = useState(EQUIPE_PADRAO);
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [usuario, setUsuario] = useState(null);
  const [tela, setTela] = useState("painel");
  const [aberta, setAberta] = useState(null);
  const [editando, setEditando] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [convenioDe, setConvenioDe] = useState(null);
  const [filtros, setFiltros] = useState({ busca: "", consultor: "", classificacao: "", etapa: "" });
  const hoje = hojeISO();

  const recarregar = useCallback(async () => {
    setSincronizando(true);
    const [emp, ati, eq, cfg] = await Promise.all([
      ler(CHAVES.empresas, true, null),
      ler(CHAVES.atividades, true, null),
      ler(CHAVES.equipe, true, null),
      ler(CHAVES.config, true, null),
    ]);
    if (emp) setEmpresas(emp);
    if (ati) setAtividades(ati);
    if (eq && eq.length) setEquipe(eq);
    if (cfg) setConfig({ ...CONFIG_PADRAO, ...cfg });
    setSincronizando(false);
  }, []);

  useEffect(() => {
    (async () => {
      const [emp, ati, eq, cfg, usr] = await Promise.all([
        ler(CHAVES.empresas, true, []),
        ler(CHAVES.atividades, true, []),
        ler(CHAVES.equipe, true, null),
        ler(CHAVES.config, true, null),
        ler(CHAVES.usuario, false, null),
      ]);
      const semaEquipe = modo === "demo" && (!eq || !eq.length);
      const equipeFinal = (eq && eq.length ? eq : EQUIPE_PADRAO).map((p) => ({ ...p, tag: p.tag || slug(p.nome) }));
      if (semaEquipe) await gravar(CHAVES.equipe, equipeFinal, true);
      setEmpresas(emp || []); setAtividades(ati || []); setEquipe(equipeFinal);
      setConfig({ ...CONFIG_PADRAO, ...(cfg || {}) });
      if (modo === "supabase" && usuarioInicial) {
        const eu = equipeFinal.find((p) => p.id === usuarioInicial.id) || usuarioInicial;
        setUsuario(eu);
      } else if (usr && equipeFinal.some((p) => p.nome === usr.nome)) {
        setUsuario(usr);
      }
      setCarregando(false);
    })();
  }, []);

  useEffect(() => {
    if (!usuario) return;
    const t = setInterval(() => { if (!editando && !registrando && !convenioDe) recarregar(); }, 60000);
    return () => clearInterval(t);
  }, [usuario, editando, registrando, convenioDe, recarregar]);

  /* grava a partir da cópia mais recente da base, para não sobrescrever a equipe */
  const mutarEmpresas = async (fn) => {
    const remoto = await ler(CHAVES.empresas, true, empresas);
    const novo = fn(remoto);
    setEmpresas(novo);
    await gravar(CHAVES.empresas, novo, true);
  };
  const mutarAtividades = async (fn) => {
    const remoto = await ler(CHAVES.atividades, true, atividades);
    const novo = fn(remoto);
    setAtividades(novo);
    await gravar(CHAVES.atividades, novo, true);
  };
  const salvarEquipe = async (nova) => { setEquipe(nova); await gravar(CHAVES.equipe, nova, true); };
  const salvarConfig = async (nova) => { setConfig(nova); await gravar(CHAVES.config, nova, true); };
  const entrar = (p) => { setUsuario(p); gravar(CHAVES.usuario, p, false); };
  const sair = async () => {
    if (modo === "supabase" && aoSair) { await aoSair(); return; }
    setUsuario(null);
    gravar(CHAVES.usuario, null, false);
  };

  /* papel canônico do usuário atual: no modo Supabase vem de profiles.role;
     no modo demo, deriva do papel exibido. normalizeRole NUNCA concede
     privilégio a um valor desconhecido — o fallback é consultor_b2b. */
  const papelAtual = usuario
    ? normalizeRole(
        usuario.role ??
          (usuario.papel === "Gerente"
            ? "gerente"
            : usuario.papel === "Supervisor"
              ? "supervisor"
              : "consultor_b2b")
      )
    : "consultor_b2b";
  /* superfícies de gestão B2B: visão de toda a operação, filtro por consultor,
     navegação de gestor e transferência/exclusão na ficha e no formulário.
     A busca "De quem é?" usa a lista completa diretamente (b2b.read.all),
     independentemente disto. */
  const ehGestor = can(papelAtual, "team.manage");
  const empresaAberta = empresas.find((e) => e.id === aberta) || null;
  const empresaConvenio = empresas.find((e) => e.id === convenioDe) || null;

  const escopoBase = useMemo(
    () => (ehGestor ? empresas : empresas.filter((e) => e.consultor === (usuario && usuario.nome))),
    [empresas, ehGestor, usuario]
  );

  const listaFiltrada = useMemo(() => {
    const fonte = tela === "carteira" ? empresas.filter((e) => e.consultor === (usuario && usuario.nome)) : escopoBase;
    const q = filtros.busca.trim().toLowerCase();
    return fonte.filter((e) =>
      (!q || `${e.razaoSocial} ${e.nomeFantasia} ${e.cnpj} ${e.cidade}`.toLowerCase().includes(q)) &&
      (!filtros.consultor || e.consultor === filtros.consultor) &&
      (!filtros.classificacao || e.classificacao === filtros.classificacao) &&
      (!filtros.etapa || e.etapa === filtros.etapa)
    );
  }, [escopoBase, empresas, filtros, tela, usuario]);

  const fila = useMemo(() => construirFila(escopoBase, hoje), [escopoBase, hoje]);

  const guardarEmpresa = (dados) => {
    if (dados.id) mutarEmpresas((base) => base.map((e) => {
      if (e.id !== dados.id) return e;
      const trocouLink = (dados.linkInscricao || "") !== (e.linkInscricao || "");
      /* quem digitou o link no formulário é o responsável escolhido ali */
      return { ...e, ...dados, linkConsultor: trocouLink ? (dados.linkInscricao ? dados.consultor : "") : e.linkConsultor };
    }));
    else mutarEmpresas((base) => [...base, { ...dados, id: uid(), dataEntrada: hoje, ultimoContato: "", proximaAcao: "", dataProximaAcao: "", convenio: null }]);
    setEditando(null);
  };

  const excluirEmpresa = async () => {
    const id = editando.id;
    await mutarEmpresas((base) => base.filter((e) => e.id !== id));
    await mutarAtividades((base) => base.filter((a) => a.empresaId !== id));
    setEditando(null); setAberta(null);
  };

  const guardarAtividade = async (d) => {
    const alvo = empresaAberta;
    /* a atividade guarda o HISTÓRICO do próximo passo prometido; a empresa
       guarda o estado ATUAL. Encadeado com await para não haver corrida entre
       as duas escritas remotas (read-modify-write). */
    await mutarAtividades((base) => [...base, {
      id: uid(), empresaId: alvo.id, consultor: usuario.nome, data: d.data, tipo: d.tipo,
      contato: d.contato, resultado: d.resultado, observacao: d.observacao,
      leads: d.leads, impactados: d.impactados, etapaAnterior: alvo.etapa, etapaNova: d.novaEtapa,
      proximaAcao: d.proximaAcao, dataProximoContato: d.dataProximoContato,
    }]);
    await mutarEmpresas((base) => base.map((e) => e.id === alvo.id ? {
      ...e, ultimoContato: d.data, etapa: d.novaEtapa,
      proximaAcao: d.proximaAcao, dataProximaAcao: d.proximaAcao ? d.dataProximoContato : "",
    } : e));
    setRegistrando(false);
    if (ETAPAS_CONVENIO.includes(d.novaEtapa) && !(alvo.convenio && alvo.convenio.ativo)) setConvenioDe(alvo.id);
  };

  const exportarCSV = () => {
    const conv = tela === "convenios";
    const fonte = conv ? escopoBase.filter((e) => e.convenio && e.convenio.ativo) : listaFiltrada;
    const cols = conv
      ? ["razaoSocial", "cnpj", "cidade", "colaboradores", "consultor", "tag", "link", "linkSituacao", "cv.status", "cv.dataInicio", "cv.percentual", "cv.cursos", "cv.responsavelAssinatura", "cv.inscricoes", "cv.matriculasFinanceiras", "cv.matriculasAcademicas", "cv.ultimaDivulgacao"]
      : ["razaoSocial", "nomeFantasia", "cnpj", "segmento", "colaboradores", "cidade", "consultor", "tag", "link", "linkSituacao", "classificacao", "etapa", "potencial", "ultimoContato", "proximaAcao", "dataProximaAcao"];
    const valor = (e, k) => {
      if (k.startsWith("cv.")) return (e.convenio || {})[k.slice(3)];
      const dono = equipe.find((p) => p.nome === e.consultor);
      if (k === "tag") return dono && dono.tag;
      if (k === "link") return linkAtivo(e);
      if (k === "linkSituacao") return linkAtivo(e) ? "ativo" : linkDefasado(e) ? `defasado (${e.linkConsultor})` : "sem link";
      return e[k];
    };
    const linhas = [cols.join(";"), ...fonte.map((e) => cols.map((k) => `"${String(valor(e, k) == null ? "" : valor(e, k)).replace(/"/g, "'")}"`).join(";"))];
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${conv ? "convenios" : "empresas"}-unimetrocamp-${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Tema config={config} />
        <p className="font-mono text-sm text-slate-500">carregando base…</p>
      </div>
    );
  }

  if (!usuario && modo !== "demo") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Tema config={config} />
        <p className="font-mono text-sm text-slate-500">redirecionando…</p>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <Tema config={config} />
        <div className="w-full max-w-sm rounded-lg bg-white p-6">
          <Marca config={config} />
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Quem está usando?</h1>
          <p className="mt-1 text-xs text-slate-500">
            A escolha fica salva neste navegador e define qual carteira aparece. Não é login com senha — é identificação de uso.
          </p>
          <ul className="mt-4 space-y-1.5">
            {equipe.map((p) => (
              <li key={p.nome}>
                <button onClick={() => entrar(p)} className="flex w-full items-center justify-between rounded border border-slate-200 px-3 py-2 text-left transition hover:border-teal-600 hover:bg-teal-50">
                  <span className="text-sm font-medium text-slate-900">{p.nome}</span>
                  <span className="font-mono text-[11px] text-slate-500">{p.papel}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-400">Para trocar os nomes da equipe, entre como Gerência e abra a aba Equipe e links.</p>
        </div>
      </div>
    );
  }

  const titulos = {
    painel: "Painel", carteira: "Minha carteira", consulta: "De quem é a empresa?",
    empresas: "Todas as empresas", agenda: "Agenda e follow-ups", funil: "Funil B2B",
    convenios: "Convênios", equipe: "Equipe e links",
  };
  const mostrarFiltros = tela === "carteira" || tela === "empresas";

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <Tema config={config} />
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
        <nav className="shrink-0 bg-slate-900 md:w-56">
          <div className="hidden px-4 py-4 md:block">
            <Marca config={config} escuro />
          </div>
          <ul className="flex overflow-x-auto md:block md:px-2">
            {NAV.filter((n) => n.todos || ehGestor).map(({ id, rotulo, Icone }) => (
              <li key={id} className="shrink-0">
                <button
                  onClick={() => { setTela(id); setFiltros({ busca: "", consultor: "", classificacao: "", etapa: "" }); }}
                  className={`flex w-full items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition md:rounded md:py-2 ${
                    tela === id ? "bg-slate-800 font-medium text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
                >
                  <Icone className="h-4 w-4 shrink-0" />{rotulo}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-slate-800 px-2 py-2">
            <a
              href="/high-school"
              className="flex w-full items-center gap-2 whitespace-nowrap rounded px-4 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 md:py-2"
            >
              <GraduationCap className="h-4 w-4 shrink-0" />
              High School
            </a>
          </div>
          <div className="hidden border-t border-slate-800 px-4 py-3 md:block">
            <p className="text-xs font-medium text-white">{usuario.nome}</p>
            <p className="font-mono text-[10px] text-slate-500">{usuario.papel}</p>
            <div className="mt-1 flex items-center gap-3">
              <button onClick={sair} className="text-[11px] text-teal-400 hover:underline">{modo === "demo" ? "trocar usuário" : "sair"}</button>
              {modo === "supabase" && (
                <a href="/auth/reset-password" className="text-[11px] text-slate-400 hover:underline">trocar senha</a>
              )}
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">{titulos[tela]}</h1>
              <p className="font-mono text-xs text-slate-500">{brDataLonga(hoje)} · {usuario.nome}</p>
            </div>
            <div className="flex gap-2">
              <Botao tipo="neutro" tamanho="sm" onClick={recarregar} title="Buscar lançamentos da equipe">
                <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} />Atualizar
              </Botao>
              {(mostrarFiltros || tela === "convenios") && (
                <Botao tipo="neutro" tamanho="sm" onClick={exportarCSV}><Download className="h-3.5 w-3.5" />CSV</Botao>
              )}
              <Botao onClick={() => setEditando({ consultor: usuario.papel === "Consultor" ? usuario.nome : "" })}>
                <Plus className="h-4 w-4" />Nova empresa
              </Botao>
            </div>
          </header>

          {empresas.length === 0 && (
            <div className="mb-4 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-5 py-6 text-center">
              <p className="text-sm font-semibold text-slate-900">A base está vazia</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
                {modo === "demo"
                  ? "Cadastre a primeira empresa da carteira, ou carregue 10 empresas fictícias da região de Campinas — três já conveniadas — para ver o sistema com dados."
                  : "Cadastre a primeira empresa da carteira para começar."}
              </p>
              <div className="mt-3 flex justify-center gap-2">
                {/* dados fictícios só no modo demonstração: nunca poluir a base real */}
                {modo === "demo" && (
                  <Botao tipo="neutro" tamanho="sm" onClick={() => mutarEmpresas(() => dadosExemplo(equipe))}>Carregar exemplos</Botao>
                )}
                <Botao tamanho="sm" onClick={() => setEditando({ consultor: !ehGestor ? usuario.nome : "" })}>Cadastrar empresa</Botao>
              </div>
            </div>
          )}

          {mostrarFiltros && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                <input className={`${inputBase} pl-8`} placeholder="Buscar por nome, CNPJ ou cidade" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
              </span>
              {ehGestor && tela === "empresas" && (
                <select className={`${inputBase} w-auto`} value={filtros.consultor} onChange={(e) => setFiltros({ ...filtros, consultor: e.target.value })}>
                  <option value="">Todos os consultores</option>
                  {equipe.map((p) => <option key={p.nome}>{p.nome}</option>)}
                </select>
              )}
              <select className={`${inputBase} w-auto`} value={filtros.classificacao} onChange={(e) => setFiltros({ ...filtros, classificacao: e.target.value })}>
                <option value="">Toda classificação</option>{Object.keys(CLASSES).map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className={`${inputBase} w-auto`} value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}>
                <option value="">Toda etapa</option>{TODAS_ETAPAS.map((e) => <option key={e}>{e}</option>)}
              </select>
              <span className="font-mono text-xs tabular-nums text-slate-500">{listaFiltrada.length} empresa{listaFiltrada.length === 1 ? "" : "s"}</span>
            </div>
          )}

          {tela === "painel" && (
            <Painel empresas={escopoBase} atividades={atividades} equipe={equipe} fila={fila} aoAbrir={setAberta}
              aoIrPara={(t, f) => { setTela(t); setFiltros({ busca: "", consultor: "", classificacao: "", etapa: "", ...f }); }}
              escopo={ehGestor ? "Toda a operação" : `Carteira de ${usuario.nome}`} />
          )}
          {(tela === "carteira" || tela === "empresas") && <TabelaEmpresas empresas={listaFiltrada} aoAbrir={setAberta} hoje={hoje} />}
          {tela === "consulta" && (
            <Consulta empresas={empresas} equipe={equipe} config={config} usuario={usuario} aoAbrir={setAberta}
              aoCadastrar={() => setEditando({ consultor: usuario.papel === "Consultor" ? usuario.nome : "" })} />
          )}
          {tela === "agenda" && <Agenda empresas={escopoBase} aoAbrir={setAberta} />}
          {tela === "funil" && <Funil empresas={escopoBase} aoAbrir={setAberta} />}
          {tela === "convenios" && <Convenios empresas={escopoBase} equipe={equipe} config={config} aoAbrir={setAberta} aoCadastrar={setConvenioDe} />}
          {tela === "equipe" && <Equipe equipe={equipe} empresas={empresas} config={config} aoSalvarEquipe={salvarEquipe} aoSalvarConfig={salvarConfig} painelEquipe={painelEquipe} />}
        </main>
      </div>

      {empresaAberta && !editando && !registrando && !convenioDe && (
        <FichaEmpresa
              empresa={empresaAberta} atividades={atividades} equipe={equipe} config={config} podeGerir={ehGestor} usuario={usuario} modo={modo}
          aoFechar={() => setAberta(null)}
          aoEditar={() => setEditando(empresaAberta)}
          aoRegistrar={() => setRegistrando(true)}
          aoAbrirConvenio={() => setConvenioDe(empresaAberta.id)}
          aoTransferir={(nome) => mutarEmpresas((base) => base.map((e) => {
            if (e.id !== empresaAberta.id || e.consultor === nome) return e;
            const tinhaLink = Boolean(linkDaEmpresa(e));
            return {
              ...e, consultor: nome,
              proximaAcao: tinhaLink && !e.proximaAcao ? "Cadastrar novo link e reavisar o RH da troca" : e.proximaAcao,
              dataProximaAcao: tinhaLink && !e.dataProximaAcao ? somarDias(hoje, 3) : e.dataProximaAcao,
            };
          }))}
          aoAdicionarContato={(c) => mutarEmpresas((base) => base.map((e) => e.id === empresaAberta.id ? { ...e, contatos: [...(e.contatos || []), c] } : e))}
          aoRemoverContato={(i) => mutarEmpresas((base) => base.map((e) => e.id === empresaAberta.id ? { ...e, contatos: e.contatos.filter((_, j) => j !== i) } : e))}
          aoExcluirAtividade={(id) => mutarAtividades((base) => base.filter((a) => a.id !== id))}
          aoSalvarLink={(link) => mutarEmpresas((base) => base.map((e) => e.id === empresaAberta.id
            ? { ...e, linkInscricao: link, linkConsultor: link ? e.consultor : "" } : e))}
        />
      )}

      {editando && (
            <FormEmpresa inicial={editando} equipe={equipe} empresas={empresas} podeGerir={ehGestor}
          aoSalvar={guardarEmpresa} aoExcluir={excluirEmpresa} aoFechar={() => setEditando(null)} />
      )}

      {registrando && empresaAberta && (
        <FormAtividade empresa={empresaAberta} aoSalvar={guardarAtividade} aoFechar={() => setRegistrando(false)} />
      )}

      {empresaConvenio && (
        <FormConvenio
          empresa={empresaConvenio}
          aoFechar={() => setConvenioDe(null)}
          aoSalvar={(cv) => { mutarEmpresas((base) => base.map((e) => e.id === empresaConvenio.id ? { ...e, convenio: cv } : e)); setConvenioDe(null); }}
          aoEncerrar={() => { mutarEmpresas((base) => base.map((e) => e.id === empresaConvenio.id ? { ...e, convenio: null } : e)); setConvenioDe(null); }}
        />
      )}
    </div>
  );
}
