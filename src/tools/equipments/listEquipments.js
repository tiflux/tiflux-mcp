/**
 * Slice: list_equipments — lista equipamentos/recursos da organizacao.
 *
 * Endpoint: GET /equipments (via api.listEquipments).
 * Filtros opcionais: client_id, include_manufacturer, include_system, include_technical_info + paginacao.
 *
 * Com `include_technical_info=true` a API devolve o inventario de hardware (processor, memory,
 * disks, antivirus, windows_update, ...). A listagem mostra so uma linha resumida por recurso
 * (`formatInventorySummary`); o inventario completo fica no get_equipment.
 *
 * Orcamento: a pagina e cortada no RESPONSE_ITEM_BUDGET (no limite de um recurso, com linha de
 * continuacao) e sai em compact automatico acima de AUTO_COMPACT_LIMIT itens (listVerbosity).
 *
 * Campos de agente/inventario (agent, online, last_seen, ipv4, etc.) so existem
 * em maquinas com agente TiFlux instalado. Em recursos manuais esses campos
 * chegam nulos/ausentes — o formatter exibe o bloco de agente apenas quando
 * o recurso tem agente (heuristica: objeto `agent` com `version` presente).
 *
 * Permissoes necessarias: "Visualizar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const {
  footer, pagination, appendWithinBudget, continuationLine, cutCountLabel, listVerbosity, RESPONSE_ITEM_BUDGET
} = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { formatInventorySummary } = require('../_shared/equipmentInventory');

const schema = {
  name: 'list_equipments',
  description:
    'Listar equipamentos/recursos da organizacao. Retorna tabela com id, nome, cliente, tipo, grupo, status online e IP de cada recurso. ' +
    'Filtros opcionais: client_id (filtrar por cliente), include_manufacturer (fabricante, modelo e TAG/numero de serie), ' +
    'include_system (sistema operacional), include_technical_info (inventario de hardware resumido por recurso: ' +
    'CPU, RAM, discos com % de uso, antivirus e Windows Update pendente, com ⚠️ em disco >= 90%, antivirus inativo/desatualizado ' +
    'e atualizacao critica pendente — rede, placa-mae, video, S.M.A.R.T., som e impressoras so no get_equipment). ' +
    'Campos de agente (online, IP, ultimo contato, inventario) so aparecem para maquinas com o agente TiFlux instalado — recursos manuais nao exibem esses dados. ' +
    'Requer permissao "Visualizar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'Filtrar recursos de um cliente especifico (ID do cliente). Opcional.'
      },
      include_manufacturer: {
        type: 'boolean',
        description:
          'Incluir dados do fabricante (fabricante, modelo, numero de serie/TAG). ' +
          'Nao traz processador/memoria — para isso use include_technical_info. ' +
          'So preenchido em maquinas com agente. Default: false.'
      },
      include_system: {
        type: 'boolean',
        description:
          'Incluir dados do sistema operacional (nome, versao, kernel). ' +
          'So preenchido em maquinas com agente. Default: false.'
      },
      include_technical_info: {
        type: 'boolean',
        description:
          'Incluir o inventario de hardware resumido (uma linha por recurso): CPU, RAM, discos (tamanho e % de uso), ' +
          'antivirus e Windows Update pendente. No formato compacto, so CPU, RAM e o disco mais cheio. ' +
          'O detalhe completo (rede, placa-mae, video, S.M.A.R.T., som, impressoras) fica no get_equipment. ' +
          'So preenchido em maquinas com agente. Default: false.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

/**
 * Retorna true se o recurso tem agente TiFlux instalado.
 * Heuristica: objeto `agent` presente com campo `version` nao-nulo.
 */
function hasAgent(equipment) {
  return !!(equipment.agent && equipment.agent.version != null);
}

function renderRow(eq) {
  const clientName = eq.client?.name || '—';
  const typeName = eq.equipment_type?.name || '—';
  const groupName = eq.equipment_group?.name || '—';
  const withAgent = hasAgent(eq);
  let online = '—';
  if (withAgent) online = eq.online ? '✅ Sim' : '❌ Não';
  const ip = withAgent ? (eq.ipv4 || '—') : '—';
  return `| ${eq.id} | ${eq.name || '—'} | ${clientName} | ${typeName} | ${groupName} | ${online} | ${ip} |\n`;
}

