/**
 * TiFlux API Client
 *
 * Fachada HTTP para a API v2 publica do TiFlux.
 * Consome a infraestrutura compartilhada HttpClient + RetryPolicy + Logger
 * (mesma base dos domain repositories Clean Arch).
 *
 * Contrato externo preservado: retorna `{ data, status }` em sucesso e
 * `{ error, status }` em falha — handlers MCP nao precisam mudar.
 */

const querystring = require('querystring');

const HttpClient = require('../infrastructure/http/HttpClient');
const { APIError, TimeoutError, NetworkError } = require('../utils/errors');
const ClientFingerprint = require('../telemetry/ClientFingerprint');
const { MAX_BASE64_BYTES_25MB, MAX_BASE64_BYTES_40MB } = require('../tools/_shared/fileValidation');

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Avalia se um usuario do fallback technical-groups esta ativo, de forma
 * tolerante a variacao de shape da API (boolean true, 1, "true", "1" ou campo
 * ausente => ativo). So consideramos inativo quando o campo esta presente e
 * explicitamente "desligado" — evita filtrar todos os usuarios por engano.
 */
function isUserActive(user) {
  const v = user.active;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return true;
}

/**
 * Anexa os filtros de data dos endpoints de listagem de chats ao `params`.
 * Repasse 1:1 para a API v2 (sem transformacao). `created_at_*` vale para os 4
 * endpoints; `finished_at_*` so para `/chats/archived` (`includeFinished`).
 * @param {URLSearchParams} params
 * @param {object} filters
 * @param {{ includeFinished?: boolean }} [opts]
 */
function appendChatDateFilters(params, filters, { includeFinished = false } = {}) {
  if (filters.created_at_start != null) params.append('created_at_start', filters.created_at_start);
  if (filters.created_at_end != null) params.append('created_at_end', filters.created_at_end);
  if (includeFinished) {
    if (filters.finished_at_start != null) params.append('finished_at_start', filters.finished_at_start);
    if (filters.finished_at_end != null) params.append('finished_at_end', filters.finished_at_end);
  }
}

class TiFluxAPI {
  /**
   * @param {string|null} apiKey - API key (ou via TIFLUX_API_KEY env)
   * @param {object} [options]
   * @param {HttpClient} [options.httpClient] - cliente HTTP injetado (DI)
   * @param {object} [options.logger] - logger estruturado (usa stub silencioso por default)
   */
  constructor(apiKey = null, options = {}) {
    this.baseUrl = process.env.TIFLUX_API_BASE_URL || 'https://api.tiflux.com/api/v2';
    this.apiKey = apiKey || process.env.TIFLUX_API_KEY;
    this.logger = options.logger || this._createSilentLogger();
    this.httpClient = options.httpClient || this._createDefaultHttpClient();
  }

  _createSilentLogger() {
    const noop = () => {};
    const timer = () => noop;
    return {
      error: noop, warn: noop, info: noop, debug: noop,
      startTimer: timer
    };
  }

  _createDefaultHttpClient() {
    return new HttpClient({
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 3,
      retryDelay: 1000,
      retryMultiplier: 2,
      logger: this.logger
    });
  }

  /**
   * Constroi retryCondition baseado no metodo HTTP.
   *
   * Regra (Decisao 3c): GETs sao idempotentes → retenta em 429+5xx;
   * writes (POST/PUT/DELETE) so retentam em 429 e erros de rede/timeout,
   * nunca em 5xx — evita criar duplicatas se o server persistiu antes
   * do response falhar.
   */
  _retryConditionForMethod(method) {
    const isRead = method === 'GET';
    return (error, attempt) => {
      if (error instanceof TimeoutError || error instanceof NetworkError) return true;
      if (error && error.statusCode === 429) return true;
      if (isRead && error && error.statusCode >= 500 && attempt < 2) return true;
      return false;
    };
  }

  /**
   * Converte excecoes do HttpClient para o shape `{ error, status }` que
   * os handlers MCP consomem. Preserva semantica do codigo antigo.
   */
  _convertErrorToResponse(error, endpoint, method) {
    if (error instanceof TimeoutError) {
      this.logger.error('TiFlux API request timeout', {
        endpoint, method, timeoutMs: DEFAULT_TIMEOUT_MS, error: error.message
      });
      return { error: `Timeout na requisição (${DEFAULT_TIMEOUT_MS / 1000}s)`, status: 'TIMEOUT' };
    }

    if (error instanceof NetworkError) {
      this.logger.error('TiFlux API network error', {
        endpoint, method, error: error.message, code: error.code
      });
      return { error: `Erro de conexão: ${error.message}`, status: 'CONNECTION_ERROR' };
    }

    if (error instanceof APIError) {
      const status = error.statusCode;
      const rawBody = this._extractErrorBody(error);

      this.logger.error('TiFlux API HTTP error', {
        endpoint, method, statusCode: status, body: rawBody?.slice?.(0, 500)
      });

      if (status === 401) return { error: 'Token de API inválido ou expirado', status };
      if (status === 404) return { error: 'Recurso não encontrado', status };
      if (status === 415) return { error: 'Tipo de mídia não suportado (verifique arquivos anexados)', status };
      if (status === 422) return { error: `Erro de validação: ${rawBody}`, status };
      return { error: `Erro HTTP ${status}: ${rawBody}`, status };
    }

    this.logger.error('TiFlux API unexpected error', {
      endpoint, method, error: error?.message, stack: error?.stack
    });
    return { error: `Erro interno: ${error?.message || 'desconhecido'}`, status: 'INTERNAL_ERROR' };
  }

  _extractErrorBody(apiError) {
    const response = apiError.response || {};
    if (response.rawData != null) return String(response.rawData);
    if (response.data != null) {
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    }
    return '';
  }

  /**
   * Requisicao HTTP base para endpoints JSON da API v2.
   */
  async makeRequest(endpoint, method = 'GET', data = null, headers = {}) {
    if (!this.apiKey) {
      return { error: 'TIFLUX_API_KEY não configurada', status: 'CONFIG_ERROR' };
    }

    const url = `${this.baseUrl}${endpoint}`;
    const requestHeaders = {
      'accept': 'application/json',
      'authorization': `Bearer ${this.apiKey}`,
      ...headers,
      // User-Agent e o ponto canonico de telemetria — definido por ULTIMO de
      // proposito para que nenhum caller sobrescreva o valor do ClientFingerprint.
      'User-Agent': ClientFingerprint.userAgent()
    };

    try {
      const response = await this.httpClient.request({
        method,
        url,
        headers: requestHeaders,
        data,
        timeout: DEFAULT_TIMEOUT_MS,
        retryCondition: this._retryConditionForMethod(method)
      });

      return { data: response.data, status: response.statusCode, headers: response.headers };
    } catch (error) {
      return this._convertErrorToResponse(error, endpoint, method);
    }
  }

  /**
   * Busca um ticket específico pelo ID
   */
  async fetchTicket(ticketId, options = {}) {
    const queryParams = [];

    if (options.show_entities) queryParams.push('show_entities=true');
    if (options.include_filled_entity) queryParams.push('include_filled_entity=true');

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    return await this.makeRequest(`/tickets/${ticketId}${queryString}`);
  }

  /**
   * Busca clientes por nome
   */
  async searchClients(clientName = '') {
    const nameParam = clientName ? `&name=${encodeURIComponent(clientName)}` : '';
    return await this.makeRequest(`/clients?active=true${nameParam}`);
  }

