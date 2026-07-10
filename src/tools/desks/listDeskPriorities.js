/**
 * Slice: list_desk_priorities — lista prioridades de uma mesa.
 *
 * Endpoint: GET /desks/{id}/priorities
 * Aceita desk_id (direto) OU desk_name (fuzzy via resolveDeskName).
 * Se ambos informados, desk_id prevalece.
 * Suporta filtro opcional fuzzy por priority_name (client-side).
 * Retorna tabela Markdown com id, name, order, start_time, end_time.
 *
 * Uso tipico: descoberta de priority_id para uso em create_ticket/update_ticket.
 * Nota: a API nao suporta busca server-side por nome; o filtro e feito client-side
 * com fuzzyMatchItems() apos buscar ate `limit` registros.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_desk_priorities',
  description: 'Listar prioridades configuradas em uma mesa do TiFlux. Use para descobrir os IDs de prioridade antes de criar ou atualizar tickets (ex: "alta prioridade" → priority_id). Aceita desk_id (numerico) OU desk_name (nome parcial/fuzzy). Se ambos informados, desk_id prevalece. O filtro priority_name e feito client-side com fuzzy match apos buscar os registros da API.',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID numerico da mesa. Se informado, usa diretamente (nao chama busca fuzzy de mesa).'
      },
      desk_name: {
        type: 'string',
        description: 'Nome (parcial ou exato) da mesa. Aceita abreviacoes — ex: "suporte" resolve para a mesa de suporte. Alternativa ao desk_id.'
      },
      priority_name: {
        type: 'string',
        description: 'Filtro opcional por nome de prioridade (fuzzy client-side). Ex: "alta" filtra prioridades cujo nome contem "alta".'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatPriorities(priorities) {
  if (!priorities || priorities.length === 0) {
    return 'Nenhuma prioridade encontrada.\n\n*Esta mesa pode nao ter prioridades cadastradas ou o filtro aplicado nao retornou resultados.*';
  }

  let text = `**Prioridades da mesa (${priorities.length})**\n\n`;
  text += '| ID | Nome | Ordem | Inicio | Fim |\n';
  text += '|---|---|---|---|---|\n';

  priorities.forEach(priority => {
    const order = priority.order !== undefined ? priority.order : '—';
    const startTime = priority.start_time || '—';
    const endTime = priority.end_time || '—';
    text += `| ${priority.id} | ${priority.name || '—'} | ${order} | ${startTime} | ${endTime} |\n`;
  });

  text += '\n*Para criar ou atualizar um ticket com uma prioridade especifica, use o `id` da prioridade no parametro `priority_id`.*';
  return text;
}

async function execute(args, { api }) {
  const { desk_id, desk_name, priority_name, limit, offset } = args;

  if (!desk_id && !desk_name) {
    return errorResponse(
      '**Erro de validacao**\n\n' +
      '`desk_id` ou `desk_name` e obrigatorio.\n\n' +
      '*Informe o ID numerico da mesa (`desk_id`) ou um nome parcial/exato (`desk_name`).*'
    );
  }

  try {
    let finalDeskId = desk_id;

    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    const filters = {
      limit: limit || 20,
      offset: offset || 1
    };

    const response = await api.listDeskPriorities(finalDeskId, filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao buscar prioridades da mesa ID ${finalDeskId}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se a mesa existe e se voce tem permissao para acessar.*`
      );
    }

    let priorities = response.data || [];

    if (priority_name && priorities.length > 0) {
      const { matches } = fuzzyMatchItems(priority_name, priorities, item => item.name);
      if (matches.length === 0) {
        return textResponse(
          `**Nenhuma prioridade encontrada com o nome "${priority_name}"**\n\n` +
          `*Tente um termo diferente ou remova o filtro \`priority_name\` para ver todas as prioridades.*`
        );
      }
      priorities = matches.map(m => m.item);
    }

    return textResponse(formatPriorities(priorities));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar prioridades**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatPriorities };
