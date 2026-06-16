/**
 * entityResolver.js — Nucleo compartilhado de resolucao "nome -> id".
 *
 * Tanto deskResolver quanto userResolver tinham o mesmo esqueleto de branching
 * (erro de API / 0 resultados / N resultados / 1 match). Esse esqueleto vive aqui
 * uma unica vez; cada resolver injeta apenas as mensagens e o extrator de id da
 * sua entidade. Evita duplicacao real entre os resolvers.
 *
 * @param {object} response - resposta de smartSearch* ({ data, error, _truncated })
 * @param {object} cfg
 * @param {function(string):string} cfg.searchError - mensagem para erro de API (recebe response.error)
 * @param {function(object):string} cfg.notFound - mensagem para 0 resultados (recebe a response)
 * @param {function(Array):string} cfg.multiple - mensagem para N resultados (recebe os items)
 * @param {function(object):number} cfg.idOf - extrai o id do item resolvido
 * @param {string} cfg.idKey - nome da chave de id no retorno de sucesso (ex.: 'deskId')
 * @param {string} cfg.itemKey - nome da chave do item no retorno de sucesso (ex.: 'desk')
 * @returns {{error: boolean, response?: object, [idKey]: number, [itemKey]: object}}
 */

const { errorResponse } = require('./errors');

function resolveEntityByName(response, cfg) {
  if (response.error) {
    return { error: true, response: errorResponse(cfg.searchError(response.error)) };
  }

  const items = response.data || [];

  if (items.length === 0) {
    return { error: true, response: errorResponse(cfg.notFound(response)) };
  }

  if (items.length > 1) {
    return { error: true, response: errorResponse(cfg.multiple(items)) };
  }

  return { error: false, [cfg.idKey]: cfg.idOf(items[0]), [cfg.itemKey]: items[0] };
}

module.exports = { resolveEntityByName };