  /**
   * Cria um novo ticket via multipart/form-data.
   * Aceita arquivos em base64 (objeto { content, filename }) via ticketData.files (opcional).
   */
  async createTicket(ticketData) {
    try {
      const processed = this._processAttachments(ticketData.files, MAX_BASE64_BYTES_25MB, '25MB');
      if (processed.error) return processed;

      const { buffer, headers } = this._buildMultipart({
        fields: this._ticketFields(ticketData),
        files: processed.processedFiles
      });

      return await this.makeRequestBinary('/tickets', 'POST', buffer, headers);

    } catch (error) {
      return { error: `Erro interno ao criar ticket: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Campos texto do multipart de criacao de ticket.
   * `parent_ticket_number` e enviado como `ticket_reference_number` na API.
   */
  _ticketFields(ticketData) {
    const FIELD_NAMES = {
      title: 'title',
      description: 'description',
      client_id: 'client_id',
      desk_id: 'desk_id',
      priority_id: 'priority_id',
      services_catalogs_item_id: 'services_catalogs_item_id',
      status_id: 'status_id',
      requestor_id: 'requestor_id',
      requestor_name: 'requestor_name',
      requestor_email: 'requestor_email',
      requestor_telephone: 'requestor_telephone',
      responsible_id: 'responsible_id',
      followers: 'followers',
      parent_ticket_number: 'ticket_reference_number'
    };

    const fields = [];
    for (const [param, name] of Object.entries(FIELD_NAMES)) {
      if (ticketData[param]) fields.push({ name, value: String(ticketData[param]) });
    }
    return fields;
  }

  /**
   * Atualiza um ticket existente
   */
  async updateTicket(ticketId, ticketData) {
    const ticketObject = {};

    if (ticketData.title !== undefined) ticketObject.title = ticketData.title;
    if (ticketData.description !== undefined) ticketObject.description = ticketData.description;
    if (ticketData.client_id !== undefined) ticketObject.client_id = ticketData.client_id;
    if (ticketData.desk_id !== undefined) ticketObject.desk_id = ticketData.desk_id;
    if (ticketData.priority_id !== undefined) ticketObject.priority_id = ticketData.priority_id;
    if (ticketData.priority_change_reason !== undefined) ticketObject.priority_change_reason = ticketData.priority_change_reason;
    if (ticketData.status_id !== undefined) ticketObject.status_id = ticketData.status_id;
    if (ticketData.stage_id !== undefined) ticketObject.stage_id = ticketData.stage_id;
    if (ticketData.services_catalogs_item_id !== undefined) ticketObject.services_catalogs_item_id = ticketData.services_catalogs_item_id;
    if (ticketData.followers !== undefined) ticketObject.followers = ticketData.followers;

    if (ticketData.responsible_id !== undefined) {
      ticketObject.responsible_id = ticketData.responsible_id;
    }

    const jsonData = JSON.stringify(ticketObject);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/tickets/${ticketId}`, 'PUT', jsonData, headers);
  }

  /**
   * Atualiza campos personalizados (entities) de um ticket
   */
  async updateTicketEntities(ticketNumber, entitiesData) {
    const jsonData = JSON.stringify(entitiesData);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/tickets/${ticketNumber}/entities`, 'PUT', jsonData, headers);
  }

  /**
   * Cancela um ticket específico
   */
  async cancelTicket(ticketNumber) {
    return await this.makeRequest(`/tickets/${ticketNumber}/cancel`, 'PUT');
  }

  /**
   * Fecha um ticket específico
   */
  async closeTicket(ticketNumber) {
    return await this.makeRequest(`/tickets/${ticketNumber}/close`, 'PUT');
  }

  /**
   * Cria uma resposta (comunicacao com cliente) em um ticket especifico.
   * Aceita arquivos em base64 (objeto { content, filename }) via answerData.files (opcional).
   */
  async createTicketAnswer(ticketNumber, answerData) {
    try {
      if (!answerData.name) {
        return { error: 'Campo "name" é obrigatório', status: 'VALIDATION_ERROR' };
      }

      const processed = this._processAttachments(answerData.files, MAX_BASE64_BYTES_40MB, '40MB');
      if (processed.error) return processed;

      const { buffer, headers } = this._buildMultipart({
        fields: this._ticketAnswerFields(answerData),
        files: processed.processedFiles
      });

      return await this.makeRequestBinary(
        `/tickets/${ticketNumber}/answers`,
        'POST',
        buffer,
        headers
      );

    } catch (error) {
      return { error: `Erro interno: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  _ticketAnswerFields(answerData) {
    const fields = [{ name: 'name', value: answerData.name }];
    if (answerData.with_signature !== undefined) {
      fields.push({ name: 'with_signature', value: answerData.with_signature ? 'true' : 'false' });
    }
    return fields;
  }

  /**
   * Busca mesas por nome
   */
  async searchDesks(deskName = '') {
    const nameParam = deskName ? `&name=${encodeURIComponent(deskName)}` : '';
    return await this.makeRequest(`/desks?active=true${nameParam}`);
  }

  /**
   * Busca mesas por nome com fallback fuzzy.
   *
   * 1. Tenta busca direta: GET /desks?active=true&name={deskName}
   * 2. Se retornar erro ou pelo menos 1 resultado → devolve como esta.
   * 3. Senao, pagina todas as mesas ativas via listAllActiveDesks() e aplica
   *    fuzzyMatchItems contra `name` + `display_name` de cada mesa.
   * 4. Se fuzzy encontrou matches → retorna apenas o grupo de maior score
   *    (top-score winners) como { data: items, status: 200 }.
   *    Senao → devolve o resultado vazio original da busca direta.
   */
  async smartSearchDesks(deskName) {
    const { fuzzyMatchItems } = require('../tools/_shared/fuzzyMatch');

    const directResult = await this.searchDesks(deskName);

    // Propaga erro ou retorna direto se ha resultados
    if (directResult.error) return directResult;
    if (directResult.data && directResult.data.length > 0) return directResult;

    // Fallback: buscar TODAS as mesas ativas (paginado) e aplicar fuzzy matching
    const allDesksResult = await this.listAllActiveDesks();

    if (allDesksResult.error) return directResult; // se falhou, devolve o vazio original
    if (!allDesksResult.data || allDesksResult.data.length === 0) return directResult;

    const { matches } = fuzzyMatchItems(
      deskName,
      allDesksResult.data,
      (desk) => `${desk.name || ''} ${desk.display_name || ''}`.trim()
    );

    if (matches.length === 0) return directResult;

    // Devolver apenas o grupo de maior score (evita matches fracos / falsa disambiguacao)
    const topScore = matches[0].score;
    const winners = matches.filter(m => m.score === topScore);
    return { data: winners.map(m => m.item), status: 200 };
  }

  /**
   * Busca TODAS as mesas ativas, paginando automaticamente ate a ultima pagina.
   *
   * Usa limit=200 (maximo da API) para minimizar o numero de chamadas.
   * Acumula os resultados de cada pagina e retorna o conjunto completo.
   * Propaga qualquer erro de API encontrado durante a paginacao.
   *
   * @returns {{ data: Array, status: 200 } | { error: string, status: number }}
   */
  async listAllActiveDesks() {
    const PAGE_SIZE = 200;
    const MAX_PAGES = 50; // guarda contra loop infinito se a API repetir paginas cheias (10k mesas)
    const accumulated = [];
    let page = 1; // offset = numero de pagina (1-based), conforme API /desks

    while (page <= MAX_PAGES) {
      const result = await this.listDesks({ active: true, limit: PAGE_SIZE, offset: page });
      if (result.error) return result; // propagate error from any page
      const items = result.data || [];
      accumulated.push(...items);
      if (items.length < PAGE_SIZE) break; // last page (partial or empty)
      page += 1;
    }

    if (page > MAX_PAGES) {
      this.logger.warn('TiFlux API listAllActiveDesks atingiu MAX_PAGES', {
        maxPages: MAX_PAGES, pageSize: PAGE_SIZE, accumulated: accumulated.length
      });
    }

    return { data: accumulated, status: 200 };
  }

  /**
   * Lista mesas disponiveis com filtros opcionais.
   *
   * @param {object} filters - { active (boolean, default true), name (string), limit (int, default 20, max 200), offset (int, default 1) }
   */
  async listDesks(filters = {}) {
    const params = new URLSearchParams();

    const active = filters.active !== undefined ? filters.active : true;
    const limit = Math.min(filters.limit || 20, 200);
    const offset = filters.offset || 1;

    params.append('active', active);
    params.append('limit', limit);
    params.append('offset', offset);

    if (filters.name) {
      params.append('name', filters.name);
    }

    return await this.makeRequest(`/desks?${params.toString()}`);
  }

  /**
   * Lista departamentos da organizacao com filtro opcional por nome.
   *
   * Admin: todos os departamentos ativos.
   * Tecnico (nao-admin): apenas os vinculados ao seu grupo de atendentes.
   *
   * @param {object} filters
   * @param {string} [filters.name] - Busca parcial por nome (case-insensitive)
   * @param {number} [filters.limit] - Itens por pagina (1-200, padrao 20)
   * @param {number} [filters.offset] - Pagina a retornar (>=1, padrao 1)
   */
  async listDepartments(filters = {}) {
    const params = new URLSearchParams();

    const limit = Math.min(filters.limit || 20, 200);
    const offset = filters.offset || 1;

    params.append('limit', limit);
    params.append('offset', offset);

    if (filters.name) {
      params.append('name', filters.name);
    }

    return await this.makeRequest(`/departments?${params.toString()}`);
  }

  /**
   * Lista contratos da organizacao.
   * GET /contracts
   *
   * Filtros opcionais (todos CSV quando arrays, style form/explode:false):
   *   - client_ids, contract_type_ids, status (actives|readjust|expired)
   *   - limit (default 20, max 200), offset (default 1)
   *
   * @param {object} filters
   */
  async listContracts(filters = {}) {
    const params = new URLSearchParams();

    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    const offset = Math.max(1, parseInt(filters.offset) || 1);

    params.append('limit', limit);
    params.append('offset', offset);

    if (filters.client_ids) params.append('client_ids', filters.client_ids);
    if (filters.contract_type_ids) params.append('contract_type_ids', filters.contract_type_ids);
    if (filters.status) params.append('status', filters.status);

    return await this.makeRequest(`/contracts?${params.toString()}`);
  }

  /**
   * Retorna dados completos de uma mesa por ID.
   *
   * @param {number} deskId - ID da mesa
   */
  async getDesk(deskId) {
    return await this.makeRequest(`/desks/${deskId}`);
  }

  /**
   * Lista prioridades de uma mesa especifica com paginacao.
   *
   * @param {number} deskId - ID da mesa
   * @param {object} filters - { offset (int, default 1), limit (int, default 20, max 200) }
   */
  async listDeskPriorities(deskId, filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200);
    params.append('offset', offset);
    params.append('limit', limit);

    return await this.makeRequest(`/desks/${deskId}/priorities?${params.toString()}`);
  }

  /**
   * Lista catalogos de servicos de uma mesa especifica com paginacao.
   *
   * @param {number} deskId - ID da mesa
   * @param {object} filters - { offset (int, default 1), limit (int, default 20, max 200) }
   */
  async listDeskServicesCatalogs(deskId, filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200);
    params.append('offset', offset);
    params.append('limit', limit);

    return await this.makeRequest(`/desks/${deskId}/services-catalogs?${params.toString()}`);
  }

