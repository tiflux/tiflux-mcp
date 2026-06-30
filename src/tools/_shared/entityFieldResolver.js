/**
 * entityFieldResolver.js — Resolucao por nome de campos personalizados (entities)
 * para caminhos de ESCRITA (update_ticket_entities / update_client_entities).
 *
 * Co-localiza a logica antes duplicada entre os dois slices: validacao por item,
 * resolucao fuzzy de entity/field/option por nome, e montagem do payload da API.
 *
 * Disciplina de caminho de escrita (gravamos no campo resolvido — nao pode chutar):
 *   - Piso de confianca MIN_MATCH_SCORE: substring solta (score < 80) nao resolve;
 *     retorna erro com candidatos em vez de gravar no campo errado silenciosamente.
 *   - Deteccao de empate: dois itens com o mesmo score no topo => ambiguidade => erro
 *     listando candidatos (espelha o comportamento de searchStages no updateTicket).
 *   - Paginacao: lista ate RESOLVE_LIMIT itens (teto da API) para nao perder o alvo
 *     na pagina 2+ (o default da API e 20).
 */

const { fuzzyMatchItems } = require('./fuzzyMatch');

// Piso de confianca para resolver por nome em caminho de escrita.
// Score 80 = token exatamente igual; 90 = nome comeca com o termo; 100 = exato.
// Abaixo disso (substring solta) consideramos baixa confianca e nao gravamos.
const MIN_MATCH_SCORE = 80;
// Teto de itens buscados na resolucao (maximo aceito pela API v2).
const RESOLVE_LIMIT = 200;

/**
 * Resolve um termo contra uma lista, exigindo confianca minima e ausencia de empate.
 *
 * @param {string} term - termo a buscar
 * @param {Array} items - lista de candidatos
 * @param {Function} nameExtractor - (item) => string
 * @returns {{ item: object } | { reason: 'notfound'|'lowscore'|'ambiguous', candidates?: string[] }}
 */
function resolveOne(term, items, nameExtractor) {
  const { matches } = fuzzyMatchItems(term, items, nameExtractor);
  if (matches.length === 0) return { reason: 'notfound' };

  const topScore = matches[0].score;
  if (topScore < MIN_MATCH_SCORE) {
    return { reason: 'lowscore', candidates: matches.slice(0, 5).map(m => nameExtractor(m.item)) };
  }

  const tied = matches.filter(m => m.score === topScore);
  if (tied.length > 1) {
    return { reason: 'ambiguous', candidates: tied.map(m => nameExtractor(m.item)) };
  }

  return { item: matches[0].item };
}

/**
 * Monta uma mensagem de erro de resolucao por nome (markdown), uniforme p/ os 3 niveis.
 */
function resolutionError(kind, term, fieldNum, resolution) {
  if (resolution.reason === 'notfound') {
    return (
      `**❌ ${kind} "${term}" não encontrado (campo ${fieldNum})**\n\n` +
      `*Verifique o nome ou use o ID diretamente.*`
    );
  }
  const list = (resolution.candidates || []).map(c => `\`${c}\``).join(', ');
  if (resolution.reason === 'lowscore') {
    return (
      `**❌ ${kind} "${term}" sem correspondência confiável (campo ${fieldNum})**\n\n` +
      `Nenhum candidato teve confiança suficiente. Mais próximos: ${list}.\n\n` +
      `*Seja mais específico ou use o ID diretamente.*`
    );
  }
  // ambiguous
  return (
    `**❌ ${kind} "${term}" é ambíguo (campo ${fieldNum})**\n\n` +
    `Mais de um candidato corresponde igualmente: ${list}.\n\n` +
    `*Use o ID diretamente para desambiguar.*`
  );
}

/**
 * Resolve uma lista de entities (campos personalizados) para o payload da API.
 *
 * Para cada item: valida value, resolve entity_field_id (por entity_name+entity_field_name
 * quando o id nao foi dado) e entity_field_option_id (por entity_field_option_name quando ha
 * um field id conhecido — direto ou resolvido).
 *
 * @param {Array} entities - itens do args
 * @param {object} api - cliente TiFlux
 * @param {object} [opts] - { appliedIn } — quando informado, escopa a listagem de entities
 *   por tipo (`applied_in`, ex: 'solicitant') para nao confundir entidades de outros tipos.
 * @returns {Promise<{ resolvedEntities: Array } | { error: string }>}
 */
