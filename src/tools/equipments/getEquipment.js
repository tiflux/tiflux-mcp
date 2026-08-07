/**
 * Slice: get_equipment — exibe detalhes completos de um recurso/equipamento pelo ID.
 *
 * Endpoint: GET /equipments/{id} (via api.getEquipment).
 * Retorna: inventario de hardware, SO, cliente, tipo/grupo, datas e campos personalizados opcionais.
 *
 * Contrato da API real — capturado de `GET /equipments/{id}` em 2026-08-07 contra os
 * recursos 385053, 385063 e 405001 (shape identico nos tres). Payload de referencia
 * sanitizado commitado em `tests/fixtures/equipments/get-equipment-385053.json`.
 *
 * Nomes de campo confirmados (NAO inventar variantes — a v1 desta tool assumiu
 * `memory.total`, `disks[].size`, `network[].mac_address` e `windows_update.pending_updates`,
 * que nao existem, e os blocos correspondentes sumiam da saida):
 * - `processor: { name }` — so o nome; nao ha `cores`, `speed` nem `model`.
 * - `memory: { total_gb }` — numero em GB (ex: 12.0), nao string, e sem `free`.
 * - `motherboard: { manufacturer, model, bios }` — sem `name`; `model` costuma vir `""`.
 * - `disks[]: { name, size_gb, use_percent }` — numeros; nao ha `free_space` nem `file_system`.
 * - `disksmart[]: { model, status }` — sem `name`/`health`.
 * - `network[]: { name, ipv4, mac }` — `mac`, nao `mac_address`.
 * - `vga[]: { name, vram_mb }`; `printer[]: { name, port, default }`.
 * - `antivirus[]: { name, up_to_date, active }` — booleanos, nao `status`.
 * - `operating_system: { name, version, kernel, service_pack }` — sem `architecture`/`timezone`;
 *   `kernel` traz a arquitetura ("64 bits"); `service_pack` vem null → omitir.
 * - `windows_update: { pending_count, has_critical_pending }` — numero + booleano.
 * - `current_user` (string) existe no detalhe e identifica quem usa a maquina.
 *
 * Outras nuances:
 * - Nao existe objeto `agent` no detalhe — a heuristica `agent.version` de list_equipments NAO porta.
 * - `agent_email`/`agent_user` vem preenchidos em algumas maquinas e null em outras; exibir so quando presentes.
 * - `network[].ipv4` e string com lista separada por virgula (IPv4 + varios IPv6); nao assumir IP unico.
 * - `acquisition_date`/`warranty_date` geralmente null (campos manuais) → omitir quando nulos.
 * - `entities` so aparece com `show_entities=true`; `entity_fields[].value` e `.id` podem ser null.
 *
 * Permissoes necessarias: "Visualizar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { footer } = require('../_shared/format');
const { formatEntityField } = require('../_shared/entityFields');

const schema = {
  name: 'get_equipment',
  description:
    'Exibir detalhes completos de um recurso/equipamento pelo ID. Retorna inventario de hardware ' +
    '(processador, memoria, discos, rede, SO, fabricante, antivirus, etc.), cliente, tipo, grupo, ' +
    'datas de aquisicao/garantia/ultimo contato e campos personalizados opcionais. ' +
    'Requer permissao "Visualizar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      equipment_id: {
        type: 'number',
        description: 'ID do recurso/equipamento a ser exibido (obtido via list_equipments)'
      },
      show_entities: {
        type: 'boolean',
        description: 'Incluir campos personalizados (entities) vinculados ao recurso na resposta (padrao: false)'
      }
    },
    required: ['equipment_id']
  }
};

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

function formatEquipment(equipment, verbosity) {
  const v = verbosity || 'rich';
  let text = `**Recurso: ${equipment.name || 'N/A'}**\n\n`;
  text += `**ID:** ${equipment.id}\n`;

  const clientName = equipment.client?.name;
  if (hasStr(clientName)) text += `**Cliente:** ${clientName} (ID: ${equipment.client.id})\n`;

  const typeName = equipment.equipment_type?.name;
  if (hasStr(typeName)) text += `**Tipo:** ${typeName}\n`;

  const groupName = equipment.equipment_group?.name;
  if (hasStr(groupName)) text += `**Grupo:** ${groupName}\n`;

  if (hasStr(equipment.network_name)) text += `**Nome de rede:** ${equipment.network_name}\n`;
  if (hasStr(equipment.current_user)) text += `**Usuario atual:** ${equipment.current_user}\n`;
  if (hasStr(equipment.agent_email)) text += `**E-mail do agente:** ${equipment.agent_email}\n`;
  if (hasStr(equipment.agent_user)) text += `**Usuario do agente:** ${equipment.agent_user}\n`;

  // ── Processador ────────────────────────────────────────────────────────────
  // API real expoe apenas `name` — sem cores/speed/model.
  if (hasObj(equipment.processor) && hasStr(equipment.processor.name)) {
    text += `\n**Processador:** ${equipment.processor.name}\n`;
  }

  // ── Memoria ────────────────────────────────────────────────────────────────
  // `total_gb` e numero (ex: 12.0) — nao string; nao existe campo `free`.
  if (hasObj(equipment.memory) && hasNum(equipment.memory.total_gb)) {
    text += `**Memoria:** ${equipment.memory.total_gb} GB\n`;
  }

  // ── Placa-mae ──────────────────────────────────────────────────────────────
  if (hasObj(equipment.motherboard)) {
    const mb = equipment.motherboard;
    const parts = [mb.manufacturer, mb.model].filter(hasStr);
    if (parts.length > 0 || hasStr(mb.bios)) {
      const head = parts.length > 0 ? parts.join(' — ') : 'N/A';
      const bios = hasStr(mb.bios) ? ` | BIOS: ${mb.bios}` : '';
      text += `**Placa-mae:** ${head}${bios}\n`;
    }
  }

  // ── Discos ─────────────────────────────────────────────────────────────────
  if (hasArr(equipment.disks)) {
    text += `\n**Discos (${equipment.disks.length}):**\n`;
    equipment.disks.forEach(disk => {
      const label = hasStr(disk.name) ? disk.name : 'disco';
      const parts = [];
      if (hasNum(disk.size_gb)) parts.push(`Tamanho: ${disk.size_gb} GB`);
      if (hasNum(disk.use_percent)) parts.push(`Uso: ${disk.use_percent}%`);
      text += `  • ${label}${parts.length ? ' — ' + parts.join(' | ') : ''}\n`;
    });
  }

  // ── S.M.A.R.T. ─────────────────────────────────────────────────────────────
  if (hasArr(equipment.disksmart)) {
    text += `\n**S.M.A.R.T. (${equipment.disksmart.length}):**\n`;
    equipment.disksmart.forEach(d => {
      const label = hasStr(d.model) ? d.model : 'disco';
      const status = hasStr(d.status) ? ` — status: ${d.status}` : '';
      text += `  • ${label}${status}\n`;
    });
  }

  // ── Rede ───────────────────────────────────────────────────────────────────
  if (hasArr(equipment.network)) {
    text += `\n**Rede (${equipment.network.length} adaptador(es)):**\n`;
    equipment.network.forEach(net => {
      const label = hasStr(net.name) ? net.name : 'adaptador';
      // ipv4 pode ser string com lista de IPs separados por virgula (IPv4 + IPv6)
      const ips = hasStr(net.ipv4) ? net.ipv4 : null;
      const mac = hasStr(net.mac) ? ` | MAC: ${net.mac}` : '';
      text += `  • ${label}${ips ? ': ' + ips : ''}${mac}\n`;
    });
  }

  // ── Impressoras ────────────────────────────────────────────────────────────
  if (hasArr(equipment.printer)) {
    text += `\n**Impressoras (${equipment.printer.length}):**\n`;
    equipment.printer.forEach(pr => {
      const label = hasStr(pr.name) ? pr.name : 'impressora';
      const flags = [];
      if (pr.default === true) flags.push('padrao');
      if (hasStr(pr.port)) flags.push(`porta: ${pr.port}`);
      text += `  • ${label}${flags.length ? ` (${flags.join(', ')})` : ''}\n`;
    });
  }

  // ── Som ────────────────────────────────────────────────────────────────────
  if (hasArr(equipment.sound)) {
    text += `\n**Som (${equipment.sound.length}):**\n`;
    equipment.sound.forEach(s => {
      if (hasStr(s.name)) text += `  • ${s.name}\n`;
    });
  }

  // ── Video ──────────────────────────────────────────────────────────────────
  if (hasArr(equipment.vga)) {
    text += `\n**Video (${equipment.vga.length}):**\n`;
    equipment.vga.forEach(v => {
      if (!hasStr(v.name)) return;
      const vram = hasNum(v.vram_mb) ? ` — ${v.vram_mb} MB` : '';
      text += `  • ${v.name}${vram}\n`;
    });
  }

  // ── Sistema Operacional ────────────────────────────────────────────────────
  // API real: { name, version, kernel, service_pack }. Nao existem `architecture`
  // nem `timezone`; `kernel` carrega a arquitetura (ex: "64 bits").
  if (hasObj(equipment.operating_system)) {
    const os = equipment.operating_system;
    const name = hasStr(os.name) ? os.name : null;
    const ver = hasStr(os.version) ? os.version : null;
    // service_pack vem null nas maquinas sondadas — omitir quando ausente.
    const sp = hasStr(os.service_pack) ? `SP: ${os.service_pack}` : null;
    const parts = [name, ver, sp].filter(Boolean);
    if (parts.length > 0) text += `\n**Sistema Operacional:** ${parts.join(' | ')}\n`;
    if (hasStr(os.kernel)) text += `  Kernel/Arquitetura: ${os.kernel}\n`;
  }

  // ── Windows Update ─────────────────────────────────────────────────────────
  // API real: { pending_count: number, has_critical_pending: boolean }.
  if (hasObj(equipment.windows_update)) {
    const wu = equipment.windows_update;
    const hasCount = hasNum(wu.pending_count);
    const hasCritical = typeof wu.has_critical_pending === 'boolean';
    if (hasCount || hasCritical) {
      const parts = [];
      if (hasCount) {
        parts.push(wu.pending_count === 0 ? 'sem atualizacoes pendentes' : `${wu.pending_count} pendente(s)`);
      }
      if (wu.has_critical_pending === true) parts.push('⚠️ ha criticas pendentes');
      text += `**Windows Update:** ${parts.join(' | ')}\n`;
    }
  }

  // ── Fabricante ────────────────────────────────────────────────────────────
  if (hasObj(equipment.manufacturer)) {
    const mfr = equipment.manufacturer;
    const parts = [mfr.name, mfr.model].filter(hasStr);
    if (parts.length > 0) {
      text += `\n**Fabricante:** ${parts.join(' — ')}`;
      if (hasStr(mfr.serial)) text += ` | TAG/Serie: ${mfr.serial}`;
      text += '\n';
    }
  }

  // ── Antivirus ──────────────────────────────────────────────────────────────
  // API real: { name, up_to_date: boolean, active: boolean } — nao ha campo `status`.
  if (hasArr(equipment.antivirus)) {
    text += `\n**Antivirus (${equipment.antivirus.length}):**\n`;
    equipment.antivirus.forEach(av => {
      const label = hasStr(av.name) ? av.name : 'antivirus';
      const flags = [];
      if (typeof av.active === 'boolean') flags.push(av.active ? 'ativo' : 'inativo');
      if (typeof av.up_to_date === 'boolean') flags.push(av.up_to_date ? 'atualizado' : 'desatualizado');
      text += `  • ${label}${flags.length ? ` — ${flags.join(', ')}` : ''}\n`;
    });
  }

  // ── Datas ──────────────────────────────────────────────────────────────────
  const hasDates = hasStr(equipment.last_seen) || hasStr(equipment.acquisition_date) || hasStr(equipment.warranty_date);
  if (hasDates) {
    text += '\n';
    if (hasStr(equipment.last_seen)) text += `**Ultimo contato:** ${equipment.last_seen}\n`;
    if (hasStr(equipment.acquisition_date)) text += `**Data de aquisicao:** ${equipment.acquisition_date}\n`;
    if (hasStr(equipment.warranty_date)) text += `**Garantia ate:** ${equipment.warranty_date}\n`;
  }

  // ── Campos personalizados ──────────────────────────────────────────────────
  if (hasArr(equipment.entities)) {
    text += '\n**Campos Personalizados:**\n';
    equipment.entities.forEach(entity => {
      text += `\n**${entity.name || 'Menu'}** (ID: ${entity.id})\n`;
      if (hasArr(entity.entity_fields)) {
        entity.entity_fields.forEach(field => {
          text += formatEntityField(field);
        });
      }
    });
  }

  text += `\n${footer(v)}`;
  return text;
}

async function execute(args, { api, verbosity }) {
  const { show_entities } = args;

  // ID validado estritamente (inteiro) antes de virar path na URL — honra o
  // `type: number` do schema e nunca interpola argumento MCP cru em /equipments/{id}.
  const equipment_id = requireIntField(args, 'equipment_id');

  try {
    const options = {};
    if (show_entities) options.showEntities = true;

    const response = await api.getEquipment(equipment_id, options);

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40304) {
        return errorResponse(
          '**❌ Sem licença para visualizar recursos**\n\n' +
          'Sua organização não possui licença ativa para o módulo de tickets/recursos (erro 40304).\n\n' +
          '*Entre em contato com o suporte TiFlux para verificar o licenciamento.*'
        );
      }

      if (errorCode === 40401 || response.status === 404) {
        return errorResponse(
          `**❌ Recurso #${equipment_id} não encontrado**\n\n` +
          `**Código:** ${response.status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se o ID está correto e se o recurso existe na organização.*`
        );
      }

      if (response.status === 403) {
        return errorResponse(
          `**❌ Acesso negado ao recurso #${equipment_id}**\n\n` +
          `**Código:** ${response.status} (erro ${errorCode || 'N/A'})\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se o usuário possui a permissão "Visualizar recursos" e se a organização tem Licença Tickets.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar recurso #${equipment_id}**`,
        response,
        '*Verifique se o recurso existe e se você tem permissão para acessá-lo.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar recurso #${equipment_id}**\n\n` +
        `A API retornou sucesso mas sem os dados do recurso.\n\n` +
        `*Verifique se o recurso #${equipment_id} existe.*`
      );
    }

    return textResponse(formatEquipment(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar recurso #${equipment_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEquipment };
