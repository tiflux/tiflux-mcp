/**
 * Response helpers compartilhados entre slices de tools MCP.
 *
 * Pattern de resposta MCP: { content: [{ type: 'text', text }] }.
 * Todos os slices retornam nesse shape — este helper centraliza.
 */

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

/**
 * Identificador para a 1a linha de sucesso de um create_*: ` #<id>`; quando a
 * API nao devolve ID, ` "<nome>"`; sem nenhum dos dois, ''.
 *
 * A 1a linha e o que consumidores resumem (ex.: o orquestrador do Prisma mostra
 * so ela no resultado de acoes confirmadas) — sem identificador, 5 criacoes em
 * lote viram 5 linhas iguais.
 */
function createdRef(id, name) {
  if (id !== undefined && id !== null && id !== '') return ` #${id}`;
  // O nome vem do input (args.name/title): achatado numa linha so e sem marcacao
  // Markdown/aspas, para nao quebrar nem "decorar" a manchete que o consumidor destaca.
  const safe = name ? String(name).replace(/[*`"]/g, '').replace(/\s+/g, ' ').trim() : '';
  return safe ? ` "${safe}"` : '';
}

module.exports = { textResponse, createdRef };
