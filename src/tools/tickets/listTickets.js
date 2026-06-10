/**
 * Slice: list_tickets — lista tickets com filtros.
 *
 * Endpoint: GET /tickets (via api.listTickets).
 * Requer ao menos um filtro obrigatorio (desk_ids, desk_name, client_ids, client_name,
 * stage_ids, stage_name, responsible_ids, requestor_ids, requestor_email)
 * para evitar retorno massivo.
 * Resolve desk_name -> desk_id via smartSearchDesks; stage_name -> stage_id via searchStages.
 * Resolve client_name -> client_id via resolveClientName.
 * Repassa requestor_ids e requestor_email diretamente para a API.
 *
 * Heuristica mesa-first: quando o usuario referencia um nome sem qualificar a entidade,
 * use desk_name. So use client_name quando o usuario disser explicitamente "cliente" ou
 * "empresa". Para pessoas que abriram tickets, use requestor_email ou requestor_ids.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');

const schema = {
  name: 'list_tickets',
  description: `Lista tickets do TiFlux com filtros. Requer pelo menos um filtro obrigatorio.

**Heuristica mesa-first:** Quando o usuario referencia um nome sem qualificar a entidade (ex: "tickets do tuitui"), trate o termo como mesa (desk_name) — mesa = equipe e e o filtro mais comum. So use client_name se o usuario disser explicitamente "cliente", "empresa" ou nome corporativo. Para pessoas que abriram o ticket, use requestor_email ou requestor_ids (resolva o ID via search_user). Para o atendente atribuido, use responsible_ids (busque o ID via search_user). Em duvida, pergunte ao usuario.

| Entrada do usuario | Filtro a usar |
|---|---|
| "tickets do tuitui" (nome sem qualificar) | desk_name="tuitui" |
| "tickets da mesa X" ou "equipe Y" | desk_name |
| "tickets do cliente Z" ou "empresa ACME" | client_name |
| "tickets do Joao" (nome de pessoa) | requestor_email ou requestor_ids |
| "tickets atribuidos ao Joao" | responsible_ids (via search_user) |
| "tickets aberto por joao@empresa.com" | requestor_email |`,
  inputSchema: {
    type: 'object',
    properties: {
      desk_ids: { type: 'string', description: 'IDs das mesas separados por vírgula (ex: "1,2,3") - máximo 15 IDs' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_ids). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados"). **Prefira este campo quando o usuario der um nome sem qualificar a entidade.**' },
      client_ids: { type: 'string', description: 'IDs dos clientes (empresas) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar pela empresa contratante, nao pela pessoa que abriu o ticket.' },
      client_name: { type: 'string', description: 'Nome do cliente (empresa contratante) para busca automática (alternativa ao client_ids). Use **apenas** quando o usuario disser explicitamente "cliente", "empresa" ou der um nome corporativo conhecido. Para pessoa fisica, prefira requestor_email.' },
      stage_ids: { type: 'string', description: 'IDs dos estágios separados por vírgula (ex: "1,2,3") - máximo 15 IDs' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática (deve ser usado junto com desk_name)' },
      responsible_ids: { type: 'string', description: 'IDs dos responsáveis (atendentes atribuidos) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use quando o usuario disser "atribuido a", "responsavel", "atendente".' },
      requestor_ids: { type: 'string', description: 'IDs dos solicitantes (pessoa fisica que abriu o ticket) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar por **pessoa** (nao empresa). Resolva o ID via search_user(type="client").' },
      requestor_email: { type: 'string', description: 'Email do solicitante (pessoa que abriu o ticket). Use quando o usuario referencia uma **pessoa fisica** ou der um email diretamente. Evita round-trip de resolucao de ID.' },
      offset: { type: 'number', description: 'Número da página (padrão: 1)' },
      limit: { type: 'number', description: 'Número de tickets por página (padrão: 20, máximo: 200)' },
      is_closed: { type: 'boolean', description: 'Filtrar tickets fechados (padrão: false - apenas abertos)' },
      date_type: {
        type: 'string',
        enum: ['created_at', 'solved_in_time'],
        description: 'Tipo de data para filtro: "created_at" (data de criação, padrão) ou "solved_in_time" (data de resolução/fechamento)'
      },
      start_datetime: { type: 'string', description: 'Data/hora inicial do filtro no formato ISO 8601 (ex: "2024-05-15T00:00:00Z"). Filtra tickets com data >= start_datetime' },
      end_datetime: { type: 'string', description: 'Data/hora final do filtro no formato ISO 8601 (ex: "2024-05-15T23:59:59Z"). Filtra tickets com data <= end_datetime' }
    },
    required: []
  }
};

async function execute(args, { api }) {
  const {
    desk_ids,
    desk_name,
    client_ids,
    client_name,
    stage_ids,
    stage_name,
    responsible_ids,
    requestor_ids,
    requestor_email,
    offset,
    limit,
    is_closed,
    date_type,
    start_datetime,
    end_datetime
  } = args;

  // Validar se pelo menos um dos filtros obrigatorios foi informado
  if (!desk_ids && !desk_name && !client_ids && !client_name && !stage_ids && !stage_name && !responsible_ids && !requestor_ids && !requestor_email) {
    return errorResponse(
      `**⚠️ Filtro obrigatório não informado**\n\n` +
      `Você deve informar pelo menos um dos seguintes filtros:\n` +
      `• **desk_ids** - IDs das mesas (ex: "1,2,3")\n` +
      `• **desk_name** - Nome da mesa/equipe (ex: "tuitui") — **use quando o usuario der um nome sem qualificar**\n` +
      `• **client_ids** - IDs dos clientes/empresas (ex: "1,2,3")\n` +
      `• **client_name** - Nome do cliente/empresa (ex: "ACME")\n` +
      `• **stage_ids** - IDs dos estágios (ex: "1,2,3")\n` +
      `• **stage_name** - Nome do estágio (deve usar junto com desk_name, ex: "to do")\n` +
      `• **responsible_ids** - IDs dos responsáveis (ex: "1,2,3")\n` +
      `• **requestor_ids** - IDs dos solicitantes/pessoas (ex: "1,2,3")\n` +
      `• **requestor_email** - Email do solicitante (ex: "joao@empresa.com")\n\n` +
      `*Esta validação evita retornar uma quantidade excessiva de tickets.*`
    );
  }

  try {
    let finalDeskIds = desk_ids;
    let finalClientIds = client_ids;
    let finalStageIds = stage_ids;

    // Resolver nome da mesa em ID se fornecido
    if (desk_name && !desk_ids) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskIds = resolved.deskId.toString();

      // Se stage_name foi fornecido junto com desk_name, buscar o estagio
      if (stage_name && !stage_ids) {
        const stageSearchResponse = await api.searchStages(resolved.deskId);

        if (stageSearchResponse.error) {
          return errorResponse(
            `**❌ Erro ao buscar estágios da mesa "${desk_name}"**\n\n` +
            `**Erro:** ${stageSearchResponse.error}\n\n` +
            `*Verifique se a mesa existe e tem estágios configurados.*`
          );
        }

        const stages = stageSearchResponse.data || [];
        const matchingStages = stages.filter(stage =>
          stage.name.toLowerCase().includes(stage_name.toLowerCase())
        );

        if (matchingStages.length === 0) {
          const stagesList = stages.map(stage => `• ${stage.name}`).join('\n');
          return errorResponse(
            `**❌ Estágio "${stage_name}" não encontrado na mesa "${desk_name}"**\n\n` +
            `**Estágios disponíveis:**\n${stagesList}\n\n` +
            `*Use stage_ids diretamente ou ajuste o stage_name.*`
          );
        }

        if (matchingStages.length > 1) {
          let stagesList = '**Estágios encontrados:**\n';
          matchingStages.forEach((stage, index) => {
            stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name}\n`;
          });

          return errorResponse(
            `**⚠️ Múltiplos estágios encontrados para "${stage_name}" na mesa "${desk_name}"**\n\n` +
            `${stagesList}\n` +
            `*Use stage_ids específico ou seja mais específico no stage_name.*`
          );
        }

        finalStageIds = matchingStages[0].id.toString();
      }
    }

    // Resolver nome do cliente em ID se fornecido
    if (client_name && !client_ids) {
      const resolved = await resolveClientName(api, client_name);
      if (resolved.error) return resolved.response;
      finalClientIds = String(resolved.clientId);
    }

    // Preparar filtros para a API
    const filters = {};

    if (finalDeskIds) filters.desk_ids = finalDeskIds;
    if (finalClientIds) filters.client_ids = finalClientIds;
    if (finalStageIds) filters.stage_ids = finalStageIds;
    if (responsible_ids) filters.responsible_ids = responsible_ids;
    if (requestor_ids) filters.requestor_ids = requestor_ids;
    if (requestor_email) filters.requestor_email = requestor_email;
    if (offset) filters.offset = parseInt(offset);
    if (limit) filters.limit = parseInt(limit);
    if (is_closed !== undefined) filters.is_closed = is_closed;
    if (date_type) filters.date_type = date_type;
    if (start_datetime) filters.start_datetime = start_datetime;
    if (end_datetime) filters.end_datetime = end_datetime;

    // Chamar API para listar tickets
    const response = await api.listTickets(filters);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar tickets**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique os filtros informados e suas permissões.*`
      );
    }

    const tickets = response.data || [];

    if (tickets.length === 0) {
      return textResponse(
        `**📋 Nenhum ticket encontrado**\n\n` +
        `Não foram encontrados tickets com os filtros aplicados.\n\n` +
        `**Filtros utilizados:**\n` +
        (finalDeskIds ? `• Mesas: ${finalDeskIds}${desk_name ? ` (${desk_name})` : ''}\n` : '') +
        (finalClientIds ? `• Clientes: ${finalClientIds}${client_name ? ` (${client_name})` : ''}\n` : '') +
        (finalStageIds ? `• Estágios: ${finalStageIds}${stage_name ? ` (${stage_name})` : ''}\n` : '') +
        (responsible_ids ? `• Responsáveis: ${responsible_ids}\n` : '') +
        (requestor_ids ? `• Solicitantes: ${requestor_ids}\n` : '') +
        (requestor_email ? `• Email solicitante: ${requestor_email}\n` : '') +
        `• Status: ${is_closed ? 'Fechados' : 'Abertos'}\n\n` +
        `*Tente ajustar os filtros para encontrar tickets.*`
      );
    }

    // Formatar lista de tickets
    let ticketsList = `**📋 Lista de Tickets** (${tickets.length} encontrados)\n\n`;

    tickets.forEach((ticket, index) => {
      const ticketNumber = ticket.ticket_number || 'N/A';
      const title = ticket.title || 'Sem título';
      const clientName = ticket.client?.name || 'Cliente não informado';
      const deskName = ticket.desk?.name || 'Mesa não informada';
      const stageName = ticket.stage?.name || 'Estágio não informado';
      const responsibleName = ticket.responsible?.name || 'Não atribuído';
      const status = ticket.status?.name || 'Status não informado';
      const createdAt = ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('pt-BR') : 'Data não informada';

      // Resumo da descricao (primeiras 100 caracteres)
      let descriptionSummary = '';
      if (ticket.description) {
        descriptionSummary = ticket.description.length > 100
          ? ticket.description.substring(0, 100) + '...'
          : ticket.description;
        descriptionSummary = `\n   📄 ${descriptionSummary}`;
      }

      ticketsList += `**${index + 1}. Ticket #${ticketNumber}**\n` +
                    `   📝 **Título:** ${title}\n` +
                    `   👤 **Responsável:** ${responsibleName}\n` +
                    `   🏢 **Cliente:** ${clientName}\n` +
                    `   🗂️ **Mesa:** ${deskName}\n` +
                    `   📊 **Estágio:** ${stageName}\n` +
                    `   🚨 **Status:** ${status}\n` +
                    `   📅 **Criado em:** ${createdAt}${descriptionSummary}\n\n`;
    });

    // Informacoes de paginacao
    const currentOffset = filters.offset || 1;
    const currentLimit = filters.limit || 20;
    const hasMoreTickets = tickets.length === currentLimit; // Se retornou o limite maximo, pode ter mais

    let paginationInfo = `**📊 Paginação:**\n`;
    paginationInfo += `• Página atual: ${currentOffset}\n`;
    paginationInfo += `• Tickets por página: ${currentLimit}\n`;
    paginationInfo += `• Tickets nesta página: ${tickets.length}\n`;

    if (hasMoreTickets) {
      const nextOffset = currentOffset + 1;
      paginationInfo += `• Próxima página: Use \`offset: ${nextOffset}\` para ver mais tickets\n`;
    } else {
      paginationInfo += `• Esta é a última página disponível\n`;
    }

    return textResponse(`${ticketsList}${paginationInfo}\n*✅ Dados obtidos da API TiFlux em tempo real*`);
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar tickets**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
