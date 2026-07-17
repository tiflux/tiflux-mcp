/**
 * Slice: list_equipments — lista equipamentos/recursos da organizacao.
 *
 * Endpoint: GET /equipments (via api.listEquipments).
 * Filtros opcionais: client_id, include_manufacturer, include_system + paginacao.
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
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_equipments',
  description:
    'Listar equipamentos/recursos da organizacao. Retorna tabela com id, nome, cliente, tipo, grupo, status online e IP de cada recurso. ' +
    'Filtros opcionais: client_id (filtrar por cliente), include_manufacturer (incluir dados de hardware — fabricante, modelo, processador), ' +
    'include_system (incluir dados do sistema operacional). ' +
    'Campos de agente (online, IP, ultimo contato) so aparecem para maquinas com o agente TiFlux instalado — recursos manuais nao exibem esses dados. ' +
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
          'So preenchido em maquinas com agente. Default: false.'
      },
      include_system: {
        type: 'boolean',
        description:
          'Incluir dados do sistema operacional (nome, versao, kernel, timezone). ' +
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

function formatEquipmentsList(equipments, offset, limit, total, verbosity) {
  const v = verbosity || 'rich';

  if (!equipments || equipments.length === 0) {
    return 'Nenhum recurso encontrado.\n\n*Verifique os filtros aplicados e suas permissoes.*';
  }

  let text = `**Recursos (${equipments.length})**\n\n`;
  text += '| ID | Nome | Cliente | Tipo | Grupo | Online | IP |\n';
  text += '|---|---|---|---|---|---|---|\n';

  equipments.forEach(eq => {
    const clientName = eq.client?.name || '—';
    const typeName = eq.equipment_type?.name || '—';
    const groupName = eq.equipment_group?.name || '—';
    const withAgent = hasAgent(eq);
    const online = withAgent ? (eq.online ? '✅ Sim' : '❌ Não') : '—';
    const ip = withAgent ? (eq.ipv4 || '—') : '—';
    text += `| ${eq.id} | ${eq.name || '—'} | ${clientName} | ${typeName} | ${groupName} | ${online} | ${ip} |\n`;
  });

  // Bloco manufacturer (so quando solicitado e presente).
  // API v2 expoe apenas { serial, name, model } — nao ha CPU/RAM/disco neste endpoint.
  const withManufacturer = equipments.filter(eq => eq.manufacturer);
  if (withManufacturer.length > 0) {
    text += '\n**Hardware (fabricante):**\n';
    withManufacturer.forEach(eq => {
      const m = eq.manufacturer;
      const modelo = [m.name, m.model].filter(Boolean).join(' ') || '—';
      const tag = m.serial ? ` | TAG: ${m.serial}` : '';
      text += `• **${eq.name}** — ${modelo}${tag}\n`;
    });
  }

  // Bloco system (so quando solicitado e presente)
  const withSystem = equipments.filter(eq => eq.system);
  if (withSystem.length > 0) {
    text += '\n**Sistema operacional:**\n';
    withSystem.forEach(eq => {
      const s = eq.system;
      text += `• **${eq.name}** — ${s.name || '—'} ${s.version || ''} | Kernel: ${s.kernel || '—'} | Timezone: ${s.timezone || '—'}\n`;
    });
  }

  const paginationInfo = pagination(
    { offset, limit, count: equipments.length, total, unit: 'recursos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { client_id, include_manufacturer, include_system, limit, offset } = args;

  try {
    const filters = {};

    if (client_id !== undefined) filters.client_id = client_id;
    if (include_manufacturer) filters.include_manufacturer = true;
    if (include_system) filters.include_system = true;
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
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);
    return textResponse(
      formatEquipmentsList(equipments, effectiveOffset, effectiveLimit, response.total, verbosity)
    );
  } catch (error) {
    return internalErrorResponse('**Erro interno ao listar recursos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEquipmentsList };
