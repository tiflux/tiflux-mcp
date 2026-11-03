/**
 * Resolvers por nome do slice `update_ticket` (estagio, prioridade, item de catalogo
 * e solicitante). Extraidos de updateTicket.js para manter a complexidade do slice
 * sob controle. Cada resolver devolve `{ error: <resposta MCP> }` ou o valor resolvido.
 *
 * Match por nome: o match EXATO unico (normalizado: caixa e acento) vence a substring
 * ("pendente" resolve "Pendente" mesmo existindo "Pendente cliente"). H48a — o helper
 * `matchByName` vive em `_shared/fuzzyMatch.js` (compartilhado com list_tickets).
 */

const { errorResponse } = require('../_shared/errors');
const { fuzzyMatchItems, normalizeText, matchByName } = require('../_shared/fuzzyMatch');

async function fetchStages(api, deskId) {
  const stagesResponse = await api.searchStages(Number.parseInt(deskId, 10), { limit: 200 });
  if (stagesResponse.error) {
    return {
      error: errorResponse(
        `**Erro ao buscar estagios da mesa ID ${deskId}**\n\n` +
        `**Erro:** ${stagesResponse.error}\n\n` +
        `*Verifique se a mesa existe e possui estagios.*`
      )
    };
  }
  return { stages: stagesResponse.data || [] };
}

/** stage_name → { stageId, stageName } na mesa `deskId`. */
async function resolveStageByName(api, deskId, stageName) {
  const fetched = await fetchStages(api, deskId);
  if (fetched.error) return fetched;

  const matching = matchByName(fetched.stages, stageName, s => s.name);

  if (matching.length === 0) {
    return {
      error: errorResponse(
        `**Estagio "${stageName}" nao encontrado na mesa ID ${deskId}**\n\n` +
        `*Verifique se o nome esta correto ou use stage_id diretamente.*`
      )
    };
  }

  if (matching.length > 1) {
    let stagesList = '**Estagios encontrados:**\n';
    matching.forEach((stage, index) => {
      stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index}\n`;
    });
    return {
      error: errorResponse(
        `**Multiplos estagios encontrados para "${stageName}"**\n\n` +
        `${stagesList}\n` +
        `*Use stage_id especifico ou seja mais especifico no stage_name.*`
      )
    };
  }

  return { stageId: matching[0].id, stageName: matching[0].name };
}

/** 1o estagio da mesa-destino (transferencia sem stage_id/stage_name). */
async function resolveFirstStage(api, deskId) {
  const fetched = await fetchStages(api, deskId);
  if (fetched.error) return fetched;

  const { stages } = fetched;
  if (stages.length === 0) {
    return {
      error: errorResponse(
        `**Erro: Mesa-destino ID ${deskId} não possui estágios configurados**\n\n` +
        `*Informe stage_name ou stage_id explicitamente.*`
      )
    };
  }

  // Preferir first_stage truthy (tolera bool/1/"true" da API); fallback: menor index
  let firstStage = stages.find(s => s.first_stage);
  if (!firstStage) {
    firstStage = stages.reduce((min, s) =>
      (s.index !== undefined && (min === null || s.index < min.index)) ? s : min, null
    );
  }
  if (!firstStage) firstStage = stages[0];

  return { stageId: firstStage.id, stageName: firstStage.name || null };
}

/** priority_name → { priorityId, priorityName } na mesa `deskId`. */
async function resolvePriorityByName(api, deskId, priorityName) {
  const priorityResponse = await api.listDeskPriorities(Number.parseInt(deskId, 10), { limit: 200 });

  if (priorityResponse.error) {
    return {
      error: errorResponse(
        `**Erro ao buscar prioridades da mesa ID ${deskId}**\n\n` +
        `**Erro:** ${priorityResponse.error}\n\n` +
        `*Verifique se a mesa existe e possui prioridades configuradas.*`
      )
    };
  }

  const priorities = priorityResponse.data || [];

  if (priorities.length === 0) {
    return {
      error: errorResponse(
        `**Nenhuma prioridade encontrada na mesa ID ${deskId}**\n\n` +
        `*Verifique se a mesa possui prioridades configuradas ou use priority_id diretamente.*`
      )
    };
  }

  const { matches } = fuzzyMatchItems(priorityName, priorities, p => p.name);

  if (matches.length === 0) {
    return {
      error: errorResponse(
        `**Prioridade "${priorityName}" nao encontrada na mesa ID ${deskId}**\n\n` +
        `*Verifique se o nome esta correto ou use priority_id diretamente.*`
      )
    };
  }

  if (matches.length > 1) {
    const bestScore = matches[0].score;
    const tied = matches.filter(m => m.score === bestScore);
    if (tied.length > 1) {
      let prioritiesList = '**Prioridades encontradas:**\n';
      matches.forEach((m, index) => {
        prioritiesList += `${index + 1}. **ID:** ${m.item.id} | **Nome:** ${m.item.name}\n`;
      });
      return {
        error: errorResponse(
          `**Multiplas prioridades encontradas para "${priorityName}"**\n\n` +
          `${prioritiesList}\n` +
          `*Use priority_id especifico ou seja mais especifico no priority_name.*`
        )
      };
    }
  }

  return { priorityId: matches[0].item.id, priorityName: matches[0].item.name };
}

/** catalog_item_name → { itemId, itemName } na mesa `deskId`. */
async function resolveCatalogItemByName(api, deskId, itemName) {
  const catalogSearchResponse = await api.searchCatalogItems(deskId, { limit: 200 });

  if (catalogSearchResponse.error) {
    return {
      error: errorResponse(
        `**Erro ao buscar item de catalogo "${itemName}"**\n\n` +
        `**Erro:** ${catalogSearchResponse.error}\n\n` +
        `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
      )
    };
  }

  const catalogItems = catalogSearchResponse.data || [];
  if (catalogItems.length === 0) {
    return {
      error: errorResponse(
        `**Nenhum item de catalogo encontrado na mesa ${deskId}**\n\n` +
        `*Verifique se a mesa possui itens de catalogo configurados.*`
      )
    };
  }

  const matchingItems = matchByName(catalogItems, itemName, item => item.name);

  if (matchingItems.length === 0) {
    return {
      error: errorResponse(
        `**Item de catalogo "${itemName}" nao encontrado**\n\n` +
        `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
      )
    };
  }

  if (matchingItems.length > 1) {
    let itemsList = '**Itens de catalogo encontrados:**\n';
    matchingItems.forEach((item, index) => {
      itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
    });
    return {
      error: errorResponse(
        `**Multiplos itens de catalogo encontrados para "${itemName}"**\n\n` +
        `${itemsList}\n` +
        `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
      )
    };
  }

  return { itemId: matchingItems[0].id, itemName: matchingItems[0].name };
}