  /**
   * Busca estagios de uma mesa especifica com paginacao
   */
  async searchStages(deskId, filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200);
    params.append('offset', offset);
    params.append('limit', limit);

    return await this.makeRequest(`/desks/${deskId}/stages?${params.toString()}`);
  }

  /**
   * Lista tickets com filtros aplicados
   */
  async listTickets(filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200);
    params.append('offset', offset);
    params.append('limit', limit);

    // filter_by (open/closed/all) tem precedencia sobre is_closed nas versoes da
    // API que o suportam. Enviamos SEMPRE os dois: a API que conhece filter_by
    // ignora is_closed; a que ainda nao conhece (ex: producao atual) continua
    // filtrando corretamente via is_closed. Sem isso, filter_by sozinho cairia
    // no default is_closed=false e zeraria buscas por solved_in_time.
    if (filters.filter_by) {
      params.append('filter_by', filters.filter_by);
    }
    let isClosed;
    if (filters.is_closed !== undefined) {
      isClosed = filters.is_closed;
    } else if (filters.filter_by === 'closed' || filters.filter_by === 'canceled') {
      // cancelados sao tickets fechados (is_closed=true); derivamos para compat
      // com APIs sem suporte a filter_by.
      isClosed = true;
    } else {
      // 'open', 'all' ou ausente: 'all' nao tem equivalente em is_closed e
      // degrada para abertos em APIs sem suporte a filter_by.
      isClosed = false;
    }
    params.append('is_closed', isClosed);

    const appendCsvIds = (key, value) => {
      if (!value) return;
      const ids = value.split(',').slice(0, 15).map(id => id.trim()).filter(id => id);
      if (ids.length > 0) params.append(key, ids.join(','));
    };

    appendCsvIds('desk_ids', filters.desk_ids);
    appendCsvIds('client_ids', filters.client_ids);
    appendCsvIds('stage_ids', filters.stage_ids);
    appendCsvIds('responsible_ids', filters.responsible_ids);
    appendCsvIds('requestor_ids', filters.requestor_ids);

    if (filters.requestor_email) params.append('requestor_email', filters.requestor_email);
    if (filters.date_type) params.append('date_type', filters.date_type);
    if (filters.group_by) params.append('group_by', filters.group_by);
    if (filters.sla_expiring_before) params.append('sla_expiring_before', filters.sla_expiring_before);
    if (filters.start_datetime) params.append('start_datetime', filters.start_datetime);
    if (filters.end_datetime) params.append('end_datetime', filters.end_datetime);

    const response = await this.makeRequest(`/tickets?${params.toString()}`);

    // Surface o total real (header X-Total-Items) para a listagem distinguir
    // "quantidade nesta pagina" de "total que satisfaz o filtro".
    if (response && !response.error && response.headers) {
      const totalHeader = response.headers['x-total-items'] ?? response.headers['X-Total-Items'];
      const total = parseInt(totalHeader, 10);
      if (!Number.isNaN(total)) response.total = total;
    }

    return response;
  }

  /**
   * Cria uma comunicacao interna em um ticket usando multipart/form-data
   */
  async createInternalCommunication(ticketNumber, text, files = []) {
    try {
      if (!files || files.length === 0) {
        return await this.createInternalCommunicationTextOnly(ticketNumber, text);
      }

      return await this.createInternalCommunicationWithFiles(ticketNumber, text, files);

    } catch (error) {
      return {
        error: `Erro ao preparar comunicação interna: ${error.message}`,
        status: 'PREPARE_ERROR'
      };
    }
  }

  /**
   * Versao simplificada para texto apenas
   */
  async createInternalCommunicationTextOnly(ticketNumber, text) {
    const { buffer, headers } = this._buildMultipart({
      fields: [{ name: 'text', value: text }],
      files: []
    });

    return await this.makeRequestBinary(
      `/tickets/${ticketNumber}/internal_communications`,
      'POST',
      buffer,
      headers
    );
  }

  /**
   * Versao completa com arquivos.
   * Aceita arquivos em base64 (objeto { content, filename }).
   */
  async createInternalCommunicationWithFiles(ticketNumber, text, files) {
    const processed = this._processAttachments(files, MAX_BASE64_BYTES_25MB, '25MB');
    if (processed.error) return processed;

    const { buffer, headers } = this._buildMultipart({
      fields: [{ name: 'text', value: text }],
      files: processed.processedFiles
    });

    return await this.makeRequestBinary(
      `/tickets/${ticketNumber}/internal_communications`,
      'POST',
      buffer,
      headers
    );
  }

  /**
   * Processa um anexo base64 (objeto { content, filename }) validando tamanho.
   * Retorna `{ content, filename }` em sucesso ou `{ error, status }` em falha.
   */
  _processAttachment(file, index, maxSize, maxSizeLabel) {
    if (typeof file === 'object' && file && file.content && file.filename) {
      try {
        const content = Buffer.from(file.content, 'base64');
        const filename = file.filename;

        if (content.length > maxSize) {
          return {
            error: `Arquivo base64 muito grande (máx ${maxSizeLabel}): ${filename} (${Math.round(content.length / 1024 / 1024)}MB)`,
            status: 'FILE_TOO_LARGE'
          };
        }

        this.logger.info('TiFlux API file attachment (base64)', {
          filename, sizeBytes: content.length, source: 'base64'
        });

        return { content, filename };
      } catch (decodeError) {
        return {
          error: `Erro ao decodificar base64 do arquivo "${file.filename}": ${decodeError.message}`,
          status: 'BASE64_DECODE_ERROR'
        };
      }
    }

    return {
      error: `Formato de arquivo inválido no índice ${index}. Use { content: "base64...", filename: "nome.ext" }`,
      status: 'INVALID_FILE_FORMAT'
    };
  }

  /**
   * Processa um array de anexos base64 (no maximo 10), validando cada um.
   * Centraliza o loop reutilizado por createTicket, createTicketAnswer,
   * createInternalCommunicationWithFiles e uploadTicketFiles.
   * Retorna `{ processedFiles }` em sucesso ou `{ error, status }` na primeira falha.
   */
  _processAttachments(files, maxSize, maxSizeLabel) {
    const list = Array.isArray(files) ? files : [];
    const processedFiles = [];
    for (let i = 0; i < Math.min(list.length, 10); i++) {
      const result = this._processAttachment(list[i], i, maxSize, maxSizeLabel);
      if (result.error) return result;
      processedFiles.push(result);
    }
    return { processedFiles };
  }

  /**
   * Deriva o Content-Type de uma parte por extensao de filename.
   * Tipos texto recebem `; charset=utf-8` para evitar mojibake no portal.
   * Fallback: application/octet-stream.
   */
  _mimeTypeForFilename(filename) {
    const MIME_MAP = {
      '.md':   'text/markdown; charset=utf-8',
      '.txt':  'text/plain; charset=utf-8',
      '.csv':  'text/csv; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.htm':  'text/html; charset=utf-8',
      '.xml':  'application/xml; charset=utf-8',
      '.pdf':  'application/pdf',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.webp': 'image/webp',
      '.svg':  'image/svg+xml',
      '.zip':  'application/zip',
      '.xls':  'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.doc':  'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const dot = filename.lastIndexOf('.');
    const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
  }

  /**
   * Constroi body multipart/form-data com campos texto e arquivos.
   * Retorna `{ buffer, headers }` pronto para makeRequestBinary.
   */
  _buildMultipart({ fields = [], files = [] }) {
    const boundary = `----formdata-tiflux-${Date.now()}`;
    const parts = [];

    for (const { name, value } of fields) {
      let fieldPart = '';
      fieldPart += `--${boundary}\r\n`;
      fieldPart += `Content-Disposition: form-data; name="${name}"\r\n`;
      fieldPart += '\r\n';
      fieldPart += value + '\r\n';
      parts.push(Buffer.from(fieldPart));
    }

    for (const file of files) {
      const contentType = this._mimeTypeForFilename(file.filename);
      // Defesa em profundidade: remove CR/LF/aspas que poderiam injetar headers
      // de parte no multipart (a validacao de slice ja rejeita, mas o builder e
      // o ponto de injecao real e pode ser chamado por outros caminhos).
      const safeFilename = String(file.filename).replace(/[\r\n"]/g, '');
      let header = '';
      header += `--${boundary}\r\n`;
      header += `Content-Disposition: form-data; name="files[]"; filename="${safeFilename}"\r\n`;
      header += `Content-Type: ${contentType}\r\n`;
      header += '\r\n';
      parts.push(Buffer.from(header));
      parts.push(file.content);
      parts.push(Buffer.from('\r\n'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const buffer = Buffer.concat(parts);

    return {
      buffer,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': buffer.length
      }
    };
  }

  /**
   * Lista comunicacoes internas de um ticket com paginacao
   */
  async listInternalCommunications(ticketNumber, offset = 1, limit = 20) {
    const validOffset = Math.max(1, parseInt(offset) || 1);
    const validLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));

    const params = new URLSearchParams();
    params.append('offset', validOffset);
    params.append('limit', validLimit);

    return await this.makeRequest(`/tickets/${ticketNumber}/internal_communications?${params.toString()}`);
  }

  /**
   * Busca uma comunicacao interna especifica de um ticket
   */
  async getInternalCommunication(ticketNumber, communicationId) {
    return await this.makeRequest(`/tickets/${ticketNumber}/internal_communications/${communicationId}`);
  }

  /**
   * Versao do makeRequest para bodies binarios (multipart/form-data).
   * Delega ao HttpClient, preservando headers do caller (incluindo boundary).
   */
  async makeRequestBinary(endpoint, method = 'GET', data = null, headers = {}) {
    if (!this.apiKey) {
      return { error: 'TIFLUX_API_KEY não configurada', status: 'CONFIG_ERROR' };
    }

    const url = `${this.baseUrl}${endpoint}`;
    const requestHeaders = {
      'accept': 'application/json',
      'authorization': `Bearer ${this.apiKey}`,
      ...headers,
      // User-Agent e o ponto canonico de telemetria — definido por ULTIMO de
      // proposito para que nenhum caller sobrescreva o valor do ClientFingerprint.
      'User-Agent': ClientFingerprint.userAgent()
    };

    try {
      const response = await this.httpClient.request({
        method,
        url,
        headers: requestHeaders,
        data,
        timeout: DEFAULT_TIMEOUT_MS,
        retryCondition: this._retryConditionForMethod(method)
      });

      return { data: response.data, status: response.statusCode, headers: response.headers };
    } catch (error) {
      return this._convertErrorToResponse(error, endpoint, method);
    }
  }

  /**
   * Cria um apontamento em um ticket especifico
   * POST /tickets/{ticket_number}/appointments
   */
  async createAppointment(ticketNumber, appointmentData) {
    const jsonData = JSON.stringify({
      date: appointmentData.date,
      init_time: appointmentData.init_time,
      end_time: appointmentData.end_time,
      description: appointmentData.description
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/tickets/${ticketNumber}/appointments`, 'POST', jsonData, headers);
  }

  /**
   * Lista apontamentos de um ticket com paginacao e filtros
   * GET /tickets/{ticket_number}/appointments
   */
  async listAppointments(ticketNumber, filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);

    return await this.makeRequest(`/tickets/${ticketNumber}/appointments?${params.toString()}`);
  }

  /**
   * Busca o historico de estagios e SLAs de um ticket
   * GET /tickets/{ticket_number}/stages-slas
   */
  async fetchTicketStagesSlas(ticketNumber, filters = {}) {
    if (!ticketNumber) {
      return { error: 'ticket_number é obrigatório', status: 'VALIDATION_ERROR' };
    }

    const params = new URLSearchParams();
    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    return await this.makeRequest(`/tickets/${ticketNumber}/stages-slas?${params.toString()}`);
  }

  /**
   * Faz upload de arquivos para um ticket existente via multipart.
   * POST /tickets/{ticket_number}/files
   *
   * @param {string|number} ticketNumber - numero do ticket
   * @param {Array<{content: string, filename: string}>} files - array de objetos base64
   */
  async uploadTicketFiles(ticketNumber, files) {
    try {
      const processed = this._processAttachments(files, MAX_BASE64_BYTES_25MB, '25MB');
      if (processed.error) return processed;

      const { buffer, headers } = this._buildMultipart({
        fields: [],
        files: processed.processedFiles
      });

      return await this.makeRequestBinary(`/tickets/${encodeURIComponent(ticketNumber)}/files`, 'POST', buffer, headers);
    } catch (error) {
      return { error: `Erro interno ao fazer upload de arquivos: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Remove um arquivo anexado de um ticket.
   * DELETE /tickets/{ticket_number}/files/{id}
   *
   * @param {string|number} ticketNumber - numero do ticket
   * @param {string|number} fileId - ID do arquivo a remover
   */
  async deleteTicketFile(ticketNumber, fileId) {
    try {
      const response = await this.makeRequest(`/tickets/${encodeURIComponent(ticketNumber)}/files/${encodeURIComponent(fileId)}`, 'DELETE');

      // 204 No Content — sucesso sem corpo
      if (response.status === 204 || (!response.error && response.data == null)) {
        return { data: null, status: 204 };
      }

      return response;
    } catch (error) {
      return { error: `Erro interno ao deletar arquivo: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Busca os arquivos anexados a um ticket especifico
   * GET /tickets/{ticket_number}/files
   */
  async fetchTicketFiles(ticketNumber) {
    if (!ticketNumber) {
      return { error: 'ticket_number é obrigatório', status: 'VALIDATION_ERROR' };
    }

    return await this.makeRequest(`/tickets/${ticketNumber}/files`);
  }

  /**
   * Busca usuarios por nome com filtros opcionais
   * GET /users
   *
   * Nota: A API TiFlux nao suporta busca por nome no endpoint /users.
   * Implementamos filtro client-side por nome/email apos buscar da API.
   */
  async searchUsers(filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = 200;
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.active !== undefined) params.append('active', filters.active);
    if (filters.type) params.append('type', filters.type);
    if (filters.gauth_enabled !== undefined) params.append('gauth_enabled', filters.gauth_enabled);

    const response = await this.makeRequest(`/users?${params.toString()}`);

    if (response.data && filters.name) {
      const searchTerm = filters.name.toLowerCase().trim();
      response.data = response.data.filter(user => {
        const nameMatch = user.name && user.name.toLowerCase().includes(searchTerm);
        const emailMatch = user.email && user.email.toLowerCase().includes(searchTerm);
        return nameMatch || emailMatch;
      });

      if (filters.limit && filters.limit < response.data.length) {
        response.data = response.data.slice(0, filters.limit);
      }
    }

    return response;
  }

  /**
   * Busca solicitantes com filtros server-side
   * GET /requestors
   *
   * Diferente de searchUsers: suporta busca por nome server-side (sem filtro client-side),
   * retorna requestor_id correto para criacao de ticket, e nao exige permissao admin.
   */
  async searchRequestors(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.name) params.append('name', filters.name);
    if (filters.email) params.append('email', filters.email);
    if (filters.telephone) params.append('telephone', filters.telephone);
    if (filters.can_open_ticket !== undefined) params.append('can_open_ticket', filters.can_open_ticket);

    return await this.makeRequest(`/requestors?${params.toString()}`);
  }

  /**
   * Busca solicitantes de um cliente especifico.
   * GET /clients/{client_id}/requestors
   *
   * Fallback de searchRequestors: o endpoint global GET /requestors e admin-only
   * (403 para atendente sem permissao de gestao global). A rota escopada por cliente
   * pode estar acessivel a atendentes com permissao naquele cliente — os clientes ja
   * vem filtrados pela permissao/mesa do atendente. Mesmos filtros que searchRequestors.
   */
  async searchClientRequestors(clientId, filters = {}) {
    if (!clientId) {
      return { error: 'clientId é obrigatório', status: 'VALIDATION_ERROR' };
    }
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.name) params.append('name', filters.name);
    if (filters.email) params.append('email', filters.email);
    if (filters.telephone) params.append('telephone', filters.telephone);
    if (filters.extension) params.append('extension', filters.extension);
    if (filters.can_open_ticket !== undefined) params.append('can_open_ticket', filters.can_open_ticket);
    if (filters.include_entity_fields) params.append('include_entity_fields', 'true');

    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/requestors?${params.toString()}`);
  }

  /**
   * Busca um solicitante especifico de um cliente pelo ID
   * GET /clients/{client_id}/requestors/{id}
   *
   * @param {number|string} clientId - ID do cliente
   * @param {number|string} id - ID do solicitante
   * @param {object} options - { showEntities (boolean) } → include_entity_fields=true
   */
  async getRequestor(clientId, id, options = {}) {
    const params = new URLSearchParams();
    if (options.showEntities) params.append('include_entity_fields', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/requestors/${encodeURIComponent(id)}${qs}`);
  }

  /**
   * Cria um novo solicitante em um cliente
   * POST /clients/{client_id}/requestors
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} body - { name*, telephone*, email, can_open_ticket, extension, country }
   */
  async createRequestor(clientId, body) {
    const jsonData = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/requestors`, 'POST', jsonData, headers);
  }

  /**
   * Atualiza um solicitante existente (atualizacao parcial — so envia campos informados)
   * PUT /clients/{client_id}/requestors/{id}
   *
   * @param {number|string} clientId - ID do cliente
   * @param {number|string} id - ID do solicitante
   * @param {object} body - campos a atualizar
   */
  async updateRequestor(clientId, id, body) {
    const jsonData = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/requestors/${encodeURIComponent(id)}`, 'PUT', jsonData, headers);
  }

  /**
   * Atualiza campos personalizados (entities) de um solicitante
   * PUT /clients/{client_id}/requestors/{id}/entities
   *
   * @param {number|string} clientId - ID do cliente
   * @param {number|string} id - ID do solicitante
   * @param {object} entitiesData - { entities[] }
   */
  async updateRequestorEntities(clientId, id, entitiesData) {
    const jsonData = JSON.stringify(entitiesData);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/requestors/${encodeURIComponent(id)}/entities`, 'PUT', jsonData, headers);
  }

  /**
   * Busca dados do usuario autenticado incluindo feature flags
   * GET /users/me
   */
  async fetchCurrentUser() {
    return await this.makeRequest('/users/me');
  }

  /**
   * Lista grupos de atendimento (technical groups)
   * GET /technical-groups
   */
  async listTechnicalGroups(filters = {}) {
    const params = new URLSearchParams();
    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 100));
    params.append('offset', offset);
    params.append('limit', limit);
    return await this.makeRequest(`/technical-groups?${params.toString()}`);
  }

  /**
   * Lista usuarios de um grupo de atendimento
   * GET /technical-groups/{id}/users
   */
  async listTechnicalGroupUsers(groupId, filters = {}) {
    if (!groupId) {
      return { error: 'groupId é obrigatório', status: 'VALIDATION_ERROR' };
    }
    const params = new URLSearchParams();
    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 200));
    params.append('offset', offset);
    params.append('limit', limit);
    return await this.makeRequest(`/technical-groups/${groupId}/users?${params.toString()}`);
  }

  /**
   * Busca usuarios com fallback para nao-admins via technical-groups.
   *
   * Fluxo:
   *   1. Tenta GET /users (admin: retorna lista completa; nao-admin: 403).
   *   2. Se 403: enumera GET /technical-groups (cap: MAX_GROUPS_CAP grupos),
   *      para cada grupo GET /technical-groups/{id}/users, dedup por id,
   *      aplica fuzzyMatchItems pelo nome, retorna no shape { data: [...] }.
   *
   * Cap defensivo: MAX_GROUPS_CAP grupos por busca para evitar custo em orgs grandes.
   * Se truncado, retorna `_truncated: true` no objeto de resposta.
   */
  async smartSearchUsers(filters = {}) {
    const MAX_GROUPS_CAP = 20;

    const directResponse = await this.searchUsers(filters);

    // Caminho direto (admin ou sucesso): retorna imediatamente
    if (!directResponse.error) {
      return directResponse;
    }

    // Se nao for 403, nao e problema de permissao — repassa o erro
    if (directResponse.status !== 403) {
      return directResponse;
    }

    // Fallback: enumerar grupos e seus usuarios.
    // Pede um a mais que o cap para distinguir "exatamente o cap" de "ha mais grupos".
    const groupsResponse = await this.listTechnicalGroups({ offset: 1, limit: MAX_GROUPS_CAP + 1 });

    if (groupsResponse.error) {
      return {
        error: `Sem acesso a GET /users (403) e GET /technical-groups tambem falhou: ${groupsResponse.error}`,
        status: groupsResponse.status
      };
    }

    const allGroups = groupsResponse.data || [];
    const truncated = allGroups.length > MAX_GROUPS_CAP;
    const groups = truncated ? allGroups.slice(0, MAX_GROUPS_CAP) : allGroups;

    // Buscar usuarios de todos os grupos em paralelo (evita N+1 serializado)
    const perGroupResponses = await Promise.all(
      groups.map(group => this.listTechnicalGroupUsers(group.id))
    );

    // Coletar usuarios (dedup por id) e contabilizar grupos sem acesso
    const seenIds = new Set();
    const allUsers = [];
    let groupErrors = 0;

    for (const usersResponse of perGroupResponses) {
      if (usersResponse.error) {
        groupErrors++;
        continue; // skip grupos sem acesso
      }
      const users = usersResponse.data || [];
      for (const user of users) {
        if (user && user.id !== undefined && !seenIds.has(user.id)) {
          seenIds.add(user.id);
          allUsers.push(user);
        }
      }
    }

    // Se NENHUM grupo respondeu e houve falhas, o problema e de permissao —
    // nao deixar virar "usuario nao encontrado" silencioso (diagnostico enganoso).
    if (allUsers.length === 0 && groups.length > 0 && groupErrors === groups.length) {
      return {
        error: `Sem acesso a GET /users (403) e nenhum dos ${groups.length} grupos de atendimento retornou usuarios (provavel falta de permissao em /technical-groups/{id}/users).`,
        status: 403
      };
    }

    // Aplicar filtros client-side de forma DEFENSIVA: o shape exato de
    // /technical-groups/{id}/users nao e garantido pelo Swagger, entao so
    // excluimos um usuario quando o campo esta presente E contradiz o filtro.
    // Campo ausente nao derruba o resultado (evita "0 usuarios" silencioso).
    let filtered = allUsers;

    if (filters.active !== undefined) {
      filtered = filtered.filter(u => isUserActive(u) === filters.active);
    }

    if (filters.type) {
      filtered = filtered.filter(u => {
        const t = u._type !== undefined ? u._type : u.type;
        return t === undefined || t === null || t === filters.type;
      });
    }

    if (filters.name) {
      const { fuzzyMatchItems } = require('../tools/_shared/fuzzyMatch');
      const { matches } = fuzzyMatchItems(filters.name, filtered, u => u.name);
      filtered = matches.map(m => m.item);
    }

    if (filters.limit && filters.limit < filtered.length) {
      filtered = filtered.slice(0, filters.limit);
    }

    return {
      data: filtered,
      _truncated: truncated,
      _fallback: 'technical-groups'
    };
  }

  /**
   * Busca um chat específico pelo ID
   * GET /chats/{id}
   */
  async getChat(id) {
    if (!id) {
      return { error: 'id é obrigatório', status: 'VALIDATION_ERROR' };
    }
    return await this.makeRequest(`/chats/${id}`);
  }

  /**
   * Lista chats da caixa de entrada (não assumidos)
   * GET /chats/inbox
   */
  async listInboxChats(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) >= 0 ? parseInt(filters.offset) : 1);
    const limit = Math.min(200, Math.max(1, filters.limit != null ? parseInt(filters.limit) : 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.department_id != null) params.append('department_id', filters.department_id);
    if (filters.client_id != null) params.append('client_id', filters.client_id);
    if (filters.requestor_id != null) params.append('requestor_id', filters.requestor_id);
    if (filters.number != null) params.append('number', filters.number);
    if (filters.origins != null) params.append('origins', filters.origins);
    if (filters.started_by != null) params.append('started_by', filters.started_by);
    appendChatDateFilters(params, filters);

    return await this.makeRequest(`/chats/inbox?${params.toString()}`);
  }

  /**
   * Lista chats assumidos pelo usuário da API key
   * GET /chats/mine
   */
  async listMyChats(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) >= 0 ? parseInt(filters.offset) : 1);
    const limit = Math.min(200, Math.max(1, filters.limit != null ? parseInt(filters.limit) : 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.department_id != null) params.append('department_id', filters.department_id);
    if (filters.client_id != null) params.append('client_id', filters.client_id);
    if (filters.requestor_id != null) params.append('requestor_id', filters.requestor_id);
    if (filters.number != null) params.append('number', filters.number);
    if (filters.origins != null) params.append('origins', filters.origins);
    if (filters.started_by != null) params.append('started_by', filters.started_by);
    appendChatDateFilters(params, filters);

    return await this.makeRequest(`/chats/mine?${params.toString()}`);
  }

  /**
   * Lista todos os chats em atendimento da organização
   * GET /chats/in_attendance
   */
  async listInAttendanceChats(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) >= 0 ? parseInt(filters.offset) : 1);
    const limit = Math.min(200, Math.max(1, filters.limit != null ? parseInt(filters.limit) : 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.department_id != null) params.append('department_id', filters.department_id);
    if (filters.client_id != null) params.append('client_id', filters.client_id);
    if (filters.requestor_id != null) params.append('requestor_id', filters.requestor_id);
    if (filters.number != null) params.append('number', filters.number);
    if (filters.origins != null) params.append('origins', filters.origins);
    if (filters.started_by != null) params.append('started_by', filters.started_by);
    if (filters.user_id != null) params.append('user_id', filters.user_id);
    if (filters.status != null) params.append('status', filters.status);
    appendChatDateFilters(params, filters);

    return await this.makeRequest(`/chats/in_attendance?${params.toString()}`);
  }

  /**
   * Lista chats arquivados (finalizados ou cancelados)
   * GET /chats/archived
   */
  async listArchivedChats(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) >= 0 ? parseInt(filters.offset) : 1);
    const limit = Math.min(200, Math.max(1, filters.limit != null ? parseInt(filters.limit) : 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.department_id != null) params.append('department_id', filters.department_id);
    if (filters.client_id != null) params.append('client_id', filters.client_id);
    if (filters.requestor_id != null) params.append('requestor_id', filters.requestor_id);
    if (filters.number != null) params.append('number', filters.number);
    if (filters.origins != null) params.append('origins', filters.origins);
    if (filters.started_by != null) params.append('started_by', filters.started_by);
    if (filters.canceled != null) params.append('canceled', filters.canceled ? 'true' : 'false');
    appendChatDateFilters(params, filters, { includeFinished: true });

    return await this.makeRequest(`/chats/archived?${params.toString()}`);
  }

  /**
   * Atualiza um chat (transfere atendente/departamento, vincula ticket)
   * PUT /chats/{id}
   *
   * Envia apenas os campos informados em chatData (user_id/department_id/ticket_number).
   */
  async updateChat(id, chatData = {}) {
    if (!id) {
      return { error: 'id é obrigatório', status: 'VALIDATION_ERROR' };
    }

    const chatObject = {};
    if (chatData.user_id !== undefined) chatObject.user_id = chatData.user_id;
    if (chatData.department_id !== undefined) chatObject.department_id = chatData.department_id;
    if (chatData.ticket_number !== undefined) chatObject.ticket_number = chatData.ticket_number;

    const jsonData = JSON.stringify(chatObject);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/chats/${id}`, 'PUT', jsonData, headers);
  }

  /**
   * Envia uma mensagem (livre ou modelo HSM) por WhatsApp, criando o chat no envio
   * POST /chats/send_message
   *
   * Envia apenas os campos informados em messageData. Sucesso: 201.
   */
  async sendChatMessage(messageData = {}) {
    const messageObject = {};
    const fields = [
      'number',
      'integration_id',
      'message',
      'template_id',
      'country_code',
      'name',
      'department_id',
      'ticket_number',
      'client_id',
      'parameters',
      'header_parameters',
      'archive'
    ];
    fields.forEach(field => {
      if (messageData[field] !== undefined) messageObject[field] = messageData[field];
    });

    const jsonData = JSON.stringify(messageObject);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest('/chats/send_message', 'POST', jsonData, headers);
  }

  /**
   * Finaliza (encerra) um chat
   * PUT /chats/{id}/archive
   *
   * Aceita services_catalogs_item_id quando a org usa catálogo no chat. Sucesso: 202.
   */
  async archiveChat(id, body = {}) {
    if (!id) {
      return { error: 'id é obrigatório', status: 'VALIDATION_ERROR' };
    }

    const archiveObject = {};
    if (body.services_catalogs_item_id !== undefined) {
      archiveObject.services_catalogs_item_id = body.services_catalogs_item_id;
    }

    const jsonData = JSON.stringify(archiveObject);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/chats/${id}/archive`, 'PUT', jsonData, headers);
  }

  /**
   * Lista campos personalizados (entities) disponiveis na organizacao.
   *
   * @param {object} filters - { active (boolean), applied_in (string), name (string), limit (int, default 20, max 200), offset (int, default 1) }
   */
  async listEntities(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.active !== undefined) params.append('active', filters.active);
    if (filters.applied_in) params.append('applied_in', filters.applied_in);
    if (filters.name) params.append('name', filters.name);

    return await this.makeRequest(`/entities?${params.toString()}`);
  }

  /**
   * Lista subcampos (entity_fields) de um campo personalizado especifico.
   *
   * @param {number} entityId - ID do campo personalizado
   * @param {object} filters - { field_type (string), required (boolean), name (string), limit (int, default 20, max 200), offset (int, default 1) }
   */
  async listEntityFields(entityId, filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.field_type) params.append('field_type', filters.field_type);
    if (filters.required !== undefined) params.append('required', filters.required);
    if (filters.name) params.append('name', filters.name);

    return await this.makeRequest(`/entities/${entityId}/fields?${params.toString()}`);
  }

  /**
   * Lista opcoes (entity_field_options) de um subcampo do tipo single_select ou checkbox.
   *
   * @param {number} entityFieldId - ID do subcampo
   * @param {object} filters - { value (string), limit (int, default 20, max 200), offset (int, default 1) }
   */
  async listEntityFieldOptions(entityFieldId, filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.value) params.append('value', filters.value);

    return await this.makeRequest(`/entity_fields/${entityFieldId}/options?${params.toString()}`);
  }

  /**
   * Lista respostas (comunicacoes com cliente) de um ticket com paginacao
   * GET /tickets/{ticket_number}/answers
   */
  async listTicketAnswers(ticketNumber, offset = 1, limit = 20) {
    const validOffset = Math.max(1, Number.parseInt(offset) || 1);
    const validLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

    const params = new URLSearchParams();
    params.append('offset', validOffset);
    params.append('limit', validLimit);

    return await this.makeRequest(`/tickets/${encodeURIComponent(ticketNumber)}/answers?${params.toString()}`);
  }

  /**
   * Busca uma resposta especifica de um ticket
   * GET /tickets/{ticket_number}/answers/{id}
   */
  async getTicketAnswer(ticketNumber, answerId) {
    return await this.makeRequest(
      `/tickets/${encodeURIComponent(ticketNumber)}/answers/${encodeURIComponent(answerId)}`
    );
  }

  /**
   * Lista o historico de eventos (timeline) de um ticket com paginacao e filtros opcionais
   * GET /tickets/{ticket_number}/histories
   */
  async getTicketHistories(ticketNumber, params = {}) {
    const validOffset = Math.max(1, Number.parseInt(params.offset) || 1);
    const validLimit = Math.min(200, Math.max(1, Number.parseInt(params.limit) || 20));

    const qs = new URLSearchParams();
    qs.append('offset', validOffset);
    qs.append('limit', validLimit);

    if (params.history_of != null) qs.append('history_of', params.history_of);
    if (params.type_id_attr != null) qs.append('type_id_attr', params.type_id_attr);
    if (params.operation != null) qs.append('operation', params.operation);

    return await this.makeRequest(`/tickets/${encodeURIComponent(ticketNumber)}/histories?${qs.toString()}`);
  }

  /**
   * Reabre um ticket fechado ou cancelado
   * PUT /tickets/{ticket_number}/reopen
   */
  async reopenTicket(ticketNumber, disapprovalReason) {
    // != null (e nao truthy): string vazia deve chegar a API para que ela
    // devolva o erro de validacao real, em vez de o campo ser engolido aqui.
    if (disapprovalReason != null) {
      const jsonData = JSON.stringify({ disapproval_reason: disapprovalReason });
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData)
      };
      return await this.makeRequest(`/tickets/${encodeURIComponent(ticketNumber)}/reopen`, 'PUT', jsonData, headers);
    }
    return await this.makeRequest(`/tickets/${encodeURIComponent(ticketNumber)}/reopen`, 'PUT');
  }

  /**
   * Remove uma resposta de um ticket.
   * DELETE /tickets/{ticket_number}/answers/{id}
   *
   * @param {string|number} ticketNumber - numero do ticket
   * @param {string|number} answerId - ID da resposta a remover
   */
  async deleteTicketAnswer(ticketNumber, answerId) {
    try {
      const response = await this.makeRequest(
        `/tickets/${encodeURIComponent(ticketNumber)}/answers/${encodeURIComponent(answerId)}`,
        'DELETE'
      );

      // 204 No Content — sucesso sem corpo
      if (response.status === 204 || (!response.error && response.data == null)) {
        return { data: null, status: 204 };
      }

      return response;
    } catch (error) {
      return { error: `Erro interno ao deletar resposta: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Remove um arquivo de uma resposta de ticket.
   * DELETE /ticket_answers/{ticket_answer_id}/files/{id}
   *
   * @param {string|number} answerId - ID da resposta
   * @param {string|number} fileId - ID do arquivo a remover
   */
  async deleteTicketAnswerFile(answerId, fileId) {
    try {
      const response = await this.makeRequest(
        `/ticket_answers/${encodeURIComponent(answerId)}/files/${encodeURIComponent(fileId)}`,
        'DELETE'
      );

      // 204 No Content — sucesso sem corpo
      if (response.status === 204 || (!response.error && response.data == null)) {
        return { data: null, status: 204 };
      }

      return response;
    } catch (error) {
      return { error: `Erro interno ao deletar arquivo da resposta: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Atualiza o texto de uma comunicacao interna.
   * PUT /tickets/{ticket_number}/internal_communications/{id}
   *
   * @param {string|number} ticketNumber - numero do ticket
   * @param {string|number} communicationId - ID da comunicacao interna
   * @param {string} text - novo texto (HTML, ja convertido pelo slice)
   */
  async updateInternalCommunication(ticketNumber, communicationId, text) {
    const jsonData = JSON.stringify({ text });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(
      `/tickets/${encodeURIComponent(ticketNumber)}/internal_communications/${encodeURIComponent(communicationId)}`,
      'PUT',
      jsonData,
      headers
    );
  }

  /**
   * Remove uma comunicacao interna de um ticket.
   * DELETE /tickets/{ticket_number}/internal_communications/{id}
   *
   * @param {string|number} ticketNumber - numero do ticket
   * @param {string|number} communicationId - ID da comunicacao interna
   */
  async deleteInternalCommunication(ticketNumber, communicationId) {
    try {
      const response = await this.makeRequest(
        `/tickets/${encodeURIComponent(ticketNumber)}/internal_communications/${encodeURIComponent(communicationId)}`,
        'DELETE'
      );

      // 204 No Content — sucesso sem corpo
      if (response.status === 204 || (!response.error && response.data == null)) {
        return { data: null, status: 204 };
      }

      return response;
    } catch (error) {
      return { error: `Erro interno ao deletar comunicacao interna: ${error.message}`, status: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Busca um cliente especifico pelo ID
   * GET /clients/{id}
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} options - { showEntities (boolean) }
   */
  async getClient(clientId, options = {}) {
    const params = new URLSearchParams();
    if (options.showEntities) params.append('show_entities', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}${qs}`);
  }

  /**
   * Cria um novo cliente
   * POST /clients
   *
   * @param {object} body - { name*, social*, social_revenue, desk_ids[], ... }
   */
  async createClient(body) {
    const jsonData = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest('/clients', 'POST', jsonData, headers);
  }

  /**
   * Atualiza um cliente existente (atualizacao parcial — so envia campos informados)
   * PUT /clients/{id}
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} body - campos a atualizar
   */
  async updateClient(clientId, body) {
    const jsonData = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}`, 'PUT', jsonData, headers);
  }

  /**
   * Atualiza campos personalizados (entities) de um cliente
   * PUT /clients/{id}/entities
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} entitiesData - { entities[] }
   */
  async updateClientEntities(clientId, entitiesData) {
    const jsonData = JSON.stringify(entitiesData);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/entities`, 'PUT', jsonData, headers);
  }

  /**
   * Lista clientes com filtros opcionais
   * GET /clients
   *
   * @param {object} filters - { active, name, social_revenue, offset, limit }
   */
  async listClients(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.active !== undefined) params.append('active', filters.active);
    if (filters.name) params.append('name', filters.name);
    if (filters.social_revenue) params.append('social_revenue', filters.social_revenue);

    return await this.makeRequest(`/clients?${params.toString()}`);
  }

  /**
   * Lista mesas relacionadas a um cliente especifico
   * GET /clients/{id}/desks
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} options - { offset, limit }
   */
  async getClientDesks(clientId, options = {}) {
    const params = new URLSearchParams();
    const offset = Math.max(1, parseInt(options.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/desks?${params.toString()}`);
  }

  /**
   * Lista grupos tecnicos relacionados a um cliente especifico
   * GET /clients/{id}/technical-groups
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} options - { offset, limit }
   */
  async getClientTechnicalGroups(clientId, options = {}) {
    const params = new URLSearchParams();
    const offset = Math.max(1, parseInt(options.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/technical-groups?${params.toString()}`);
  }

  /**
   * Cria um usuario cliente (portal) para um cliente especifico
   * POST /clients/{id}/users
   *
   * @param {number|string} clientId - ID do cliente
   * @param {object} user - { name*, email*, extension, authorization_flow, telephone, country_code }
   */
  async createClientUser(clientId, user) {
    const jsonData = JSON.stringify({ user });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/users`, 'POST', jsonData, headers);
  }

  /**
   * Adiciona dominio/e-mail autorizado a abrir tickets em nome do cliente
   * POST /clients/{id}/email_tickets_permissions
   *
   * @param {number|string} clientId - ID do cliente
   * @param {string} address - dominio ou email
   */
  async addClientEmailPermission(clientId, address) {
    const jsonData = JSON.stringify({ address });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest(`/clients/${encodeURIComponent(clientId)}/email_tickets_permissions`, 'POST', jsonData, headers);
  }

  /**
   * Busca atendentes tecnicos com filtros server-side.
   * GET /technical-users
   *
   * Endpoint permissivo — nao exige permissao de gerenciamento de usuarios,
   * apenas licenca de tickets ativa. Retorna array plano de { id, email, name }.
   *
   * Diferente de searchUsers/smartSearchUsers: suporta busca server-side por
   * name/email e filtros de escopo desk_id/client_id (sem filtro client-side).
   * desk_id e client_id devem ser inteiros — a API retorna 422 (error_code 42201)
   * se nao forem.
   *
   * @param {object} filters - { name, email, desk_id, client_id, offset, limit }
   */
  async searchTechnicalUsers(filters = {}) {
    const params = new URLSearchParams();

    const offset = Math.max(1, parseInt(filters.offset) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 20));
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.name) params.append('name', filters.name);
    if (filters.email) params.append('email', filters.email);
    // Coerce para inteiro — API retorna 422 se receber string ou float.
    // So envia se for inteiro valido: um valor nao-numerico (NaN) seria serializado
    // como "desk_id=NaN" e causaria 422 (que nao e 404/403, logo nao aciona fallback).
    // Nesse caso preferimos omitir o scope (busca sem filtro) a vazar erro ao usuario.
    const deskId = parseInt(filters.desk_id, 10);
    if (Number.isInteger(deskId)) params.append('desk_id', deskId);
    const clientId = parseInt(filters.client_id, 10);
    if (Number.isInteger(clientId)) params.append('client_id', clientId);

    return await this.makeRequest(`/technical-users?${params.toString()}`);
  }

  /**
   * Busca itens de catalogo de servicos de uma mesa especifica
   * GET /desks/{id}/services-catalogs-items
   */
  async searchCatalogItems(deskId, filters = {}) {
    const params = new URLSearchParams();

    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200);
    params.append('offset', offset);
    params.append('limit', limit);

    if (filters.area_id) params.append('area_id', filters.area_id);
    if (filters.catalog_id) params.append('catalog_id', filters.catalog_id);
    if (filters.name) params.append('name', filters.name);

    return await this.makeRequest(`/desks/${deskId}/services-catalogs-items?${params.toString()}`);
  }

  /**
   * Lista conhecimentos da base de conhecimento com filtros opcionais.
   * GET /knowledges
   *
   * @param {object} filters - { limit, offset, search, knowledge_folder_ids (array de int) }
   * @returns {Promise<{data, status, error}>}
   */
  async listKnowledges(filters = {}) {
    const params = new URLSearchParams();

    const limit = Math.min(filters.limit || 20, 200);
    const offset = Math.max(filters.offset || 1, 1);

    params.append('limit', limit);
    params.append('offset', offset);

    if (filters.search) {
      params.append('search', filters.search);
    }

    if (Array.isArray(filters.knowledge_folder_ids) && filters.knowledge_folder_ids.length > 0) {
      params.append('knowledge_folder_ids', filters.knowledge_folder_ids.join(','));
    }

    const response = await this.makeRequest(`/knowledges?${params.toString()}`);

    // Surface o total real (header X-Total-Items) para a listagem distinguir
    // "quantidade nesta pagina" de "total que satisfaz o filtro".
    if (response && !response.error && response.headers) {
      const totalHeader = response.headers['x-total-items'] ?? response.headers['X-Total-Items'];
      const total = parseInt(totalHeader, 10);
      if (!Number.isNaN(total)) response.total = total;
    }

    return response;
  }

  /**
   * Cria um novo conhecimento na base de conhecimento.
   * POST /knowledges
   *
   * @param {object} body - { title, description, knowledge_folder_ids, tags?, private?, client_ids?, technical_group_ids?, services_catalogs_item_ids? }
   * @returns {Promise<{data, status, error}>}
   */
  async createKnowledge(body) {
    const jsonData = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };
    return await this.makeRequest('/knowledges', 'POST', jsonData, headers);
  }
}

module.exports = TiFluxAPI;