// Bloco manufacturer (so quando solicitado e presente).
// API v2 expoe apenas { serial, name, model } — nao ha CPU/RAM/disco neste campo.
function manufacturerLine(eq) {
  const m = eq.manufacturer;
  if (!m) return '';
  const modelo = [m.name, m.model].filter(Boolean).join(' ') || '—';
  const tag = m.serial ? ` | TAG: ${m.serial}` : '';
  return `• **${eq.name}** — ${modelo}${tag}\n`;
}

// Bloco system: { name, version, kernel } — nao existe `timezone` no schema `system`.
function systemLine(eq) {
  const s = eq.system;
  if (!s) return '';
  return `• **${eq.name}** — ${s.name || '—'} ${s.version || ''} | Kernel: ${s.kernel || '—'}\n`;
}

function inventoryLine(eq, v) {
  const summary = formatInventorySummary(eq, v);
  return summary ? `• **${eq.name || '—'}** (#${eq.id}) — ${summary}\n` : '';
}

/**
 * Formata a pagina de recursos: tabela + blocos opcionais (fabricante, SO, inventario).
 * O orcamento conta cada recurso pelo custo da linha da tabela MAIS as linhas dele
 * nos blocos opcionais; ao cortar, tabela e blocos mostram os mesmos K recursos.
 */
function formatEquipmentsList(equipments, offset, limit, total, verbosity, notice = '') {
  const v = verbosity || 'rich';

  if (!equipments || equipments.length === 0) {
    return 'Nenhum recurso encontrado.\n\n*Verifique os filtros aplicados e suas permissoes.*';
  }

  const tableHead = '| ID | Nome | Cliente | Tipo | Grupo | Online | IP |\n|---|---|---|---|---|---|---|\n';
  const head = `**Recursos (${equipments.length})**\n\n${tableHead}`;
  const truncatedHead = (shown) => `**Recursos (${cutCountLabel(shown, total, equipments.length)})**\n\n${tableHead}`;

  const rows = equipments.map(renderRow);
  const sections = [
    { title: '**Hardware (fabricante):**', lines: equipments.map(manufacturerLine) },
    { title: '**Sistema operacional:**', lines: equipments.map(systemLine) },
    { title: '**Inventario tecnico:**', lines: equipments.map(eq => inventoryLine(eq, v)) }
  ];
  const combined = rows.map((row, i) => row + sections.map(sec => sec.lines[i]).join(''));

  const paginationInfo = pagination({ offset, limit, count: equipments.length, total, unit: 'recursos' }, v);
  const footerStr = footer(v);
  const tail = `${notice}${footerStr ? '\n' : ''}${footerStr}`;
  const sectionsLen = sections.reduce((acc, sec) => acc + sec.title.length + 2, 0);
  const fixed = Math.max(head.length, truncatedHead(equipments.length).length) + sectionsLen + paginationInfo.length + tail.length + 1;

  const unit = 'recursos';
  const fit = appendWithinBudget(combined, { maxChars: RESPONSE_ITEM_BUDGET - fixed, offset, limit, unit, verbosity: v, total });
  const shown = fit.shown;

  let text = (fit.truncated ? truncatedHead(shown) : head) + rows.slice(0, shown).join('');
  sections.forEach(sec => {
    const lines = sec.lines.slice(0, shown).filter(Boolean);
    if (lines.length > 0) text += `\n${sec.title}\n${lines.join('')}`;
  });

  const end = fit.truncated
    ? continuationLine({ shown, count: equipments.length, offset, limit, unit, verbosity: v, total })
    : `\n${paginationInfo}`;
  return `${text}${end}${tail}`;
}

async function execute(args, { api, verbosity: ctxVerbosity, verbosityExplicit }) {
  const { client_id, include_manufacturer, include_system, include_technical_info, limit, offset } = args;

  try {
    const filters = {};

    if (client_id !== undefined) filters.client_id = client_id;
    if (include_manufacturer) filters.include_manufacturer = true;
    if (include_system) filters.include_system = true;
    if (include_technical_info) filters.include_technical_info = true;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEquipments(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar recursos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes (requer "Visualizar recursos" e Licenca Tickets) e os filtros aplicados.*`
      );
    }

    const equipments = response.data || [];
    // F4: sem verbosidade explicita e com > 50 itens na pagina, sai em compact (com aviso).
    const { verbosity, notice } = listVerbosity({ verbosity: ctxVerbosity, verbosityExplicit }, equipments.length);
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);
    return textResponse(
      formatEquipmentsList(equipments, effectiveOffset, effectiveLimit, response.total, verbosity, notice)
    );
  } catch (error) {
    return internalErrorResponse('**Erro interno ao listar recursos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEquipmentsList };
