/**
 * Slice: create_ticket — cria um novo ticket.
 *
 * Endpoint: POST /tickets (via api.createTicket).
 * Resolve client_name -> client_id (api.searchClients),
 * desk_name -> desk_id (api.searchDesks),
 * responsible_name -> responsible_id (api.searchUsers),
 * catalog_item_name -> services_catalogs_item_id (api.searchCatalogItems).
 * Falls back para TIFLUX_DEFAULT_{CLIENT,DESK,PRIORITY,CATALOG_ITEM}_ID do env
 * quando IDs nao informados.
 */

const { textResponse } = require('../_shared/response');
const { resolveDeskName } = require('../_shared/deskResolver');
const { markdownToHtml } = require('../_shared/markdownToHtml');

const schema = {
  name: 'create_ticket',
  description: 'Criar um novo ticket no TiFlux',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título do ticket' },
      description: { type: 'string', description: 'Descrição do ticket. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      client_id: { type: 'number', description: 'ID do cliente (opcional - usa TIFLUX_DEFAULT_CLIENT_ID se não informado)' },
      client_name: { type: 'string', description: 'Nome do cliente para busca automática (alternativa ao client_id)' },
      desk_id: { type: 'number', description: 'ID da mesa (opcional - usa TIFLUX_DEFAULT_DESK_ID se não informado)' },
      desk_name: { type: 'string', description: 'Nome da mesa para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados").' },
      priority_id: { type: 'number', description: 'ID da prioridade (opcional - usa TIFLUX_DEFAULT_PRIORITY_ID se não informado)' },
      services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo (opcional - usa TIFLUX_DEFAULT_CATALOG_ITEM_ID se não informado)' },
      catalog_item_name: { type: 'string', description: 'Nome do item de catálogo para busca automática (alternativa ao services_catalogs_item_id, requer desk_id ou desk_name)' },
      status_id: { type: 'number', description: 'ID do status (opcional)' },
      requestor_name: { type: 'string', description: 'Nome do solicitante (opcional)' },
      requestor_email: { type: 'string', description: 'Email do solicitante (opcional)' },
      requestor_telephone: { type: 'string', description: 'Telefone do solicitante (opcional)' },
      responsible_id: { type: 'number', description: 'ID do responsável (opcional)' },
      responsible_name: { type: 'string', description: 'Nome do responsável para busca automática (alternativa ao responsible_id)' },
      followers: { type: 'string', description: 'Emails dos seguidores separados por vírgula (opcional)' },
      parent_ticket_number: { type: 'number', description: 'Número do ticket pai. O ticket criado será vinculado como filho deste ticket.' }
    },
    required: ['title', 'description']
  }
};

