/**
 * Response helpers compartilhados entre slices de tools MCP.
 *
 * Pattern de resposta MCP: { content: [{ type: 'text', text }] }.
 * Todos os slices retornam nesse shape — este helper centraliza.
 */

function textResponse(text) {
  return { content: [{ type: 'text', text }] };
}

module.exports = { textResponse };
