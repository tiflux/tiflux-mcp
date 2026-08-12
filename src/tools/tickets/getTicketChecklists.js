/**
 * Slice: get_ticket_checklists — lista os checklists (formulários) de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/checklists (via api.fetchTicketChecklists).
 * Retorna array paginado de checklists, cada um com campos (fields[]) tipados.
 * Útil para saber quais campos estão pendentes e por que um ticket não fecha.
 *
 * Irmão de get_ticket_shifts/get_ticket_service_types: mesma taxonomia de erro
 * via ticketSubresourceErrorResponse. Acrescenta paginação (padrão listEquipments).
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');
const { pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const RESOURCE_LABEL = 'checklists';

const schema = {
  name: 'get_ticket_checklists',
  description:
    'Listar os checklists (formulários) de um ticket, com todos os campos e estado de preenchimento. ' +
    'Útil para entender quais campos estão pendentes e por que o ticket não fecha — um checklist com ' +
    '`pending: true` significa que há campo obrigatório em branco bloqueando o fechamento. ' +
    'Cada campo exibe `index` (a única forma de referenciá-lo), tipo, obrigatoriedade, estado de preenchimento e valor/opções.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket para listar os checklists (ex: "98875", "123")'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

/**
 * Converte `value` (string | integer | boolean | null) para string legível.
 * Para `radio`: `value` é o id da opção escolhida — a exibição é o `description`
 * resolvido contra `options[]` (ver resolveRadioOption).
 */
function valueToString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Resolve a opção escolhida no campo `radio` comparando de forma tolerante
 * a tipo (string vs. number) — a API pode retornar `id: "2"` ou `id: 2`.
 * Retorna o `description` da opção ou, se não encontrar, o valor bruto.
 *
 * @param {string|number|null} value - id da opção escolhida
 * @param {Array|null} options - array de { id, description, value }
 * @returns {string|null}
 */
function resolveRadioOption(value, options) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(options) || options.length === 0) return String(value);
  const strValue = String(value);
  const found = options.find(opt => String(opt.id) === strValue);
  return found ? (found.description || String(found.id)) : String(value);
}

/**
 * Formata um timestamp da API em pt-BR, tolerando ausência E valor malformado.
 *
 * Sem a guarda de `Number.isNaN(d.getTime())`, uma string não-nula inválida
 * (ex: `'not-a-date'`) renderizaria o literal "Invalid Date" ao usuário —
 * aqui cai no mesmo placeholder de ausente ('—').
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (value === null || value === undefined || value === '') return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

/**
 * Formata um único campo do checklist em Markdown.
 * Destaca visualmente campos obrigatórios não preenchidos (bloqueiam o fechamento).
 *
 * @param {object} field
 * @returns {string}
 */
function formatField(field) {
  const index = field.index !== undefined ? field.index : '?';
  const title = field.title || '—';
  const type = field.type || '—';
  const required = field.required === true;
  const filled = field.filled === true;

  const requiredLabel = required ? '**obrigatório**' : 'opcional';
  const filledLabel = filled ? '✅ preenchido' : '⬜ em branco';

  const blocksClose = required && !filled;
  const blockMark = blocksClose ? ' 🚫 **BLOQUEIA FECHAMENTO**' : '';

  let line = `  **[${index}] ${title}**`;
  line += ` — tipo: \`${type}\` | ${requiredLabel} | ${filledLabel}${blockMark}\n`;

  // Mostrar valor/opções conforme o tipo
  if (type === 'text' || type === 'textarea' || type === 'value') {
    const val = valueToString(field.value);
    // Sem template literal aninhado (Sonar S4624): monta o rótulo antes de interpolar.
    const valLabel = val !== null ? `\`${val}\`` : '*— vazio —*';
    line += `    Valor: ${valLabel}\n`;
  } else if (type === 'radio') {
    const chosen = resolveRadioOption(field.value, field.options);
    line += `    Opção escolhida: ${chosen !== null ? chosen : '*— nenhuma —*'}\n`;
  } else if (type === 'checkbox') {
    const opts = Array.isArray(field.options) ? field.options : [];
    if (opts.length === 0) {
      line += `    Opções: *— nenhuma —*\n`;
    } else {
      line += `    Opções:\n`;
      opts.forEach(opt => {
        const checked = opt.value === true ? '☑' : '☐';
        const desc = opt.description || String(opt.id);
        line += `      ${checked} ${desc}\n`;
      });
    }
  }

  return line;
}

/**
 * Formata a listagem de checklists em Markdown.
 *
 * @param {string|number} ticketNumber
 * @param {Array} checklists
 * @param {number} offset
 * @param {number} limit
 * @param {number|undefined} total
 * @param {string} [verbosity]
 * @returns {string}
 */
function formatChecklistsList(ticketNumber, checklists, offset, limit, total, verbosity) {
  // Clamp espelha o de api.fetchTicketChecklists (offset >= 1, limit 1..200) — a
  // heurística de "última página" tem de usar o mesmo limit que a API aplicou.
  const clampedOffset = Math.max(1, Number.parseInt(offset, 10) || 1);
  const clampedLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));

  let text = `**📋 Checklists — Ticket #${ticketNumber}** (${checklists.length} checklist${checklists.length !== 1 ? 's' : ''})\n\n`;

  checklists.forEach((cl, idx) => {
    const name = cl.name || '—';
    const description = cl.description || null;
    const required = cl.required === true ? '⭕ obrigatório' : 'opcional';
    const pending = cl.pending === true ? '🚫 **pendente — bloqueia fechamento**' : '✅ sem pendências';
    const createdAt = formatTimestamp(cl.created_at);
    const updatedAt = formatTimestamp(cl.updated_at);

    text += `### ${idx + 1}. ${name}\n`;
    if (description) text += `*${description}*\n`;
    text += `• **Status:** ${pending}\n`;
    text += `• **Tipo:** ${required}\n`;
    text += `• **Criado em:** ${createdAt} | **Atualizado em:** ${updatedAt}\n`;

    const fields = Array.isArray(cl.fields) ? cl.fields : [];
    if (fields.length === 0) {
      text += `• *Nenhum campo cadastrado neste checklist.*\n`;
    } else {
      text += `• **Campos (${fields.length}):**\n`;
      fields.forEach(field => {
        text += formatField(field);
      });
    }

    text += '\n';
  });

  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: clampedOffset, limit: clampedLimit, count: checklists.length, total, unit: 'checklists' }, v);
  return `${text}${paginationInfo}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset = 1, limit = 20 } = args || {};

  requireField(args, 'ticket_number');

  try {
    const response = await api.fetchTicketChecklists(ticket_number, { offset, limit });

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, {
        resourceLabel: RESOURCE_LABEL,
        validationHint:
          '*A API v2 rejeitou o parâmetro `ticket_number`. Verifique se é um número inteiro maior que 0.*'
      });
    }

    const checklists = Array.isArray(response.data) ? response.data : [];
    const total = response.total;

    if (checklists.length === 0) {
      return textResponse(
        `**📋 Checklists — Ticket #${ticket_number}**\n\n` +
        `*Este ticket não possui checklists (formulários) vinculados.*\n\n` +
        `Checklists são formulários opcionais ou obrigatórios que podem ser exigidos para o fechamento do ticket. ` +
        `Quando não há nenhum, o ticket pode ser fechado normalmente (sem bloqueio por checklist pendente).`
      );
    }

    return textResponse(formatChecklistsList(ticket_number, checklists, offset, limit, total, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar checklists do ticket #${ticket_number}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, _formatChecklistsList: formatChecklistsList };
