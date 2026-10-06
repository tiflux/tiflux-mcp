/**
 * equipmentInventory.js — formatters do inventario de hardware de um recurso/equipamento.
 *
 * Compartilhado entre:
 * - `get_equipment` (detalhe): `formatInventoryFull(eq)` — todos os blocos, um por secao.
 *   Saida byte-identica a que o slice montava inline antes da extracao.
 * - `list_equipments` (listagem com `include_technical_info=true`): `formatInventorySummary(eq, v)` —
 *   uma linha resumida (CPU, RAM, discos, antivirus, Windows Update). Rede, placa-mae, video,
 *   S.M.A.R.T., som e impressoras ficam so no detalhe.
 *
 * Nomes de campo confirmados na API real (ver cabecalho de getEquipment.js):
 * `processor.name`, `memory.total_gb`, `motherboard.{manufacturer,model,bios}`,
 * `disks[].{name,size_gb,use_percent}`, `disksmart[].{model,status}`, `network[].{name,ipv4,mac}`,
 * `vga[].{name,vram_mb}`, `printer[].{name,port,default}`, `sound[].name`,
 * `antivirus[].{name,up_to_date,active}`, `windows_update.{pending_count,has_critical_pending}`,
 * `operating_system.{name,version,kernel,service_pack}`, `manufacturer.{name,model,serial}`.
 */

/** `prefix + itens.join(', ') + suffix` quando ha itens; '' caso contrario. */
function joinedOrEmpty(items, prefix, suffix = '') {
  return items.length ? prefix + items.join(', ') + suffix : '';
}

/** Disco com uso igual ou acima disto recebe ⚠️ na linha resumida. */
const DISK_WARN_PERCENT = 90;
const WARN = '⚠️';