async function execute(args, { api }) {
  const {
    title,
    description,
    client_id,
    client_name,
    desk_id,
    desk_name,
    priority_id,
    services_catalogs_item_id,
    catalog_item_name,
    status_id,
    requestor_name,
    requestor_email,
    requestor_telephone,
    responsible_id,
    responsible_name,
    followers,
    parent_ticket_number
  } = args;

  if (!title || !description) {
    throw new Error('title e description são obrigatórios');
  }

  const parsedParentTicketNumber = parent_ticket_number == null ? undefined : Number.parseInt(parent_ticket_number, 10);
  if (parsedParentTicketNumber !== undefined && (Number.isNaN(parsedParentTicketNumber) || parsedParentTicketNumber <= 0)) {
    return textResponse('**❌ parent_ticket_number inválido:** deve ser um número inteiro positivo.');
  }

  try {
    // Converter Markdown → HTML antes de enviar à API v2 (idempotente para HTML já presente)
    const descriptionHtml = markdownToHtml(description);

    let finalClientId = client_id;

    // Se client_name foi fornecido, buscar o ID do cliente
    if (client_name && !client_id) {
      const clientSearchResponse = await api.searchClients(client_name);

      if (clientSearchResponse.error) {
        return textResponse(
          `**❌ Erro ao buscar cliente "${client_name}"**\n\n` +
          `**Erro:** ${clientSearchResponse.error}\n\n` +
          `*Verifique se o nome do cliente está correto ou use client_id diretamente.*`
        );
      }

      const clients = clientSearchResponse.data || [];
      if (clients.length === 0) {
        return textResponse(
          `**❌ Cliente "${client_name}" não encontrado**\n\n` +
          `*Verifique se o nome está correto ou use client_id diretamente.*`
        );
      }

      if (clients.length > 1) {
        let clientsList = '**Clientes encontrados:**\n';
        clients.forEach((client, index) => {
          clientsList += `${index + 1}. **ID:** ${client.id} | **Nome:** ${client.name}\n`;
        });

        return textResponse(
          `**⚠️ Múltiplos clientes encontrados para "${client_name}"**\n\n` +
          `${clientsList}\n` +
          `*Use client_id específico ou seja mais específico no client_name.*`
        );
      }

      finalClientId = clients[0].id;
    }

    let finalDeskId = desk_id;

    // Se desk_name foi fornecido, buscar o ID da mesa
    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    let finalResponsibleId = responsible_id;

    // Se responsible_name foi fornecido, buscar o ID do usuario
    if (responsible_name && !responsible_id) {
      const userSearchResponse = await api.searchUsers({
        name: responsible_name,
        active: true,
        type: 'attendant', // Apenas atendentes podem ser responsaveis
        limit: 10
      });

      if (userSearchResponse.error) {
        return textResponse(
          `**Erro ao buscar usuario "${responsible_name}"**\n\n` +
          `**Erro:** ${userSearchResponse.error}\n\n` +
          `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`
        );
      }

      const users = userSearchResponse.data || [];
      if (users.length === 0) {
        return textResponse(
          `**Usuario "${responsible_name}" nao encontrado**\n\n` +
          `*Verifique se o nome esta correto ou use responsible_id diretamente.*`
        );
      }

      if (users.length > 1) {
        let usersList = '**Usuarios encontrados:**\n';
        users.forEach((user, index) => {
          usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
        });

        return textResponse(
          `**Multiplos usuarios encontrados para "${responsible_name}"**\n\n` +
          `${usersList}\n` +
          `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
        );
      }

      finalResponsibleId = users[0].id;
    }

    // Usar valores padrao das variaveis de ambiente se nao informados
    finalClientId = finalClientId || process.env.TIFLUX_DEFAULT_CLIENT_ID;
    finalDeskId = finalDeskId || process.env.TIFLUX_DEFAULT_DESK_ID;
    const finalPriorityId = priority_id || process.env.TIFLUX_DEFAULT_PRIORITY_ID;
    let finalCatalogItemId = services_catalogs_item_id || process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID;

    // Se catalog_item_name foi fornecido, buscar o ID do item de catalogo
    if (catalog_item_name && !services_catalogs_item_id && finalDeskId) {
      const catalogSearchResponse = await api.searchCatalogItems(finalDeskId, { limit: 200 });

      if (catalogSearchResponse.error) {
        return textResponse(
          `**Erro ao buscar item de catalogo "${catalog_item_name}"**\n\n` +
          `**Erro:** ${catalogSearchResponse.error}\n\n` +
          `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      const catalogItems = catalogSearchResponse.data || [];
      if (catalogItems.length === 0) {
        return textResponse(
          `**Nenhum item de catalogo encontrado na mesa ${finalDeskId}**\n\n` +
          `*Verifique se a mesa possui itens de catalogo configurados.*`
        );
      }

      // Filtrar por nome (busca parcial case-insensitive)
      const searchTerm = catalog_item_name.toLowerCase();
      const matchingItems = catalogItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
      );

      if (matchingItems.length === 0) {
        return textResponse(
          `**Item de catalogo "${catalog_item_name}" nao encontrado**\n\n` +
          `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      if (matchingItems.length > 1) {
        let itemsList = '**Itens de catalogo encontrados:**\n';
        matchingItems.forEach((item, index) => {
          itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
        });

        return textResponse(
          `**Multiplos itens de catalogo encontrados para "${catalog_item_name}"**\n\n` +
          `${itemsList}\n` +
          `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
        );
      }

      finalCatalogItemId = matchingItems[0].id;
    }

    if (!finalClientId || !finalDeskId) {
      throw new Error('client_id e desk_id são obrigatórios (configure TIFLUX_DEFAULT_CLIENT_ID e TIFLUX_DEFAULT_DESK_ID ou informe nos parâmetros)');
    }

    // Criar ticket via API
    const response = await api.createTicket({
      title,
      description: descriptionHtml,
      client_id: parseInt(finalClientId),
      desk_id: parseInt(finalDeskId),
      priority_id: finalPriorityId ? parseInt(finalPriorityId) : undefined,
      services_catalogs_item_id: finalCatalogItemId ? parseInt(finalCatalogItemId) : undefined,
      status_id: status_id ? parseInt(status_id) : undefined,
      requestor_name,
      requestor_email,
      requestor_telephone,
      responsible_id: finalResponsibleId ? parseInt(finalResponsibleId) : undefined,
      followers,
      parent_ticket_number: parsedParentTicketNumber
    });

    if (response.error) {
      return textResponse(
        `**❌ Erro ao criar ticket**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique os parâmetros e configurações.*`
      );
    }

    const ticket = response.data.ticket;

    const parentLine = parsedParentTicketNumber
      ? `**Ticket Pai:** #${parsedParentTicketNumber}\n`
      : '';

    return textResponse(
      `**✅ Ticket criado com sucesso!**\n\n` +
      `**Número:** #${ticket.ticket_number}\n` +
      `**Título:** ${ticket.title}\n` +
      `**Cliente:** ${ticket.client.name}\n` +
      `**Mesa:** ${ticket.desk.display_name}\n` +
      `**Status:** ${ticket.status.name}\n` +
      `**Prioridade:** ${ticket.priority?.name || 'N/A'}\n` +
      `**Criado em:** ${ticket.created_at}\n` +
      parentLine +
      `\n**URL Externa:** ${ticket.url_external_path}\n` +
      `**URL Interna:** ${ticket.url_internal_path}\n\n` +
      `*✅ Ticket criado via API TiFlux*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao criar ticket**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
