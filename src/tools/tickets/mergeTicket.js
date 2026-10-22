/**
 * Slice: merge_ticket — agrupa um ticket em outro (o agrupado e CANCELADO).
 *
 * Endpoint: POST /tickets/{ticket_number}/merge (via api.mergeTicket).
 * Operacao IRREVERSIVEL: nao existe "desagrupar". A API valida tudo de forma atomica e
 * devolve todos os bloqueios de uma vez em `detail.ticket[]` (422 `42209`, so em ingles);
 * este slice traduz as mensagens conhecidas para PT-BR com a acao sugerida.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, extractApiErrorCode, extractApiErrorDetail } = require('../_shared/errors');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');

const schema = {
  name: 'merge_ticket',
  description:
    'Agrupar um ticket em outro ("Agrupar ticket" do portal). O ticket `merge_ticket_number` é CANCELADO e o conteúdo dele ' +
    'vai para o ticket principal `ticket_number`, que é mantido: respostas, comunicações internas, apontamentos, valores extras, ' +
    'histórico, empréstimos de equipamento e anexos. NÃO migram e ficam no ticket cancelado: custos internos, checklists, campos ' +
    'personalizados, chats vinculados, URLs, assinaturas, tempos de SLA, pesquisa de satisfação e tickets filhos dele. Uma resposta ' +
    'automática é publicada no principal e pode gerar e-mail ao solicitante; o e-mail do solicitante e os seguidores do agrupado passam ' +
    'a seguir o principal. A operação é IRREVERSÍVEL (não existe desagrupar). ' +
    'ANTES de chamar, confirme com o usuário qual ticket fica e qual é cancelado, mostrando título e cliente dos dois (via `get_ticket`). ' +
    'Exige a permissão "Editar tickets". Bloqueios comuns: clientes diferentes, ticket já fechado/revisado, principal que é filho de ' +
    'outro, pré-apontamento pendente no agrupado.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket PRINCIPAL, que é mantido e recebe o conteúdo'
      },
      merge_ticket_number: {
        type: 'integer',
        description: 'Número do ticket a ser agrupado, que será CANCELADO (irreversível)'
      }
    },
    required: ['ticket_number', 'merge_ticket_number']
  }
};

// Mensagens conhecidas de `detail.ticket[]` (en.yml da API) -> PT-BR com acao sugerida.
// Ordem importa: a primeira regra que casa vence. Mensagem desconhecida aparece crua.
const BLOCKER_RULES = [
  [/cannot be grouped into itself/i, 'O ticket não pode ser agrupado nele mesmo.'],
  [/main ticket is closed/i, 'O ticket principal está fechado (ou cancelado). Reabra-o com `reopen_ticket` ou escolha outro principal.'],
  [/main ticket is linked to a parent/i, 'O ticket principal é filho de outro ticket. Use o ticket pai como principal.'],
  [/to be grouped is closed/i, 'O ticket a agrupar já está fechado ou cancelado.'],
  [/belongs to another client/i, 'Os tickets pertencem a clientes diferentes. Só é possível agrupar tickets do mesmo cliente.'],
  [/to be grouped is revised/i, 'O ticket a agrupar já foi revisado.'],
  [/pre-appointment/i, 'O ticket a agrupar tem pré-apontamento pendente. Conclua ou remova em `list_pre_appointments` e tente de novo.'],
  [/appointment type/i, 'As mesas têm tipos de apontamento diferentes e o ticket a agrupar tem apontamentos. Remova os apontamentos dele e tente de novo.'],
  [/could not be (canceled|merged)/i, 'A API não conseguiu cancelar/agrupar o ticket e desfez tudo. Tente novamente; se persistir, avise o suporte.']
];

function translateBlocker(message) {
  const rule = BLOCKER_RULES.find(([re]) => re.test(message));
  return rule ? rule[1] : message;
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function validationFailureResponse(response, ticketNumber, mergeNumber) {
  const detail = extractApiErrorDetail(response) || {};
  const rawBlockers = asList(detail.ticket);
  const blockers = rawBlockers.map(translateBlocker);
  const alreadyClosed = rawBlockers.some(m => /to be grouped is closed/i.test(m));

  if (blockers.length > 0) {
    return errorResponse(
      `**⚠️ Não foi possível agrupar o ticket #${mergeNumber} no #${ticketNumber}**\n\n` +
      blockers.map(b => `• ${b}`).join('\n') +
      (alreadyClosed
        ? `\n\n*Se o agrupamento pode ter sido concluído numa chamada anterior, confira com \`get_ticket\` (#${mergeNumber} e #${ticketNumber}) antes de tentar de novo.*`
        : `\n\n*Nada foi alterado.*`)
    );
  }

  if (asList(detail.merge_ticket_number).length > 0) {
    return errorResponse(
      `**⚠️ Ticket #${mergeNumber} não encontrado ou fora das suas mesas**\n\n` +
      `*O ticket a agrupar precisa existir e estar nas mesas/clientes que você acessa. Nada foi alterado.*`
    );
  }

  if (extractApiErrorCode(response) === 42202) {
    return errorResponse(
      `**⚠️ Requisição inválida ao agrupar tickets**\n\n` +
      `*Informe \`ticket_number\` e \`merge_ticket_number\` como inteiros positivos.*\n\n` +
      `**Mensagem:** ${response.error}`
    );
  }

  return null;
}

const UNCERTAIN_OUTCOME_STATUSES = new Set(['TIMEOUT', 'CONNECTION_ERROR', 'INTERNAL_ERROR']);

// Resultado incerto: falha de transporte (a resposta pode ter se perdido) ou HTTP 5xx no meio de uma escrita
// sem retry (nao ha garantia observavel de rollback atomico do lado da API).
function isUncertainOutcome(status) {
  return UNCERTAIN_OUTCOME_STATUSES.has(status) || (typeof status === 'number' && status >= 500);
}

function failureResponse(response, ticketNumber, mergeNumber) {
  if (response.status === 422) {
    const translated = validationFailureResponse(response, ticketNumber, mergeNumber);
    if (translated) return translated;
  }
  const base = ticketSubresourceErrorResponse(response, ticketNumber, {
    resourceLabel: 'o agrupamento',
    action: 'agrupar',
    permissionHint: '*É necessária a permissão "Editar tickets", e o ticket principal deve estar nas suas mesas/clientes.*'
  });
  if (!isUncertainOutcome(response.status)) return base;
  // Timeout/erro de rede/5xx: o servidor pode ter concluido o merge e a resposta se perdeu (sem retry automatico).
  base.content[0].text +=
    `\n\n*O resultado é incerto: confira com \`get_ticket\` (#${mergeNumber} e #${ticketNumber}) se o agrupamento já foi concluído antes de repetir a chamada.*`;
  return base;
}

function successText(ticketNumber, mergeNumber, response, verbosity) {
  const echo = response.data?.message;
  if (verbosity === 'compact') {
    return `Ticket #${mergeNumber} agrupado no #${ticketNumber}\n` +
      `Movido: respostas, apontamentos, valores extras, histórico, anexos\n` +
      `Ficou no #${mergeNumber} (cancelado): custos internos, checklists, campos personalizados, chats, filhos\n` +
      `Resposta automática publicada no #${ticketNumber} (pode gerar e-mail ao solicitante); solicitante e seguidores do #${mergeNumber} passam a seguir o #${ticketNumber}\n` +
      `Irreversível`;
  }
  return `**✅ Ticket #${mergeNumber} agrupado no #${ticketNumber}**\n\n` +
    `**Movido para o #${ticketNumber}:** respostas, comunicações internas, apontamentos, valores extras, histórico, ` +
    `empréstimos de equipamento e anexos.\n\n` +
    `**Ficou no #${mergeNumber} (agora cancelado):** custos internos, checklists, campos personalizados, chats vinculados, ` +
    `URLs, assinaturas, tempos de SLA, pesquisa de satisfação e tickets filhos.\n\n` +
    `Uma resposta automática foi publicada no #${ticketNumber} e pode ter gerado e-mail ao solicitante.\n\n` +
    `O e-mail do solicitante e os seguidores do #${mergeNumber} foram adicionados aos seguidores do #${ticketNumber}.\n\n` +
    `⚠️ **Esta operação não pode ser desfeita.**` +
    (echo ? `\n\n*API: ${echo}*` : '');
}

function parsePositiveInt(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value) > 0) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

async function execute(args, { api, verbosity }) {
  const ticketNumber = parsePositiveInt(args?.ticket_number);
  const mergeNumber = parsePositiveInt(args?.merge_ticket_number);

  if (ticketNumber === null || mergeNumber === null) {
    return errorResponse(
      `**❌ Parâmetros inválidos**\n\n` +
      `\`ticket_number\` e \`merge_ticket_number\` são obrigatórios e devem ser inteiros positivos.`
    );
  }
  if (ticketNumber === mergeNumber) {
    return errorResponse(`**❌ O ticket #${ticketNumber} não pode ser agrupado nele mesmo**\n\n*Informe dois tickets diferentes.*`);
  }

  try {
    const response = await api.mergeTicket(ticketNumber, mergeNumber);
    if (response.error) return failureResponse(response, ticketNumber, mergeNumber);
    return textResponse(successText(ticketNumber, mergeNumber, response, verbosity));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao agrupar tickets**\n\n**Erro:** ${error.message}\n\n` +
      `*Não repita a chamada sem antes conferir com \`get_ticket\` se o agrupamento foi concluído.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
