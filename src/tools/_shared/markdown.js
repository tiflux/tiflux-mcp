/**
 * Formatter helpers compartilhados entre slices de tools MCP.
 *
 * Expandir conforme duplicacao real aparece ao migrar entidades.
 */

/**
 * Converte bytes em string legivel (ex: 1024 -> "1 KB", 1536000 -> "1.46 MB").
 * Portado do helper original em src/handlers/tickets.js (formatFileSize).
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = { formatFileSize };
