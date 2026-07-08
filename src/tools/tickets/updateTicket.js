/**
 * Slice: update_ticket — atualiza um ticket existente.
 *
 * Endpoint: PUT /tickets/{ticket_number} (via api.updateTicket).
 * Resolve desk_name, stage_name (requer desk_id ou desk_name),
 * priority_name (requer desk_id ou desk_name, usa listDeskPriorities + fuzzy),
 * responsible_name, catalog_item_name (requer desk).
 * responsible_id=null remove o responsavel.
 * Envia apenas campos informados; se nenhum campo informado, retorna aviso.
 *
 * Frente 3: mapeia erros 42202 de transferencia (relacionamento de mesa ausente,
 * catalogo exigido) para mensagens amigaveis orientando o operador.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');

const schema = {
  name: 'update_ticket',
  description: `Atualizar um ticket existente no TiFlux.

**Heuristica mesa-first:** Quando o usuario referencia um nome sem qualificar a entidade, use desk_name. So use client_id se o usuario disser explicitamente "cliente" ou "empresa". Para pessoa, use responsible_name/responsible_id para atendente atribuido.

**Transferencia de mesa:** Ao mover o ticket para outra mesa, inclua priority_name ou priority_id para preservar a prioridade (prioridades sao escopadas por mesa e se perdem na transferencia). Se a mesa-destino exigir prioridade, a transferencia falha sem esse campo. NAO envie priority_change_reason em transferencia (a API rejeita; e ignorado automaticamente).

**Mudar prioridade sem transferir:** Use priority_id diretamente (sem desk) — priority_change_reason e OBRIGATORIO nesse caso. priority_name NAO serve para a mesa atual (exige informar mesa, que a API trata como transferencia).

**Solicitante (requestor):** Use requestor_id para trocar o solicitante do ticket (o solicitante deve pertencer ao mesmo cliente do ticket). Alternativamente use requestor_name para busca por nome — o MCP tenta GET /requestors e, em caso de 403, faz fallback para GET /clients/{id}/requestors. Conflito requestor_id + requestor_name: requestor_id tem prioridade. Tambem nao existe status_name — use status_id diretamente (nao ha endpoint de listagem de status por mesa na API v2).`,
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser atualizado (ex: "123", "456")' },
      title: { type: 'string', description: 'Novo título do ticket (opcional)' },
      description: { type: 'string', description: 'Nova descrição do ticket (opcional). Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      client_id: { type: 'number', description: 'Novo ID do cliente/empresa (opcional). Use quando o usuario disser explicitamente "cliente" ou "empresa".' },
      desk_id: { type: 'number', description: 'Novo ID da mesa (opcional). Transfere o ticket para outra mesa. Como estágios e prioridades são escopados por mesa, ao transferir sem informar stage_id/stage_name o MCP resolve automaticamente o 1º estágio da mesa-destino.' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados"). **Prefira este campo quando o usuario der um nome sem qualificar a entidade.**' },
      stage_id: { type: 'number', description: 'ID do estágio/fase do ticket (opcional)' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática (alternativa ao stage_id, requer desk_id ou desk_name)' },
      priority_id: { type: 'number', description: 'ID da prioridade do ticket (opcional). Prioridades são escopadas por mesa — use list_desk_priorities para descobrir IDs válidos na mesa-destino. Ao transferir de mesa, informe este campo (ou priority_name) para preservar a prioridade.' },
      priority_name: { type: 'string', description: 'Nome da prioridade para busca automática (requer desk_id ou desk_name para resolver). IMPORTANTE: como exige informar a mesa, a API interpreta como transferência — só funciona ao transferir para outra mesa. Para mudar a prioridade na mesa ATUAL do ticket, use priority_id diretamente (sem desk).' },
      priority_change_reason: { type: 'string', description: 'Motivo da mudança de prioridade (texto livre). OBRIGATÓRIO ao mudar a prioridade (priority_id) FORA de uma transferência de mesa — a API rejeita priority_id sem ele. NÃO deve ser usado durante transferência de mesa (a API rejeita); nesse caso é ignorado automaticamente.' },
      status_id: { type: 'number', description: 'ID do status do ticket (opcional). Não há endpoint de listagem de status por mesa na API v2 — informe o ID diretamente (sem status_name).' },
      responsible_id: { type: 'number', description: 'ID do responsável (opcional - use null ou omita para remover responsável)' },
      responsible_name: { type: 'string', description: 'Nome do responsável para busca automática (alternativa ao responsible_id)' },
      requestor_id: { type: 'number', description: 'ID do novo solicitante do ticket (opcional). O solicitante deve pertencer ao mesmo cliente vinculado ao ticket. Conflito com requestor_name: requestor_id tem prioridade.' },
      requestor_name: { type: 'string', description: 'Nome do solicitante para busca automática (alternativa ao requestor_id). Busca em GET /requestors (global) com fallback para GET /clients/{id}/requestors em caso de 403. Multiplos candidatos listam opções para desambiguação; zero → sugerir search_requestor. Conflito com requestor_id: requestor_id vence.' },
      followers: { type: 'string', description: 'E-mails dos seguidores separados por vírgula. ATENÇÃO: o valor enviado SUBSTITUI a lista atual de seguidores — para adicionar sem remover, consulte os seguidores atuais via get_ticket e envie a lista completa (atuais + novos). String vazia "" remove todos os seguidores.' },
      services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo para atualizar mesa com item específico (opcional)' },
      catalog_item_name: { type: 'string', description: 'Nome do item de catálogo para busca automática (alternativa ao services_catalogs_item_id, requer desk_id ou desk_name)' }
    },
    required: ['ticket_number']
  }
};

/**
 * Tenta mapear um erro 422 / error_code 42202 para uma mensagem amigavel.
 * Retorna string formatada se reconhecido, ou null caso contrario.
 *
 * @param {object} responseError — objeto de erro retornado por api.updateTicket
 * @param {string|number} deskRef — nome ou ID da mesa-destino (para mensagem)
 */