async function resolveEntities(entities, api, opts = {}) {
  const resolvedEntities = [];
  const fieldsCache = new Map();   // entityId -> fields list
  let entitiesListCache = null;    // lista de entities (evita N+1 entre itens)

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const fieldNum = i + 1;

    if (entity.value === undefined) {
      return {
        error:
          `**❌ Erro de validação no campo ${fieldNum}**\n\n` +
          `O campo \`value\` é obrigatório (use null para limpar).\n\n` +
          `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" } ou { "entity_field_id": 72, "value": null }*`
      };
    }

    let resolvedFieldId = entity.entity_field_id;
    let resolvedOptionId = entity.entity_field_option_id;

    // entity_field_name sem entity_name levaria a listEntityFields(null) — URL invalida.
    if (!resolvedFieldId && entity.entity_field_name && !entity.entity_name) {
      return {
        error:
          `**❌ Erro de validação no campo ${fieldNum}**\n\n` +
          `\`entity_field_name\` requer \`entity_name\` (sem \`entity_field_id\`).\n\n` +
          `*Forneça entity_name junto com entity_field_name, ou use entity_field_id diretamente.*`
      };
    }

    // Resolver entity_field_id por nome.
    if (!resolvedFieldId && entity.entity_field_name) {
      let entityId = null;

      if (entity.entity_name) {
        if (entitiesListCache === null) {
          const listFilters = { limit: RESOLVE_LIMIT };
          if (opts.appliedIn) listFilters.applied_in = opts.appliedIn;
          const entitiesResp = await api.listEntities(listFilters);
          if (entitiesResp.error) {
            return {
              error:
                `**❌ Erro ao buscar entities para resolução por nome (campo ${fieldNum})**\n\n` +
                `**Mensagem:** ${entitiesResp.error}\n\n` +
                `*Use entity_field_id diretamente para evitar esta chamada.*`
            };
          }
          entitiesListCache = entitiesResp.data || [];
        }
        const r = resolveOne(entity.entity_name, entitiesListCache, e => e.name);
        if (r.reason) return { error: resolutionError('Entidade', entity.entity_name, fieldNum, r) };
        entityId = r.item.id;
      }

      const cacheKey = entityId !== null ? String(entityId) : '_all';
      if (!fieldsCache.has(cacheKey)) {
        const fieldsResp = await api.listEntityFields(entityId, { limit: RESOLVE_LIMIT });
        if (fieldsResp.error) {
          return {
            error:
              `**❌ Erro ao buscar campos da entidade (campo ${fieldNum})**\n\n` +
              `**Mensagem:** ${fieldsResp.error}\n\n` +
              `*Use entity_field_id diretamente para evitar esta chamada.*`
          };
        }
        fieldsCache.set(cacheKey, fieldsResp.data || []);
      }

      const r = resolveOne(entity.entity_field_name, fieldsCache.get(cacheKey), f => f.name);
      if (r.reason) return { error: resolutionError('Campo', entity.entity_field_name, fieldNum, r) };
      resolvedFieldId = r.item.id;
    }

    if (!resolvedFieldId) {
      return {
        error:
          `**❌ Erro de validação no campo ${fieldNum}**\n\n` +
          `O campo \`entity_field_id\` é obrigatório (ou use entity_name + entity_field_name para resolução automática).\n\n` +
          `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" }*`
      };
    }

    // Resolver entity_field_option_id por nome — funciona com qualquer field id conhecido
    // (direto ou resolvido), nao apenas no caminho de resolucao por nome.
    if (resolvedOptionId === undefined && entity.entity_field_option_name) {
      const optionsResp = await api.listEntityFieldOptions(resolvedFieldId, { limit: RESOLVE_LIMIT });
      if (optionsResp.error) {
        return {
          error:
            `**❌ Erro ao buscar opções do campo ${resolvedFieldId} (campo ${fieldNum})**\n\n` +
            `**Mensagem:** ${optionsResp.error}\n\n` +
            `*Use entity_field_option_id diretamente.*`
        };
      }
      const options = optionsResp.data || [];
      // A API v2 retorna o rotulo da opcao em `value` (ex: { id, value: "Sim" }).
      // `title` mantido como fallback defensivo, mas o caminho real e `value`.
      const r = resolveOne(entity.entity_field_option_name, options, o => o.value || o.title || '');
      if (r.reason) {
        return { error: resolutionError('Opção', entity.entity_field_option_name, fieldNum, r) };
      }
      resolvedOptionId = r.item.id;
    }

    if (
      entity.entity_field_option_id !== undefined &&
      !entity.entity_field_option_name &&
      typeof entity.entity_field_option_id !== 'number'
    ) {
      return {
        error:
          `**❌ Erro de validação no campo ${fieldNum}**\n\n` +
          `O campo \`entity_field_option_id\` deve ser um número (ID da opção).\n\n` +
          `*Use list_entity_field_options para obter os IDs de opção disponíveis.*`
      };
    }

    const resolvedItem = { entity_field_id: resolvedFieldId, value: entity.value };
    if (resolvedOptionId !== undefined) resolvedItem.entity_field_option_id = resolvedOptionId;
    if (entity.country_code !== undefined) resolvedItem.country_code = entity.country_code;
    resolvedEntities.push(resolvedItem);
  }

  return { resolvedEntities };
}

