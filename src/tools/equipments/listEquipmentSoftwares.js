/**
 * Slice: list_equipment_softwares — lista softwares instalados em um recurso.
 *
 * Endpoint: GET /equipments/{id}/softwares (via api.listEquipmentSoftwares).
 * Obrigatorio: equipment_id.
 *
 * IMPORTANTE: este endpoint NAO e paginado — retorna 400 se receber offset/limit
 * (validado contra API real em 2026-07-17). Schema nao expoe esses params.
 *
 * Recursos sem agente TiFlux instalado retornam lista vazia — o formatter
 * esclarece que o inventario so existe para maquinas com agente.
 *
 * Permissoes necessarias: "Visualizar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { footer } = require('../_shared/format');

const schema = {
  name: 'list_equipment_softwares',
  description:
    'Listar softwares instalados em um recurso/equipamento (coletados pelo agente TiFlux). ' +
    'Retorna tabela com nome, versao e fabricante de cada software. ' +
    'Obrigatorio: equipment_id (ID do recurso — use list_equipments para descobrir). ' +
    'ATENCAO: apenas recursos com o agente TiFlux instalado possuem inventario de softwares; ' +
    'recursos manuais (sem agente) retornam lista vazia. ' +
    'Requer permissao "Visualizar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      equipment_id: {
        type: 'number',
        description: 'ID do recurso/equipamento (obrigatorio — use list_equipments para descobrir)'
      }
    },
    required: ['equipment_id']
  }
};

function formatSoftwaresList(softwares, verbosity) {
  const v = verbosity || 'rich';

  if (!softwares || softwares.length === 0) {
    return (
      'Nenhum software encontrado para este recurso.\n\n' +
      '*Recursos sem o agente TiFlux instalado nao possuem inventario de softwares. ' +
      'Verifique se o agente esta instalado e ativo nesta maquina.*'
    );
  }

  let text = `**Softwares instalados (${softwares.length})**\n\n`;
  text += '| Nome | Versao | Fabricante |\n';
  text += '|---|---|---|\n';

  softwares.forEach(sw => {
    const vendor = sw.vendor || '—';
    text += `| ${sw.name || '—'} | ${sw.version || '—'} | ${vendor} |\n`;
  });

  const footerStr = footer(v);
  return footerStr ? `${text}\n${footerStr}` : text;
}

async function execute(args, { api, verbosity }) {
  try {
    // ID validado estritamente (inteiro) antes de virar path na URL — nunca
    // interpolar argumento MCP cru em `/equipments/${id}/softwares`.
    const equipmentId = requireIntField(args, 'equipment_id');
    const response = await api.listEquipmentSoftwares(equipmentId);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar softwares do recurso #${args.equipment_id}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o recurso existe e suas permissoes (requer "Visualizar recursos" e Licenca Tickets).*`
      );
    }

    const softwares = response.data || [];
    return textResponse(formatSoftwaresList(softwares, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao listar softwares do recurso #${args.equipment_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatSoftwaresList };
