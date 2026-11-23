/**
 * Error response helpers para slices de tools MCP.
 *
 * Cada slice tem sua propria mensagem contextual — este helper nao tenta
 * centralizar o texto do erro, so o shape da resposta MCP.
 *
 * `isError: true` e o contrato MCP para "a tool nao conseguiu executar a
 * operacao pedida" (erro da API v2, excecao interna, validacao, resolucao
 * ambigua/ausente). Resultado vazio de uma operacao que funcionou NAO e erro.
 *
 * Usage:
 *   return errorResponse(`**❌ Erro ao buscar ticket #${n}**\n\n` +
 *                        `**Código:** ${response.status}\n...`);
 */

const { isValidationError } = require('./validators');

function errorResponse(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * Marca interna de "esta resposta e uma falha de validacao de input".
 *
 * A validacao volta ao agente como resposta `isError` (nao como excecao), entao os
 * bootstraps nao a veem mais no `catch`. A marca deixa o bootstrap reconhecer o caso
 * e logar o warn `errorType: 'validation'` com a correlacao que so ele tem
 * (requestId; no Server, tambem sessionId e apiKeyHash).
 *
 * Symbol + nao-enumeravel: nao aparece no JSON enviado ao cliente MCP nem em
 * comparacoes de objeto. Guarda so a mensagem do erro, nunca os argumentos
 * (podem conter dado de cliente).
 */
const VALIDATION_FAILURE = Symbol('tiflux.validationFailure');

function markValidationFailure(response, message) {
  Object.defineProperty(response, VALIDATION_FAILURE, { value: message, enumerable: false });
  return response;
}

/**
 * Mensagem da falha de validacao carregada por um resultado de tool, ou `null`
 * quando o resultado nao e uma falha de validacao (sucesso, erro da API, erro interno).
 * @param {object} result - retorno de `registry.execute`
 * @returns {string|null}
 */
function validationFailure(result) {
  return result?.[VALIDATION_FAILURE] ?? null;
}

// Alias mantido por compatibilidade com usos existentes.
const apiErrorResponse = errorResponse;

/**
 * Resposta de erro para excecoes internas (bloco catch).
 * Padroniza o rodape "Erro: <msg> / Verifique sua conexao", recebendo apenas
 * o titulo contextual de cada slice.
 *
 * @param {string} title - titulo em Markdown (ex: "**❌ Erro interno ao remover arquivo do ticket #123**")
 * @param {Error} error - excecao capturada
 */
function internalErrorResponse(title, error) {
  return errorResponse(
    `${title}\n\n` +
    `**Erro:** ${error.message}\n\n` +
    `*Verifique sua conexão e configurações da API.*`
  );
}

/**
 * Resposta de erro do bloco catch de um slice, distinguindo input invalido de
 * falha interna — o agente que le o texto precisa saber se basta corrigir a
 * chamada ou se o problema e de infraestrutura.
 *
 * - `ValidationError` → `**❌ <title>**` + paragrafo `**Problema:**` + paragrafo
 *   `**Como resolver:**` (quando o erro traz `hint`). Sem rodape de "conexao".
 *   Cada parte em paragrafo proprio (`\n\n`): o consumidor extrai a linha
 *   `Como resolver:` por regex.
 * - Qualquer outro erro → exatamente o `internalErrorResponse`, com o titulo
 *   "Erro interno ..." (erro interno de verdade continua parecendo erro interno).
 *
 * @param {string} title - titulo em texto puro, sem Markdown e sem "interno"
 *   (ex: "Erro ao criar ticket"). O helper aplica `**❌ ...**` e, para erro
 *   interno, troca o "Erro" inicial por "Erro interno".
 * @param {Error} error - excecao capturada
 */
function toolErrorResponse(title, error) {
  if (!isValidationError(error)) {
    return internalErrorResponse(`**❌ ${title.replace(/^Erro /, 'Erro interno ')}**`, error);
  }
  const parts = [`**❌ ${title}**`, `**Problema:** ${error.message}`];
  if (error.hint) parts.push(`**Como resolver:** ${error.hint}`);
  return markValidationFailure(errorResponse(parts.join('\n\n')), error.message);
}

/**
 * Embrulha o `execute` de um slice para que a validacao de input feita ANTES do
 * `try` (requireField/parseIntStrict no topo do slice) tambem volte no formato
 * "Problema / Como resolver". Sem isso o `ValidationError` sobe ao bootstrap e o
 * agente recebe erro de protocolo (JSON-RPC), que ele nao consegue ler e corrigir.
 * Qualquer erro que nao seja de validacao e relancado como esta.
 *
 * Observabilidade: a resposta sai marcada (ver `validationFailure`) e quem loga o
 * warn `errorType: 'validation'` e o bootstrap, que tem requestId/apiKeyHash.
 *
 * @param {string} title - titulo em texto puro (ex: "Erro ao fechar ticket"), sem o
 *   identificador: quando a validacao falha ele pode nem ter sido informado
 * @param {Function} execute - `execute(args, ctx)` do slice
 * @returns {Function} execute com a mesma assinatura
 */
function withValidationResponse(title, execute) {
  return async function executeWithValidationResponse(args, ctx) {
    try {
      // `tools/call` sem `arguments` chega como undefined: normaliza para {} e a
      // falta do campo obrigatorio vira "Problema" em vez de TypeError de protocolo.
      return await execute(args ?? {}, ctx);
    } catch (error) {
      if (!isValidationError(error)) throw error;
      return toolErrorResponse(title, error);
    }
  };
}

/**
 * Dicas acionaveis para mensagens conhecidas da API v2 (422 de "mesa exige X").
 * A API responde em ingles e sem dizer qual tool resolve; cada entrada casa uma
 * regex sobre `response.error` e devolve a dica em pt-BR. Cresce conforme as
 * auditorias por modulo encontrarem novas mensagens.
 */
const API_ERROR_HINTS = [
  {
    pattern: /requires a priority/i,
    hint: 'A mesa exige prioridade: chame list_desk_priorities com o desk_id e informe priority_id.'
  },
  {
    pattern: /requires a services catalog item/i,
    hint: 'A mesa exige item de catálogo: chame search_catalog_item com o desk_id e informe services_catalogs_item_id.'
  },
  {
    pattern: /Requestor e-mail can not be blank/i,
    hint: 'A mesa exige solicitante: informe requestor_email (ou requestor_name/requestor_id; use search_requestor).'
  }
];

/**
 * Dicas do `API_ERROR_HINTS` que casam com o erro da API (uma resposta pode
 * acumular mais de uma exigencia da mesa).
 * @param {{error?: string}} response
 * @returns {string} dicas unidas por espaco, ou '' quando nenhuma casa
 */
function apiErrorHint(response) {
  const text = typeof response?.error === 'string' ? response.error : '';
  return API_ERROR_HINTS.filter(({ pattern }) => pattern.test(text)).map(({ hint }) => hint).join(' ');
}

/**
 * Resposta de erro para falha vinda da API v2 (`response.error` presente).
 * Padroniza o corpo "Código / Mensagem"; titulo e cauda contextual variam por slice.
 *
 * As linhas `**Código:**` e `**Mensagem:**` sao CONTRATO com consumidores (o
 * orquestrador do Prisma extrai o JSON depois de `Mensagem:`) — nao mudam.
 * Com `{ hints: true }` e uma mensagem mapeada em `API_ERROR_HINTS`, entra um
 * paragrafo `**Como resolver:**` logo apos a mensagem; sem match (ou sem a
 * opcao), a saida e identica a de sempre.
 *
 * @param {string} title - titulo em Markdown (ex: "**❌ Erro ao buscar cliente #123**")
 * @param {{status: number|string, error: string}} response - resposta da API com erro
 * @param {string} [tail] - dica contextual em Markdown (ex: "*Verifique se o cliente existe.*")
 * @param {{hints?: boolean}} [options]
 */
function apiFailureResponse(title, response, tail = '', { hints = false } = {}) {
  const hint = hints ? apiErrorHint(response) : '';
  return errorResponse(
    `${title}\n\n` +
    `**Código:** ${response.status}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    (hint ? `**Como resolver:** ${hint}\n\n` : '') +
    `${tail}`
  );
}

/**
 * Extrai o `error_code` numerico do erro da API v2 a partir do shape real do
 * transporte.
 *
 * IMPORTANTE: `TiFluxAPI._convertErrorToResponse` NAO expoe o corpo parseado em
 * `response.data` — ele serializa o corpo bruto dentro da **string**
 * `response.error` (ex: `Erro HTTP 403: {"error_code":40301,...}`). Logo,
 * `response.data?.error_code` e sempre `undefined` em producao. Este helper
 * cobre os dois caminhos: `data.error_code` (se o transporte um dia passar a
 * expor o corpo) e o JSON embutido na mensagem de erro.
 *
 * @param {{error?: string, status?: number|string, data?: object}} response
 * @returns {number|undefined} codigo numerico (ex: 40301) ou undefined
 */
function extractApiErrorCode(response) {
  if (!response) return undefined;

  const direct = response.data?.error_code;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (typeof direct === 'string' && /^\d+$/.test(direct.trim())) return Number(direct.trim());

  const text = typeof response.error === 'string' ? response.error : '';
  const match = text.match(/"error_code"\s*:\s*"?(\d+)"?/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Extrai o objeto `detail` do erro da API v2 a partir do shape real do transporte.
 *
 * IMPORTANTE: `TiFluxAPI._convertErrorToResponse` NAO expoe o corpo parseado em
 * `response.data` — ele serializa o corpo bruto dentro da **string** `response.error`.
 * O prefixo varia por status: em **422** e `Erro de validação: {...}`; nos demais
 * status e `Erro HTTP <status>: {...}` (ver `tiflux-api.js`). Logo,
 * `response.data?.detail` e sempre `undefined` em producao. Este helper e agnostico ao
 * prefixo (localiza o primeiro `{`) e cobre os dois caminhos: `data.detail` (se o
 * transporte um dia passar a expor o corpo) e o JSON embutido na mensagem de erro.
 *
 * @param {{error?: string, status?: number|string, data?: object}} response
 * @returns {object|undefined} objeto detail (ex: { attendance_kind: ["can't be blank"] }) ou undefined
 */
function extractApiErrorDetail(response) {
  if (!response) return undefined;

  if (response.data?.detail && typeof response.data.detail === 'object') {
    return response.data.detail;
  }

  const text = typeof response.error === 'string' ? response.error : '';
  if (!text) return undefined;

  // Encontra o primeiro bloco JSON na string de erro
  const braceIdx = text.indexOf('{');
  if (braceIdx === -1) return undefined;

  try {
    const parsed = JSON.parse(text.slice(braceIdx));
    return parsed.detail && typeof parsed.detail === 'object' ? parsed.detail : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Bloco Markdown "Detalhes" com as mensagens por campo do `detail` da API v2
 * (ex.: 422 42202 `{ description: ["can't be blank"] }` → `• **description:** can't be blank`).
 *
 * @param {{error?: string, data?: object}} response
 * @returns {string} '**Detalhes:**\n• **campo:** msg\n' ou '' quando nao ha detail
 */
function formatApiErrorDetail(response) {
  const detail = extractApiErrorDetail(response);
  if (!detail) return '';
  const lines = Object.entries(detail).map(([field, msgs]) => `• **${field}:** ${[msgs].flat().join(', ')}`);
  return lines.length ? `**Detalhes:**\n${lines.join('\n')}\n` : '';
}

module.exports = {
  errorResponse, apiErrorResponse, internalErrorResponse, toolErrorResponse, withValidationResponse, apiFailureResponse,
  validationFailure,
  API_ERROR_HINTS, apiErrorHint,
  extractApiErrorCode, extractApiErrorDetail, formatApiErrorDetail
};
