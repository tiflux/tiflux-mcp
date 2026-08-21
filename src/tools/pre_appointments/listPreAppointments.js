/**
 * Slice: list_pre_appointments — lista pre-apontamentos de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/pre-appointments (via api.listPreAppointments).
 * Paginacao offset/limit — nao ha outros filtros neste endpoint.
 *
 * Pre-apontamento e o registro de tempo em aberto de um ticket: o tecnico iniciou o
 * cronometro (init_time preenchido) e ainda nao encerrou (end_time nulo). Quando
 * encerrado, vira apontamento consolidado (ver list_appointments). end_time nulo
 * e o estado NORMAL de um pre-apontamento aberto — nao e dado faltante.
 *
 * Saida em tabela de 5 colunas: ID, Data, Inicio, Fim, Usuario.
 * end_time nulo/vazio → "em andamento"; demais campos nulos → "—".
 * Celulas passam por escapeCell (escapa `|`, colapsa quebras de linha).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { requireField } = require('../_shared/validators');
const { ticketNumberSchemaProperty, paginationSchemaProperties } = require('../_shared/schemaProps');
const { escapeCell } = require('../_shared/markdown');

const schema = {
  name: 'list_pre_appointments',
  description: 'Listar pre-apontamentos (registros de tempo em aberto) de um ticket especifico. ' +
    'Um pre-apontamento representa o cronometro rodando: init_time preenchido e end_time nulo (em andamento). ' +
    'Quando encerrado, vira apontamento consolidado — para apontamentos consolidados use list_appointments. ' +
    'Requer permissao "Criar e editar apontamentos" e licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Numero do ticket para listar os pre-apontamentos (obrigatorio)'),
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

/**
 * Formata a lista de pre-apontamentos em tabela Markdown de 5 colunas.
 * @param {string|number} ticketNumber
 * @param {Array} items
 * @param {number} offset
 * @param {number} limit
 * @param {string} verbosity
 * @param {number|undefined} total
 * @returns {string}
 */
function format(ticketNumber, items, offset, limit, verbosity, total) {
  const v = verbosity || 'rich';

  if (!items || items.length === 0) {
    return (
      `**Pre-apontamentos do Ticket #${ticketNumber}**\n\n` +
      `Nenhum pre-apontamento encontrado.\n\n` +
      `*Este ticket nao possui pre-apontamentos abertos no momento. ` +
      `Um pre-apontamento aparece quando um tecnico inicia o cronometro e ainda nao encerrou.*`
    );
  }

  const hasTotal = total !== undefined && total !== null && total !== items.length;
  const countLabel = hasTotal ? `${items.length} de ${total}` : `${items.length}`;

  let text = `**Pre-apontamentos do Ticket #${ticketNumber} (${countLabel})**\n\n`;
  text += '| ID | Data | Inicio | Fim | Usuario |\n';
  text += '|---|---|---|---|---|\n';

  items.forEach(item => {
    // escapeCell: um `|` ou quebra de linha vindo da API (ex: user.name "Ana | Admin")
    // quebraria a estrutura da tabela e deslocaria as colunas.
    const id = item.id != null ? escapeCell(item.id) : '—';
    const date = item.date ? escapeCell(item.date) : '—';
    const initTime = item.init_time ? escapeCell(item.init_time) : '—';
    // Vazio ("") tambem significa cronometro aberto — o contrato da Swagger usa null,
    // mas `!= null` deixaria uma string vazia apagar o estado central da tool.
    const endTime = item.end_time ? escapeCell(item.end_time) : 'em andamento';
    const userName = item.user?.name ? escapeCell(item.user.name) : '—';
    text += `| ${id} | ${date} | ${initTime} | ${endTime} | ${userName} |\n`;
  });

  const paginationInfo = pagination(
    { offset, limit, count: items.length, total, unit: 'pre-apontamentos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset, limit } = args;

  requireField(args, 'ticket_number');

  // Validacao de formato: ticket_number deve conter apenas digitos para evitar
  // path traversal no URL interpolado (/tickets/${ticket_number}/pre-appointments).
  if (!/^\d+$/.test(String(ticket_number))) {
    throw new Error('ticket_number deve conter apenas dígitos');
  }

  // Clamp identico ao aplicado em api.listPreAppointments, para que a heuristica
  // de "proxima pagina" no formatter use o mesmo limit que chegou a API (BL-008).
  const effectiveOffset = Math.max(1, parseInt(offset) || 1);
  const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));

  try {
    const response = await api.listPreAppointments(ticket_number, { offset: effectiveOffset, limit: effectiveLimit });

    if (response.error) {
      const code = response.status;
      if (code === 404) {
        return errorResponse(
          `**Erro ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
          `**Codigo:** 404\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se o ticket existe e se o numero esta correto.*`
        );
      }
      if (code === 403) {
        return errorResponse(
          `**Acesso negado ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
          `**Codigo:** 403\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Esta operacao requer a permissao "Criar e editar apontamentos" e licenca Tickets.*`
        );
      }
      if (code === 422) {
        return errorResponse(
          `**Parametros invalidos ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
          `**Codigo:** 422\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique os parametros enviados (ex: limit deve ser um numero entre 1 e 200).*`
        );
      }
      if (code === 401) {
        return errorResponse(
          `**Nao autorizado ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
          `**Codigo:** 401\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se sua chave de API e valida e nao expirou.*`
        );
      }
      return errorResponse(
        `**Erro ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
        `**Codigo:** ${code}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e configuracoes da API.*`
      );
    }

    const items = response.data || [];
    return textResponse(format(ticket_number, items, effectiveOffset, effectiveLimit, verbosity, response.total));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar pre-apontamentos do Ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format };
