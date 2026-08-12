/**
 * Slice: update_ticket_checklist_item — preenche ou limpa um campo de checklist de um ticket.
 *
 * Endpoint: PUT /tickets/{ticket_number}/checklists/{id}/items/{index}
 * (via api.updateTicketChecklistItem).
 *
 * Um campo por chamada (1:1 com a API v2). O payload é mutuamente exclusivo:
 *   - `value`   → text / textarea / value / radio; `null` limpa o campo.
 *   - `options` → checkbox (array de { id, checked }).
 *
 * Reusa _formatField do slice de leitura para renderizar o estado novo do campo.
 * Irmão de getTicketChecklists.js: mesma taxonomia de erro via ticketSubresourceErrorResponse.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField, requireIntField } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');
const { _formatField } = require('./getTicketChecklists');

const RESOURCE_LABEL = 'checklist item';

const schema = {
  name: 'update_ticket_checklist_item',
  description:
    'Preencher ou limpar um campo de checklist de um ticket. Um campo por chamada (1:1 com a API v2). ' +
    'Use `get_ticket_checklists` antes para obter `checklist_id`, `index` e os ids das opções. ' +
    'Payload mutuamente exclusivo: `value` (text/textarea/value/radio, ou `null` para limpar) ' +
    'XOR `options` (checkbox — array de `{ id, checked }`). ' +
    'Checklists sem `id` (não originados de modelo) e tickets fechados não podem ser atualizados.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket (ex: "98875", "123")'
      },
      checklist_id: {
        type: 'number',
        description: 'ID do checklist, conforme o campo `id` retornado por `get_ticket_checklists`'
      },
      index: {
        type: 'number',
        description: 'Posição (index) do campo dentro do checklist, conforme retornado por `get_ticket_checklists`'
      },
      value: {
        description:
          'Valor a preencher. Use para campos `text`, `textarea`, `value` (qualquer string/número) ' +
          'e `radio` (id da opção escolhida). Envie `null` para limpar qualquer tipo de campo. ' +
          'Mutuamente exclusivo com `options`.',
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }]
      },
      options: {
        type: 'array',
        description:
          'Opções do campo `checkbox`. Mutuamente exclusivo com `value`. ' +
          'Envie apenas as opções que deseja alterar — opções não citadas permanecem inalteradas. ' +
          'Use os ids expostos por `get_ticket_checklists` (incluindo `null` para a opção cabeçalho).',
        items: {
          type: 'object',
          properties: {
            id: {
              description: 'ID da opção (string, número ou null para a opção cabeçalho)',
              oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }]
            },
            checked: {
              type: 'boolean',
              description: 'true para marcar, false para desmarcar'
            }
          },
          required: ['id', 'checked']
        }
      }
    },
    required: ['ticket_number', 'checklist_id', 'index']
  }
};

/**
 * Valida o payload de escrita antes de chamar a API.
 * Retorna a mensagem de erro (string) ou null se válido.
 *
 * @param {object} args
 * @returns {string|null}
 */
function validatePayload(args) {
  const hasValue = 'value' in args;
  const hasOptions = 'options' in args;

  if (hasValue && hasOptions) {
    return '`value` e `options` são mutuamente exclusivos — envie apenas um dos dois.';
  }

  if (!hasValue && !hasOptions) {
    return 'É obrigatório enviar `value` (text/textarea/value/radio/null) ou `options` (checkbox).';
  }

  if (hasOptions) {
    const opts = args.options;
    if (!Array.isArray(opts) || opts.length === 0) {
      return '`options` deve ser um array com pelo menos uma opção.';
    }
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      if (typeof opt !== 'object' || opt === null) {
        return `\`options[${i}]\` deve ser um objeto com { id, checked }.`;
      }
      if (!('id' in opt)) {
        return `\`options[${i}]\` está faltando o campo \`id\`.`;
      }
      if (typeof opt.checked !== 'boolean') {
        return `\`options[${i}].checked\` deve ser um booleano (true/false).`;
      }
    }
  }

  return null;
}

/**
 * Formata o resultado do PUT em Markdown.
 * A API devolve o checklist inteiro — renderiza o campo atualizado (pelo index)
 * e o status de pending do checklist.
 *
 * @param {string|number} ticketNumber
 * @param {number} index
 * @param {object} checklist - objeto checklist retornado pela API
 * @returns {string}
 */
function formatUpdatedChecklist(ticketNumber, index, checklist) {
  const name = checklist.name || '—';
  const pending = checklist.pending === true
    ? '🚫 **pendente — ainda bloqueia fechamento**'
    : '✅ **sem pendências — checklist completo**';

  const fields = Array.isArray(checklist.fields) ? checklist.fields : [];
  const updatedField = fields.find(f => f.index === index);

  let fieldSection = '';
  if (updatedField) {
    fieldSection = `\n**Campo atualizado (index ${index}):**\n${_formatField(updatedField)}`;
  }

  return (
    `**✅ Campo do checklist atualizado com sucesso!**\n\n` +
    `**Ticket:** #${ticketNumber}\n` +
    `**Checklist:** ${name} (id: ${checklist.id !== undefined ? checklist.id : '—'})\n` +
    `**Status do checklist:** ${pending}` +
    fieldSection +
    `\n*✅ Campo atualizado via API TiFlux*`
  );
}

async function execute(args, { api }) {
  requireField(args, 'ticket_number');
  // checklist_id e index viram path params interpolados na URL (PUT /tickets/{n}/checklists/{id}/items/{index}):
  // validacao ESTRITA (requireIntField) para write op nunca mandar valor corrompido a API.
  // `index: 0` e legitimo — requireField trata 0 como presente e parseIntStrict aceita >= 0.
  const checklist_id = requireIntField(args, 'checklist_id');
  const index = requireIntField(args, 'index');

  const { ticket_number } = args;

  // Validação do payload (value XOR options)
  const validationError = validatePayload(args);
  if (validationError) {
    return errorResponse(
      `**⚠️ Payload inválido para \`update_ticket_checklist_item\`**\n\n` +
      `${validationError}`
    );
  }

  // Monta o body — só transporte; a API é quem valida compatibilidade de tipo
  const body = 'value' in args ? { value: args.value } : { options: args.options };

  try {
    const response = await api.updateTicketChecklistItem(ticket_number, checklist_id, index, body);

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, {
        resourceLabel: RESOURCE_LABEL,
        action: 'atualizar',
        validationHint:
          '*O atributo enviado é incompatível com o tipo do campo — ex: `value` não é aceito em campos `checkbox` ' +
          '(use `options`) e `options` não é aceito em campos de texto/radio (use `value`). ' +
          'Verifique o tipo do campo via `get_ticket_checklists` e ajuste o payload.*'
      });
    }

    const checklist = response.data;
    return textResponse(formatUpdatedChecklist(ticket_number, index, checklist));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar checklist item do ticket #${ticket_number}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, _formatUpdatedChecklist: formatUpdatedChecklist };