/**
 * Formata o bloco "Campos atualizados" a partir da resposta da API.
 * Compartilhado entre tickets e clients (mesmo shape de resposta).
 *
 * @param {Array} updatedEntities - response.data.entities
 * @param {Array} resolvedEntities - itens enviados (para filtrar so o que mudou)
 * @returns {string}
 */
function formatUpdatedFields(updatedEntities, resolvedEntities) {
  if (!updatedEntities || updatedEntities.length === 0) return '';

  let text = '\n\n**Campos atualizados:**\n';
  updatedEntities.forEach(entity => {
    if (entity.entity_fields && entity.entity_fields.length > 0) {
      entity.entity_fields.forEach(field => {
        const wasUpdated = resolvedEntities.some(e => e.entity_field_id === field.entity_field_id);
        if (wasUpdated) {
          text += `• ${field.name}: ${field.value || '(vazio)'}\n`;
        }
      });
    }
  });
  return text;
}

/**
 * Monta o schema JSON da propriedade `entities` (array de campos personalizados),
 * compartilhado entre update_ticket_entities e update_client_entities. So o hint de
 * onde obter o entity_field_id varia entre as duas tools.
 *
 * @param {string} idSourceHint - ex: 'get_ticket' | 'get_client'
 * @returns {object} schema da propriedade `entities`
 */
function buildEntitiesSchema(idSourceHint) {
  return {
    type: 'array',
    description: 'Lista de campos personalizados a serem atualizados. Prefira entity_field_id (evita round-trip). Para checkbox multiplo: envie um item por opcao com entity_field_id, entity_field_option_id e value: "true" ou "false".',
    items: {
      type: 'object',
      properties: {
        entity_field_id: { type: 'number', description: `ID do campo personalizado (obtido via ${idSourceHint} ou list_entity_fields). Prefira este campo quando disponível.` },
        entity_name: { type: 'string', description: 'Nome da entidade (menu/grupo de campos) para resolução automática do entity_field_id — alternativa quando não se tem o ID.' },
        entity_field_name: { type: 'string', description: 'Nome do campo dentro da entidade para resolução automática do entity_field_id — use junto com entity_name.' },
        entity_field_option_name: { type: 'string', description: 'Nome da opção para resolução automática do entity_field_option_id (campos single_select/checkbox). Alternativa ao entity_field_option_id.' },
        value: {
          type: 'string',
          description: 'Valor do campo. Tipos aceitos: text (string), text_area (string), currency (float como string ex: "150.55"), phone (apenas números ex: "47999999999"), email (string), link (URL começando com http/https/ftp), date (formato YYYY-MM-DD), single_select (ID da opção como string), checkbox (boolean como string "true"/"false"). Use null para limpar campos não obrigatórios.'
        },
        entity_field_option_id: { type: 'number', description: 'ID da opcao selecionada (opcional). Obrigatorio para checkbox multiplo — use list_entity_field_options para obter os IDs. Para marcar multiplas opcoes, envie um item por opcao com o mesmo entity_field_id e entity_field_option_id diferente.' },
        country_code: { type: 'string', description: 'Código do país (opcional, apenas para campos tipo phone de outros países além do Brasil)' }
      },
      required: ['value']
    }
  };
}

module.exports = { resolveEntities, formatUpdatedFields, buildEntitiesSchema, MIN_MATCH_SCORE, RESOLVE_LIMIT };