function mapTransferError422(responseError, deskRef) {
  if (!responseError) return null;
  // api.updateTicket sempre retorna error como string (ver tiflux-api.js _handleError);
  // se vier outro tipo, nao da pra casar por substring de forma confiavel — degradar p/ erro generico.
  if (typeof responseError !== 'string') return null;

  const errorText = responseError;

  // Relacionamento de mesa ausente
  if (errorText.includes('desk_id') && errorText.includes('relationship')) {
    const deskLabel = deskRef ? `**${deskRef}**` : 'a mesa-destino';
    return (
      `**Erro: ${deskLabel} não está vinculada à mesa atual do ticket.**\n\n` +
      `Para transferir, configure o relacionamento entre as mesas no TiFlux (Configurações → Mesas → Relacionamentos).\n\n` +
      `*Se você só quer alterar a prioridade na mesa atual (sem transferir), use \`priority_id\` diretamente — sem \`desk_id\`/\`desk_name\`. O \`priority_name\` exige informar a mesa, o que a API interpreta como transferência.*\n\n` +
      `**Detalhe da API:** ${errorText}`
    );
  }

  // Catalogo exigido pela mesa-destino
  if (errorText.includes('services_catalogs_item_id') && (errorText.includes('requires a services catalog') || errorText.includes('catalog item'))) {
    const deskLabel = deskRef ? `**${deskRef}**` : 'A mesa-destino';
    return (
      `**Erro: ${deskLabel} exige um item de catálogo de serviços.**\n\n` +
      `Informe \`catalog_item_name\` ou \`services_catalogs_item_id\` válido da mesa-destino antes de transferir.\n\n` +
      `**Detalhe da API:** ${errorText}`
    );
  }

  return null;
}