// Sinal primario de 403 e o status HTTP; o texto 'forbidden' e fallback para respostas sem
// status estruturado. (Nao casar o substring cru '403': falso-positivo em mensagens alheias.)
function isForbidden(r) {
  return r.status === 403 ||
    (typeof r.error === 'string' && r.error.toLowerCase().includes('forbidden'));
}

function requestorSearchError(name, error) {
  return errorResponse(
    `**Erro ao buscar solicitante "${name}"**\n\n` +
    `**Erro:** ${error}\n\n` +
    `*Use \`requestor_id\` diretamente ou verifique as permissões.*`
  );
}

/**
 * Obtem candidatos a solicitante. Cadeia: GET /requestors (global) → fallback
 * GET /clients/{id}/requestors em 403. `clientHint` (client_id informado) tem prioridade;
 * sem ele, o client_id vem do ticket via `getTicket()` (memoizado no slice).
 * Retorna { candidates } ou { error }.
 */
async function fetchRequestorCandidates({ api, name, ticketNumber, clientHint, getTicket }) {
  const globalResponse = await api.searchRequestors({ name, limit: 20 });

  if (!globalResponse.error) return { candidates: globalResponse.data || [] };
  if (!isForbidden(globalResponse)) return { error: requestorSearchError(name, globalResponse.error) };

  // Fallback por cliente
  let clientId = clientHint;
  let ticketFetchError = null;
  if (!clientId) {
    const ticketResp = await getTicket();
    if (!ticketResp.error && ticketResp.data) {
      clientId = ticketResp.data.client && ticketResp.data.client.id;
    } else {
      // fetchTicket falhou (rede/404/500): NAO e sinal de permissao — guardar o erro real.
      ticketFetchError = ticketResp.error || 'ticket sem client_id vinculado';
    }
  }

  if (clientId) {
    const clientResponse = await api.searchClientRequestors(clientId, { name, limit: 20 });
    if (!clientResponse.error) return { candidates: clientResponse.data || [] };
    if (!isForbidden(clientResponse)) return { error: requestorSearchError(name, clientResponse.error) };
    return { allForbidden: true };
  }

  if (ticketFetchError) {
    return {
      error: errorResponse(
        `**Erro ao resolver solicitante "${name}"**\n\n` +
        `A busca global de solicitantes retornou 403 e não foi possível obter o \`client_id\` do ticket #${ticketNumber} para tentar a busca por cliente.\n\n` +
        `**Detalhe:** ${ticketFetchError}\n\n` +
        `*Use \`requestor_id\` diretamente, ou informe \`client_id\` para tentar a busca por cliente.*`
      )
    };
  }

  return { allForbidden: true };
}

/** requestor_name → { requestorId, requestorName }. */
async function resolveRequestorByName(opts) {
  const { name } = opts;
  const found = await fetchRequestorCandidates(opts);
  if (found.error) return found;

  if (found.allForbidden) {
    return {
      error: errorResponse(
        `**Erro: sem permissão para buscar solicitantes por nome**\n\n` +
        `Sua chave de API não tem acesso aos endpoints de solicitantes (HTTP 403).\n\n` +
        `**Alternativa:** use \`requestor_id\` diretamente — obtenha o ID via \`search_requestor\` com outra conta ou pela interface do TiFlux.`
      )
    };
  }

  const exact = found.candidates.filter(c => normalizeText(c.name) === normalizeText(name));
  const candidates = exact.length === 1 ? exact : found.candidates;

  if (candidates.length === 0) {
    return {
      error: errorResponse(
        `**Solicitante "${name}" não encontrado**\n\n` +
        `*Verifique o nome ou use \`search_requestor\` com \`client_id\` para listar solicitantes válidos e copie o ID.*`
      )
    };
  }

  if (candidates.length > 1) {
    let candidatesList = '**Candidatos encontrados:**\n';
    candidates.forEach((c, i) => {
      candidatesList += `${i + 1}. **ID:** ${c.id} | **Nome:** ${c.name} | **E-mail:** ${c.email || 'N/A'}\n`;
    });
    return {
      error: errorResponse(
        `**Múltiplos solicitantes encontrados para "${name}"**\n\n` +
        `${candidatesList}\n` +
        `*Use \`requestor_id\` com o ID específico.*`
      )
    };
  }

  return { requestorId: candidates[0].id, requestorName: candidates[0].name };
}

module.exports = {
  resolveStageByName,
  resolveFirstStage,
  resolvePriorityByName,
  resolveCatalogItemByName,
  resolveRequestorByName
};