/** Retorna true se a string tem conteudo relevante (nao nula, nao vazia). */
function hasStr(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

/** Retorna true se o array existe e tem ao menos 1 elemento. */
function hasArr(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/** Retorna true se o objeto existe, nao e null e nao e array. */
function hasObj(obj) {
  return obj !== null && obj !== undefined && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Retorna true se o valor e um numero finito utilizavel.
 * `hasStr` nao serve para os campos numericos do inventario (`total_gb`, `size_gb`,
 * `pending_count`): `String(0)` e `'0'`, que passa em `hasStr` e renderizaria lixo.
 */
function hasNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ── Blocos do detalhe (formatInventoryFull) ────────────────────────────────────

// API real expoe apenas `name` — sem cores/speed/model.
function fullProcessor(eq) {
  if (hasObj(eq.processor) && hasStr(eq.processor.name)) return `\n**Processador:** ${eq.processor.name}\n`;
  return '';
}

// `total_gb` e numero (ex: 12.0) — nao string; nao existe campo `free`.
function fullMemory(eq) {
  if (hasObj(eq.memory) && hasNum(eq.memory.total_gb)) return `**Memoria:** ${eq.memory.total_gb} GB\n`;
  return '';
}

function fullMotherboard(eq) {
  if (!hasObj(eq.motherboard)) return '';
  const mb = eq.motherboard;
  const parts = [mb.manufacturer, mb.model].filter(hasStr);
  if (parts.length === 0 && !hasStr(mb.bios)) return '';
  const head = parts.length > 0 ? parts.join(' — ') : 'N/A';
  const bios = hasStr(mb.bios) ? ` | BIOS: ${mb.bios}` : '';
  return `**Placa-mae:** ${head}${bios}\n`;
}

function fullDisks(eq) {
  if (!hasArr(eq.disks)) return '';
  let text = `\n**Discos (${eq.disks.length}):**\n`;
  eq.disks.forEach(disk => {
    const label = hasStr(disk.name) ? disk.name : 'disco';
    const parts = [];
    if (hasNum(disk.size_gb)) parts.push(`Tamanho: ${disk.size_gb} GB`);
    if (hasNum(disk.use_percent)) parts.push(`Uso: ${disk.use_percent}%`);
    text += `  • ${label}${parts.length ? ' — ' + parts.join(' | ') : ''}\n`;
  });
  return text;
}

function fullDiskSmart(eq) {
  if (!hasArr(eq.disksmart)) return '';
  let text = `\n**S.M.A.R.T. (${eq.disksmart.length}):**\n`;
  eq.disksmart.forEach(d => {
    const label = hasStr(d.model) ? d.model : 'disco';
    const status = hasStr(d.status) ? ` — status: ${d.status}` : '';
    text += `  • ${label}${status}\n`;
  });
  return text;
}

function fullNetwork(eq) {
  if (!hasArr(eq.network)) return '';
  let text = `\n**Rede (${eq.network.length} adaptador(es)):**\n`;
  eq.network.forEach(net => {
    const label = hasStr(net.name) ? net.name : 'adaptador';
    // ipv4 pode ser string com lista de IPs separados por virgula (IPv4 + IPv6)
    const ips = hasStr(net.ipv4) ? net.ipv4 : null;
    const mac = hasStr(net.mac) ? ` | MAC: ${net.mac}` : '';
    text += `  • ${label}${ips ? ': ' + ips : ''}${mac}\n`;
  });
  return text;
}

function fullPrinters(eq) {
  if (!hasArr(eq.printer)) return '';
  let text = `\n**Impressoras (${eq.printer.length}):**\n`;
  eq.printer.forEach(pr => {
    const label = hasStr(pr.name) ? pr.name : 'impressora';
    const flags = [];
    if (pr.default === true) flags.push('padrao');
    if (hasStr(pr.port)) flags.push(`porta: ${pr.port}`);
    text += `  • ${label}${joinedOrEmpty(flags, ' (', ')')}\n`;
  });
  return text;
}

function fullSound(eq) {
  if (!hasArr(eq.sound)) return '';
  let text = `\n**Som (${eq.sound.length}):**\n`;
  eq.sound.forEach(s => {
    if (hasStr(s.name)) text += `  • ${s.name}\n`;
  });
  return text;
}

function fullVga(eq) {
  if (!hasArr(eq.vga)) return '';
  let text = `\n**Video (${eq.vga.length}):**\n`;
  eq.vga.forEach(v => {
    if (!hasStr(v.name)) return;
    const vram = hasNum(v.vram_mb) ? ` — ${v.vram_mb} MB` : '';
    text += `  • ${v.name}${vram}\n`;
  });
  return text;
}

// API real: { name, version, kernel, service_pack }. Nao existem `architecture`
// nem `timezone`; `kernel` carrega a arquitetura (ex: "64 bits").
function fullOperatingSystem(eq) {
  if (!hasObj(eq.operating_system)) return '';
  const os = eq.operating_system;
  const name = hasStr(os.name) ? os.name : null;
  const ver = hasStr(os.version) ? os.version : null;
  // service_pack vem null nas maquinas sondadas — omitir quando ausente.
  const sp = hasStr(os.service_pack) ? `SP: ${os.service_pack}` : null;
  const parts = [name, ver, sp].filter(Boolean);
  let text = '';
  if (parts.length > 0) text += `\n**Sistema Operacional:** ${parts.join(' | ')}\n`;
  if (hasStr(os.kernel)) text += `  Kernel/Arquitetura: ${os.kernel}\n`;
  return text;
}

// API real: { pending_count: number, has_critical_pending: boolean }.
function fullWindowsUpdate(eq) {
  if (!hasObj(eq.windows_update)) return '';
  const wu = eq.windows_update;
  const hasCount = hasNum(wu.pending_count);
  const hasCritical = typeof wu.has_critical_pending === 'boolean';
  if (!hasCount && !hasCritical) return '';
  const parts = [];
  if (hasCount) {
    parts.push(wu.pending_count === 0 ? 'sem atualizacoes pendentes' : `${wu.pending_count} pendente(s)`);
  }
  if (wu.has_critical_pending === true) parts.push('⚠️ ha criticas pendentes');
  return `**Windows Update:** ${parts.join(' | ')}\n`;
}

function fullManufacturer(eq) {
  if (!hasObj(eq.manufacturer)) return '';
  const mfr = eq.manufacturer;
  const parts = [mfr.name, mfr.model].filter(hasStr);
  if (parts.length === 0) return '';
  const serial = hasStr(mfr.serial) ? ` | TAG/Serie: ${mfr.serial}` : '';
  return `\n**Fabricante:** ${parts.join(' — ')}${serial}\n`;
}

// API real: { name, up_to_date: boolean, active: boolean } — nao ha campo `status`.
function fullAntivirus(eq) {
  if (!hasArr(eq.antivirus)) return '';
  let text = `\n**Antivirus (${eq.antivirus.length}):**\n`;
  eq.antivirus.forEach(av => {
    const label = hasStr(av.name) ? av.name : 'antivirus';
    const flags = antivirusFlags(av);
    text += `  • ${label}${joinedOrEmpty(flags, ' — ')}\n`;
  });
  return text;
}

function antivirusFlags(av) {
  const flags = [];
  if (typeof av.active === 'boolean') flags.push(av.active ? 'ativo' : 'inativo');
  if (typeof av.up_to_date === 'boolean') flags.push(av.up_to_date ? 'atualizado' : 'desatualizado');
  return flags;
}

/** Ordem do detalhe — preservada da versao inline do get_equipment (saida byte-identica). */
const FULL_BLOCKS = [
  fullProcessor, fullMemory, fullMotherboard, fullDisks, fullDiskSmart, fullNetwork,
  fullPrinters, fullSound, fullVga, fullOperatingSystem, fullWindowsUpdate, fullManufacturer, fullAntivirus
];

/**
 * Inventario completo do recurso (detalhe do `get_equipment`), do processador ao antivirus.
 * Blocos ausentes/vazios nao geram texto.
 *
 * @param {object} eq - recurso/equipamento da API
 * @returns {string}
 */
function formatInventoryFull(eq) {
  if (!eq) return '';
  return FULL_BLOCKS.map(fn => fn(eq)).join('');
}

// ── Linha resumida da listagem (formatInventorySummary) ────────────────────────

function diskWarn(disk) {
  return hasNum(disk.use_percent) && disk.use_percent >= DISK_WARN_PERCENT;
}

function diskLabel(disk) {
  const parts = [hasStr(disk.name) ? disk.name : 'disco'];
  if (hasNum(disk.size_gb)) parts.push(`${disk.size_gb} GB`);
  if (hasNum(disk.use_percent)) parts.push(`${disk.use_percent}%`);
  if (diskWarn(disk)) parts.push(WARN);
  return parts.join(' ');
}

/** Disco com maior `use_percent` (para o compact). */
function fullestDisk(disks) {
  return disks.reduce((best, d) => {
    const pct = hasNum(d.use_percent) ? d.use_percent : -1;
    const bestPct = hasNum(best.use_percent) ? best.use_percent : -1;
    return pct > bestPct ? d : best;
  }, disks[0]);
}

function summaryDisks(eq, compact) {
  const disks = hasArr(eq.disks) ? eq.disks.filter(hasObj) : [];
  if (disks.length === 0) return null;
  if (compact) return `Disco: ${diskLabel(fullestDisk(disks))}`;
  return `Discos: ${disks.map(diskLabel).join(', ')}`;
}

function summaryAntivirus(eq) {
  const list = hasArr(eq.antivirus) ? eq.antivirus.filter(hasObj) : [];
  if (list.length === 0) return null;
  const labels = list.map(av => {
    const label = hasStr(av.name) ? av.name : 'antivirus';
    const flags = antivirusFlags(av);
    const warn = av.active === false || av.up_to_date === false ? ` ${WARN}` : '';
    return `${label}${joinedOrEmpty(flags, ' (', ')')}${warn}`;
  });
  return `Antivirus: ${labels.join(', ')}`;
}

function summaryWindowsUpdate(eq) {
  if (!hasObj(eq.windows_update)) return null;
  const wu = eq.windows_update;
  const pending = hasNum(wu.pending_count) && wu.pending_count > 0 ? wu.pending_count : 0;
  const critical = wu.has_critical_pending === true;
  if (pending === 0 && !critical) return null;
  const parts = [];
  if (pending > 0) parts.push(`${pending} pendente(s)`);
  if (critical) parts.push(`${WARN} criticas pendentes`);
  return `Windows Update: ${parts.join(' ')}`;
}

/**
 * Linha resumida de inventario para a listagem. Blocos vazios (`[]`, `null`,
 * `{pending_count:0}`) nao ocupam espaco; sem nenhum bloco util, devolve ''.
 *
 * - rich: CPU, RAM, todos os discos, antivirus e Windows Update.
 * - compact: so CPU, RAM e o disco mais cheio.
 * ⚠️ marca disco com uso >= 90%, antivirus inativo/desatualizado e atualizacao critica pendente.
 *
 * @param {object} eq - recurso/equipamento da API (com `include_technical_info=true`)
 * @param {string} [verbosity='rich']
 * @returns {string} segmentos separados por ' | ' (sem quebra de linha)
 */
function formatInventorySummary(eq, verbosity) {
  if (!eq) return '';
  const compact = verbosity === 'compact';
  const cpu = hasObj(eq.processor) && hasStr(eq.processor.name) ? `CPU: ${eq.processor.name}` : null;
  const ram = hasObj(eq.memory) && hasNum(eq.memory.total_gb) ? `RAM: ${eq.memory.total_gb} GB` : null;
  const segments = [cpu, ram, summaryDisks(eq, compact)];
  if (!compact) segments.push(summaryAntivirus(eq), summaryWindowsUpdate(eq));
  return segments.filter(Boolean).join(' | ');
}

module.exports = {
  hasStr, hasArr, hasObj, hasNum,
  formatInventoryFull, formatInventorySummary,
  DISK_WARN_PERCENT
};