async function execute(args, { api }) {
  const {
    ticket_number,
    title,
    description,
    client_id,
    desk_id,
    desk_name,
    stage_id,
    stage_name,
    priority_id,
    priority_name,
    priority_change_reason,
    status_id,
    responsible_id,
    responsible_name,
    requestor_id,
    requestor_name,
    followers,
    services_catalogs_item_id,
    catalog_item_name
  } = args;

  requireField(args, 'ticket_number');

  // Track resolved names for the summary
  let resolvedDeskName = desk_name || null;
  let resolvedStageName = null;
  let resolvedPriorityName = priority_name || null;
  let resolvedResponsibleName = responsible_name || null;
  let resolvedCatalogItemName = catalog_item_name || null;
  let resolvedRequestorName = requestor_name || null;

  try {
    let finalDeskId = desk_id;
    let finalStageId = stage_id;
    let finalResponsibleId = responsible_id;
    let finalPriorityId = priority_id;

    // Se desk_name foi fornecido, buscar o ID da mesa
    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    // Resolver estagio: uma única chamada searchStages quando há mesa + (stage_name OU auto-resolve).
    // Caso 1: stage_name fornecido → encontrar ID por nome (requer desk).
    // Caso 2: mesa-destino nova sem stage_id/stage_name → auto-selecionar 1º estágio.
    // Ambos os caminhos reusam a mesma resposta da API (uma única chamada por execução).
    let autoResolvedStageId = null;
    let autoResolvedStageName = null;

    const needsStageResolution =
      (stage_name && !stage_id) ||
      (finalDeskId && !stage_id && !stage_name);

    if (needsStageResolution) {
      const deskIdForStage = finalDeskId || desk_id;

      if (!deskIdForStage) {
        // Só chega aqui se stage_name foi fornecido sem desk
        return errorResponse(
          `**Erro: desk_id ou desk_name obrigatorio para buscar estagio por nome**\n\n` +
          `*Para usar stage_name, informe tambem desk_id ou desk_name.*`
        );
      }

      const stagesResponse = await api.searchStages(Number.parseInt(deskIdForStage, 10));

      if (stagesResponse.error) {
        return errorResponse(
          `**Erro ao buscar estagios da mesa ID ${deskIdForStage}**\n\n` +
          `**Erro:** ${stagesResponse.error}\n\n` +
          `*Verifique se a mesa existe e possui estagios.*`
        );
      }

      const stages = stagesResponse.data || [];

      if (stage_name && !stage_id) {
        // Caso 1: resolver stage_name → stage_id
        const matchingStages = stages.filter(s =>
          s.name.toLowerCase().includes(stage_name.toLowerCase())
        );

        if (matchingStages.length === 0) {
          return errorResponse(
            `**Estagio "${stage_name}" nao encontrado na mesa ID ${deskIdForStage}**\n\n` +
            `*Verifique se o nome esta correto ou use stage_id diretamente.*`
          );
        }

        if (matchingStages.length > 1) {
          let stagesList = '**Estagios encontrados:**\n';
          matchingStages.forEach((stage, index) => {
            stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index}\n`;
          });

          return errorResponse(
            `**Multiplos estagios encontrados para "${stage_name}"**\n\n` +
            `${stagesList}\n` +
            `*Use stage_id especifico ou seja mais especifico no stage_name.*`
          );
        }

        finalStageId = matchingStages[0].id;
        resolvedStageName = matchingStages[0].name;
      } else {
        // Caso 2: auto-resolver 1º estágio da mesa-destino
        if (stages.length === 0) {
          return errorResponse(
            `**Erro: Mesa-destino ID ${deskIdForStage} não possui estágios configurados**\n\n` +
            `*Informe stage_name ou stage_id explicitamente.*`
          );
        }

        // Preferir o estagio com first_stage truthy (tolera bool/1/"true" da API); fallback: menor index
        let firstStage = stages.find(s => s.first_stage);
        if (!firstStage) {
          firstStage = stages.reduce((min, s) =>
            (s.index !== undefined && (min === null || s.index < min.index)) ? s : min, null
          );
        }
        if (!firstStage) {
          firstStage = stages[0];
        }
        finalStageId = firstStage.id;
        autoResolvedStageId = firstStage.id;
        autoResolvedStageName = firstStage.name || null;
      }
    }

    // Resolver priority_name → priority_id (requer desk)
    // Se priority_id ja foi fornecido, nao resolver priority_name
    if (priority_name && !priority_id) {
      const deskIdForPriority = finalDeskId;

      if (!deskIdForPriority) {
        return errorResponse(
          `**Erro: desk_id ou desk_name obrigatorio para buscar prioridade por nome**\n\n` +
          `*Para usar priority_name, informe tambem desk_id ou desk_name (da mesa-destino na transferencia).*`
        );
      }

      const priorityResponse = await api.listDeskPriorities(parseInt(deskIdForPriority));

      if (priorityResponse.error) {
        return errorResponse(
          `**Erro ao buscar prioridades da mesa ID ${deskIdForPriority}**\n\n` +
          `**Erro:** ${priorityResponse.error}\n\n` +
          `*Verifique se a mesa existe e possui prioridades configuradas.*`
        );
      }

      const priorities = priorityResponse.data || [];

      if (priorities.length === 0) {
        return errorResponse(
          `**Nenhuma prioridade encontrada na mesa ID ${deskIdForPriority}**\n\n` +
          `*Verifique se a mesa possui prioridades configuradas ou use priority_id diretamente.*`
        );
      }

      const { matches } = fuzzyMatchItems(priority_name, priorities, p => p.name);

      if (matches.length === 0) {
        return errorResponse(
          `**Prioridade "${priority_name}" nao encontrada na mesa ID ${deskIdForPriority}**\n\n` +
          `*Verifique se o nome esta correto ou use priority_id diretamente.*`
        );
      }

      if (matches.length > 1) {
        // Verificar se o melhor match e exato — se sim, usar sem ambiguidade
        const bestScore = matches[0].score;
        const tied = matches.filter(m => m.score === bestScore);
        if (tied.length > 1) {
          let prioritiesList = '**Prioridades encontradas:**\n';
          matches.forEach((m, index) => {
            prioritiesList += `${index + 1}. **ID:** ${m.item.id} | **Nome:** ${m.item.name}\n`;
          });

          return errorResponse(
            `**Multiplas prioridades encontradas para "${priority_name}"**\n\n` +
            `${prioritiesList}\n` +
            `*Use priority_id especifico ou seja mais especifico no priority_name.*`
          );
        }
      }

      finalPriorityId = matches[0].item.id;
      resolvedPriorityName = matches[0].item.name;
    }

    // Decisao 1b: se ha troca de mesa e nenhuma prioridade informada, verificar se a mesa-destino
    // exige prioridade (require_service_catalog_open_ticket=false implica priority obrigatorio).
    // Para isso, verificamos se a mesa nao tem catalogo mas tem prioridades configuradas,
    // e se a API retornar 422 de prioridade — tratamos via mapTransferError422 no bloco de erro.
    // Alternativa proativa: se ha troca de mesa, priority ausente, e a mesa nao tem catalogo
    // (require_service_catalog_open_ticket=false), retornar erro preventivo.
    // Implementacao: verificar GET /desks/{id} para saber se exige catalogo ou prioridade.
    // Nota: para manter a implementacao simples e sem GET extra por padrao, optamos por
    // tratar o erro 422 de forma amigavel (Frente 3) quando ocorrer, e documentar que o usuario
    // deve informar priority_name/priority_id ao transferir para mesa que exige prioridade.
    // O erro preventivo (1b) seria muito custoso (GET /desks/{id} sempre que ha troca).
    // Portanto: tratamento reativo via mapTransferError422 + mensagem do schema.

    // Se responsible_name foi fornecido, buscar o ID do usuario via resolver compartilhado.
    // Repassa deskId para desambiguacao server-side via GET /technical-users (quando ha mesa).
    if (responsible_name && !responsible_id) {
      const resolved = await resolveResponsibleName(api, responsible_name, {
        deskId: finalDeskId ? parseInt(finalDeskId) : undefined
      });
      if (resolved.error) return resolved.response;
      finalResponsibleId = resolved.userId;
      // Captura nome real resolvido (pode diferir do nome parcial informado)
      if (resolved.user && resolved.user.name) {
        resolvedResponsibleName = resolved.user.name;
      }
    }

    let finalCatalogItemId = services_catalogs_item_id;

    // Se catalog_item_name foi fornecido, buscar o ID do item de catalogo
    if (catalog_item_name && !services_catalogs_item_id) {
      const deskIdForCatalog = finalDeskId || desk_id;

      if (!deskIdForCatalog) {
        return errorResponse(
          `**Erro: desk_id ou desk_name obrigatorio para buscar item de catalogo por nome**\n\n` +
          `*Para usar catalog_item_name, informe tambem desk_id ou desk_name.*`
        );
      }

      const catalogSearchResponse = await api.searchCatalogItems(deskIdForCatalog, { limit: 200 });

      if (catalogSearchResponse.error) {
        return errorResponse(
          `**Erro ao buscar item de catalogo "${catalog_item_name}"**\n\n` +
          `**Erro:** ${catalogSearchResponse.error}\n\n` +
          `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      const catalogItems = catalogSearchResponse.data || [];
      if (catalogItems.length === 0) {
        return errorResponse(
          `**Nenhum item de catalogo encontrado na mesa ${deskIdForCatalog}**\n\n` +
          `*Verifique se a mesa possui itens de catalogo configurados.*`
        );
      }

      // Filtrar por nome (busca parcial case-insensitive)
      const searchTerm = catalog_item_name.toLowerCase();
      const matchingItems = catalogItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
      );

      if (matchingItems.length === 0) {
        return errorResponse(
          `**Item de catalogo "${catalog_item_name}" nao encontrado**\n\n` +
          `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      if (matchingItems.length > 1) {
        let itemsList = '**Itens de catalogo encontrados:**\n';
        matchingItems.forEach((item, index) => {
          itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
        });

        return errorResponse(
          `**Multiplos itens de catalogo encontrados para "${catalog_item_name}"**\n\n` +
          `${itemsList}\n` +
          `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
        );
      }

      finalCatalogItemId = matchingItems[0].id;
      resolvedCatalogItemName = matchingItems[0].name;
    }

    // Resolver requestor_name → ID (apenas quando requestor_name fornecido e requestor_id nao)
    // requestor_id tem prioridade sobre requestor_name (conflito → requestor_id vence).
    // Cadeia: GET /requestors (global) → fallback GET /clients/{id}/requestors em 403.
    // Degradacao graciosa: se ambas as fontes retornam 403, orienta usar requestor_id diretamente.
    let finalRequestorId = requestor_id !== undefined ? parseInt(requestor_id, 10) : undefined;

    if (requestor_name && requestor_id === undefined) {
      // Helper: detecta 403 no response de erro. Sinal primario e o status HTTP;
      // o texto 'forbidden' e fallback para respostas sem status estruturado.
      // (Evitamos casar o substring cru '403', que geraria falso-positivo em
      // mensagens de erro nao relacionadas a permissao que apenas contenham "403".)
      const isForbidden = (r) => r.status === 403 ||
        (typeof r.error === 'string' && r.error.toLowerCase().includes('forbidden'));

      // Tentativa 1: busca global GET /requestors
      const globalResponse = await api.searchRequestors({ name: requestor_name, limit: 20 });

      let candidates = null;
      let allForbidden = false;

      if (globalResponse.error) {
        if (isForbidden(globalResponse)) {
          // Tentativa 2 (fallback): GET /clients/{id}/requestors
          let resolvedClientId = client_id;
          let ticketFetchError = null;
          if (!resolvedClientId) {
            // Obter client_id do ticket atual (chamada extra somente nesse caminho)
            const ticketResp = await api.fetchTicket(ticket_number);
            if (!ticketResp.error && ticketResp.data) {
              resolvedClientId = ticketResp.data.client && ticketResp.data.client.id;
            } else {
              // fetchTicket falhou (rede/404/500): NAO e sinal de permissao. Guardamos o
              // erro real para nao mascara-lo como um 403 que pode nunca ter ocorrido.
              ticketFetchError = ticketResp.error || 'ticket sem client_id vinculado';
            }
          }

          if (resolvedClientId) {
            const clientResponse = await api.searchClientRequestors(resolvedClientId, { name: requestor_name, limit: 20 });
            if (clientResponse.error) {
              if (isForbidden(clientResponse)) {
                allForbidden = true;
              } else {
                return errorResponse(
                  `**Erro ao buscar solicitante "${requestor_name}"**\n\n` +
                  `**Erro:** ${clientResponse.error}\n\n` +
                  `*Use \`requestor_id\` diretamente ou verifique as permissões.*`
                );
              }
            } else {
              candidates = clientResponse.data || [];
            }
          } else if (ticketFetchError) {
            // Distingue "nao consegui buscar o ticket p/ tentar o fallback por cliente"
            // de "sem permissao" — a mensagem antiga afirmava 403 mesmo quando o problema
            // era outro (rede, ticket inexistente), mascarando a causa real.
            return errorResponse(
              `**Erro ao resolver solicitante "${requestor_name}"**\n\n` +
              `A busca global de solicitantes retornou 403 e não foi possível obter o \`client_id\` do ticket #${ticket_number} para tentar a busca por cliente.\n\n` +
              `**Detalhe:** ${ticketFetchError}\n\n` +
              `*Use \`requestor_id\` diretamente, ou informe \`client_id\` para tentar a busca por cliente.*`
            );
          } else {
            // Sem client_id disponivel: nao e possivel tentar fallback
            allForbidden = true;
          }
        } else {
          // Erro nao-403 na fonte global
          return errorResponse(
            `**Erro ao buscar solicitante "${requestor_name}"**\n\n` +
            `**Erro:** ${globalResponse.error}\n\n` +
            `*Use \`requestor_id\` diretamente ou verifique as permissões.*`
          );
        }
      } else {
        candidates = globalResponse.data || [];
      }

      if (allForbidden) {
        return errorResponse(
          `**Erro: sem permissão para buscar solicitantes por nome**\n\n` +
          `Sua chave de API não tem acesso aos endpoints de solicitantes (HTTP 403).\n\n` +
          `**Alternativa:** use \`requestor_id\` diretamente — obtenha o ID via \`search_requestor\` com outra conta ou pela interface do TiFlux.`
        );
      }

      if (candidates.length === 0) {
        return errorResponse(
          `**Solicitante "${requestor_name}" não encontrado**\n\n` +
          `*Verifique o nome ou use \`search_requestor\` com \`client_id\` para listar solicitantes válidos e copie o ID.*`
        );
      }

      if (candidates.length > 1) {
        let candidatesList = '**Candidatos encontrados:**\n';
        candidates.forEach((c, i) => {
          candidatesList += `${i + 1}. **ID:** ${c.id} | **Nome:** ${c.name} | **E-mail:** ${c.email || 'N/A'}\n`;
        });
        return errorResponse(
          `**Múltiplos solicitantes encontrados para "${requestor_name}"**\n\n` +
          `${candidatesList}\n` +
          `*Use \`requestor_id\` com o ID específico.*`
        );
      }

      finalRequestorId = candidates[0].id;
      resolvedRequestorName = candidates[0].name;
    }

    // isDeskTransfer = mesa foi informada (desk_id/desk_name) — mesmo criterio usado p/ auto-resolver estagio.
    const isDeskTransfer = finalDeskId !== undefined;

    // priority_change_reason e obrigatorio ao mudar prioridade FORA de transferencia (API 42201).
    if (finalPriorityId !== undefined && !isDeskTransfer &&
        (priority_change_reason === undefined || String(priority_change_reason).trim() === '')) {
      return errorResponse(
        `**Erro: priority_change_reason obrigatório ao alterar a prioridade**\n\n` +
        `*A API v2 exige um motivo (priority_change_reason) ao mudar a prioridade de um ticket fora de uma transferência de mesa.*`
      );
    }

    // Preparar dados de atualizacao (apenas campos fornecidos)
    const updateData = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = markdownToHtml(description);
    if (client_id !== undefined) updateData.client_id = parseInt(client_id);
    if (finalDeskId !== undefined) updateData.desk_id = parseInt(finalDeskId);
    if (finalStageId !== undefined) updateData.stage_id = parseInt(finalStageId);
    if (finalPriorityId !== undefined) updateData.priority_id = parseInt(finalPriorityId);
    // Regras da API v2 para priority_change_reason (validadas via teste em producao 2026-06-18):
    //  - Mudanca de prioridade SEM transferencia de mesa → priority_change_reason e OBRIGATORIO
    //    (a API retorna 42201 "Cannot send :priority_id without :priority_change_reason" sem ele).
    //  - DURANTE transferencia de mesa → priority_change_reason e PROIBIDO
    //    (a API retorna 42202 "not allowed during desk transfer" se enviado).
    let priorityReasonDropped = false;
    if (finalPriorityId !== undefined && !isDeskTransfer) {
      updateData.priority_change_reason = priority_change_reason;
    } else if (priority_change_reason !== undefined && isDeskTransfer) {
      // Usuario passou reason numa transferencia — a API rejeitaria; descartamos e avisamos no resumo.
      priorityReasonDropped = true;
    }
    if (status_id !== undefined) updateData.status_id = parseInt(status_id);
    if (followers !== undefined) updateData.followers = followers;
    if (finalCatalogItemId !== undefined) updateData.services_catalogs_item_id = parseInt(finalCatalogItemId);

    // Tratamento especial para responsible_id (pode ser null)
    if (finalResponsibleId !== undefined) {
      updateData.responsible_id = finalResponsibleId ? parseInt(finalResponsibleId) : null;
    }

    // finalRequestorId ja e numerico (parseInt do requestor_id ou candidates[0].id da API);
    // normalizamos com radix 10 sem reparsear redundantemente.
    if (finalRequestorId !== undefined) updateData.requestor_id = parseInt(finalRequestorId, 10);

    // Verificar se ha campos para atualizar
    if (Object.keys(updateData).length === 0) {
      return errorResponse(
        `**⚠️ Nenhum campo informado para atualização**\n\n` +
        `**Ticket ID:** #${ticket_number}\n\n` +
        `*Informe pelo menos um campo para atualizar: title, description, client_id, desk_id, stage_id, priority_id, priority_name, status_id, responsible_id, requestor_id, requestor_name, followers*`
      );
    }

    // Atualizar ticket via API
    const response = await api.updateTicket(ticket_number, updateData);

    if (response.error) {
      // Frente 3: mapear erros 42202 de transferencia para mensagens amigaveis
      const deskRef = resolvedDeskName || (finalDeskId ? `ID ${finalDeskId}` : null);
      const friendlyError = mapTransferError422(response.error, deskRef);
      if (friendlyError) {
        return errorResponse(`**❌ Erro ao atualizar ticket #${ticket_number}**\n\n${friendlyError}`);
      }

      // Requestor not found (422 detail.requestor_id → "requestor not found")
      if (typeof response.error === 'string' &&
          response.error.includes('requestor_id') &&
          response.error.toLowerCase().includes('requestor not found')) {
        const clientRef = client_id ? `client_id=${client_id}` : 'o client_id do ticket';
        return errorResponse(
          `**❌ Erro ao atualizar ticket #${ticket_number}**\n\n` +
          `**Erro: solicitante não encontrado ou não pertence ao cliente deste ticket.**\n\n` +
          `O \`requestor_id\` informado não existe ou não está vinculado ao cliente do ticket.\n\n` +
          `Use \`search_requestor\` com ${clientRef} para localizar solicitantes válidos.\n\n` +
          `**Detalhe da API:** ${response.error}`
        );
      }

      return errorResponse(
        `**❌ Erro ao atualizar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para editá-lo.*`
      );
    }

    // Preparar resumo das alteracoes — exibir nome + ID quando disponivel; fallback "ID X" para IDs crus
    let changesText = '**Alterações realizadas:**\n';
    if (title !== undefined) changesText += `• Título: ${title}\n`;
    if (description !== undefined) changesText += `• Descrição: ${description.substring(0, 50)}...\n`;
    if (client_id !== undefined) changesText += `• Cliente ID: ${client_id}\n`;
    if (finalDeskId !== undefined) {
      const deskLabel = resolvedDeskName ? `${resolvedDeskName} (ID ${finalDeskId})` : `ID ${finalDeskId}`;
      changesText += `• Mesa transferida: ${deskLabel}\n`;
      if (autoResolvedStageId !== null) {
        const stageLabel = autoResolvedStageName ? `${autoResolvedStageName} (ID ${autoResolvedStageId})` : `ID ${autoResolvedStageId}`;
        changesText += `• Estágio auto-resolvido: ${stageLabel} (1º estágio da mesa-destino)\n`;
      }
    }
    if (finalStageId !== undefined && autoResolvedStageId === null) {
      const stageLabel = resolvedStageName ? `${resolvedStageName} (ID ${finalStageId})` : `ID ${finalStageId}`;
      changesText += `• Estágio: ${stageLabel}\n`;
    }
    if (finalPriorityId !== undefined) {
      const priorityLabel = resolvedPriorityName ? `${resolvedPriorityName} (ID ${finalPriorityId})` : `ID ${finalPriorityId}`;
      changesText += `• Prioridade: ${priorityLabel}\n`;
    }
    if (updateData.priority_change_reason !== undefined) changesText += `• Motivo da mudança de prioridade: ${priority_change_reason}\n`;
    if (priorityReasonDropped) changesText += `• ⚠️ priority_change_reason ignorado: a API v2 não permite motivo de mudança de prioridade durante transferência de mesa\n`;
    if (status_id !== undefined) changesText += `• Status ID: ${status_id}\n`;
    if (finalResponsibleId !== undefined) {
      if (finalResponsibleId === null || finalResponsibleId === 0) {
        changesText += `• Responsável: Removido (não atribuído)\n`;
      } else {
        const respLabel = resolvedResponsibleName ? `${resolvedResponsibleName} (ID ${finalResponsibleId})` : `ID ${finalResponsibleId}`;
        changesText += `• Responsável: ${respLabel}\n`;
      }
    }
    if (finalRequestorId !== undefined) {
      // requestor_name resolvido → mostra nome + ID; requestor_id direto → mostra só ID
      const resolvedViaName = requestor_name && requestor_id === undefined;
      const requestorLabel = resolvedViaName && resolvedRequestorName
        ? `${resolvedRequestorName} (ID ${finalRequestorId})`
        : `ID ${finalRequestorId}`;
      changesText += `• Solicitante: ${requestorLabel}\n`;
    }
    if (followers !== undefined) {
      if (followers === '') {
        changesText += `• Seguidores: todos removidos\n`;
      } else {
        changesText += `• Seguidores (lista substituída): ${followers}\n`;
      }
    }
    if (finalCatalogItemId !== undefined) {
      const catalogLabel = resolvedCatalogItemName ? `${resolvedCatalogItemName} (ID ${finalCatalogItemId})` : `ID ${finalCatalogItemId}`;
      changesText += `• Item de Catálogo: ${catalogLabel}\n`;
    }

    return textResponse(
      `**✅ Ticket #${ticket_number} atualizado com sucesso!**\n\n` +
      `${changesText}\n` +
      `**Atualizado em:** ${new Date().toISOString()}\n\n` +
      `*✅ Ticket atualizado via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
