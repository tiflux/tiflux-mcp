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

/**
 * Remove tags HTML de um texto para exibicao em Markdown.
 *
 * Implementacao em passada unica (sem regex): o replace global com
 * /<[^>]*>/g degrada para O(n^2) em input adversarial cheio de '<'
 * sem '>' (Sonar S5852). Um '<' sem fechamento e tratado como texto.
 */
function stripHtml(text) {
  if (!text) return '';
  let out = '';
  let tagStart = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (tagStart === -1) {
      if (ch === '<') tagStart = i;
      else out += ch;
    } else if (ch === '>') {
      tagStart = -1;
    }
  }
  // '<' sem '>' correspondente nao e tag — devolve o trecho como texto
  if (tagStart !== -1) out += text.slice(tagStart);
  return out;
}

module.exports = { formatFileSize, stripHtml };
