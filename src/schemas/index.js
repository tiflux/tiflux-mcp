/**
 * Index dos schemas - exporta todos os schemas organizados
 */

const ticketSchemas = require('./tickets');
const clientSchemas = require('./clients');
const userSchemas = require('./users');
const stageSchemas = require('./stages');
const internalCommunicationsSchemas = require('./internal_communications');

// Combinar todos os schemas em um array
const allSchemas = [
  ...Object.values(ticketSchemas),
  ...Object.values(clientSchemas),
  ...Object.values(userSchemas),
  ...Object.values(stageSchemas),
  ...Object.values(internalCommunicationsSchemas)
];

module.exports = {
  // Schemas organizados por área
  tickets: ticketSchemas,
  clients: clientSchemas,
  users: userSchemas,
  stages: stageSchemas,
  internalCommunications: internalCommunicationsSchemas,

  // Array com todos os schemas para o servidor MCP
  all: allSchemas
};