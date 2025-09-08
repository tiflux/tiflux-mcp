/**
 * Index dos schemas - exporta todos os schemas organizados
 */

const ticketSchemas = require('./tickets');
const clientSchemas = require('./clients');

// Combinar todos os schemas em um array
const allSchemas = [
  ...Object.values(ticketSchemas),
  ...Object.values(clientSchemas)
];

module.exports = {
  // Schemas organizados por área
  tickets: ticketSchemas,
  clients: clientSchemas,
  
  // Array com todos os schemas para o servidor MCP
  all: allSchemas
};