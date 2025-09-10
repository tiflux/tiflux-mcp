/**
 * Testes unitários para schemas
 * Valida estrutura e integridade dos schemas MCP
 */

const schemas = require('../../../src/schemas');

describe('Schemas', () => {
  describe('Estrutura geral', () => {
    it('deve exportar todas as categorias de schemas', () => {
      expect(schemas.tickets).toBeDefined();
      expect(schemas.clients).toBeDefined();
      expect(schemas.internalCommunications).toBeDefined();
      expect(schemas.all).toBeDefined();
    });

    it('deve ter array "all" com todos os schemas', () => {
      const ticketCount = Object.keys(schemas.tickets).length;
      const clientCount = Object.keys(schemas.clients).length;
      const internalCommCount = Object.keys(schemas.internalCommunications).length;
      const totalExpected = ticketCount + clientCount + internalCommCount;
      
      expect(schemas.all).toHaveLength(totalExpected);
    });

    it('todos os schemas devem ter estrutura MCP válida', () => {
      schemas.all.forEach(schema => {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('inputSchema');
        expect(typeof schema.name).toBe('string');
        expect(typeof schema.description).toBe('string');
        expect(typeof schema.inputSchema).toBe('object');
      });
    });
  });

  describe('Schemas de Comunicações Internas', () => {
    it('deve ter schema create_internal_communication', () => {
      const schema = schemas.internalCommunications.create_internal_communication;
      
      expect(schema.name).toBe('create_internal_communication');
      expect(schema.description).toContain('comunicação interna');
      expect(schema.inputSchema.type).toBe('object');
      expect(schema.inputSchema.required).toContain('ticket_number');
      expect(schema.inputSchema.required).toContain('text');
    });

    it('deve ter schema list_internal_communications', () => {
      const schema = schemas.internalCommunications.list_internal_communications;
      
      expect(schema.name).toBe('list_internal_communications');
      expect(schema.description).toContain('Listar comunicações internas');
      expect(schema.inputSchema.type).toBe('object');
      expect(schema.inputSchema.required).toContain('ticket_number');
    });

    it('create_internal_communication deve ter propriedades corretas', () => {
      const schema = schemas.internalCommunications.create_internal_communication;
      const properties = schema.inputSchema.properties;
      
      expect(properties.ticket_number).toBeDefined();
      expect(properties.ticket_number.type).toBe('string');
      
      expect(properties.text).toBeDefined();
      expect(properties.text.type).toBe('string');
      
      expect(properties.files).toBeDefined();
      expect(properties.files.type).toBe('array');
      expect(properties.files.items.type).toBe('string');
    });

    it('list_internal_communications deve ter propriedades de paginação', () => {
      const schema = schemas.internalCommunications.list_internal_communications;
      const properties = schema.inputSchema.properties;
      
      expect(properties.ticket_number).toBeDefined();
      expect(properties.ticket_number.type).toBe('string');
      
      expect(properties.offset).toBeDefined();
      expect(properties.offset.type).toBe('number');
      
      expect(properties.limit).toBeDefined();
      expect(properties.limit.type).toBe('number');
    });
  });

  describe('Schemas de Tickets', () => {
    it('deve ter todos os schemas esperados de tickets', () => {
      const expectedSchemas = ['get_ticket', 'create_ticket', 'update_ticket', 'list_tickets'];
      
      expectedSchemas.forEach(schemaName => {
        expect(schemas.tickets[schemaName]).toBeDefined();
        expect(schemas.tickets[schemaName].name).toBe(schemaName);
      });
    });

    it('get_ticket deve ter ticket_id obrigatório', () => {
      const schema = schemas.tickets.get_ticket;
      
      expect(schema.inputSchema.required).toContain('ticket_id');
      expect(schema.inputSchema.properties.ticket_id.type).toBe('string');
    });

    it('create_ticket deve ter campos obrigatórios', () => {
      const schema = schemas.tickets.create_ticket;
      
      expect(schema.inputSchema.required).toContain('title');
      expect(schema.inputSchema.required).toContain('description');
    });

    it('list_tickets deve ter filtros opcionais', () => {
      const schema = schemas.tickets.list_tickets;
      const properties = schema.inputSchema.properties;
      
      expect(properties.desk_ids).toBeDefined();
      expect(properties.client_ids).toBeDefined();
      expect(properties.stage_ids).toBeDefined();
      expect(properties.responsible_ids).toBeDefined();
      expect(properties.offset).toBeDefined();
      expect(properties.limit).toBeDefined();
      expect(properties.is_closed).toBeDefined();
    });
  });

  describe('Schemas de Clientes', () => {
    it('deve ter search_client', () => {
      const schema = schemas.clients.search_client;
      
      expect(schema).toBeDefined();
      expect(schema.name).toBe('search_client');
      expect(schema.inputSchema.properties.client_name).toBeDefined();
    });
  });

  describe('Validação de descrições', () => {
    it('todas as descrições devem ser informativas', () => {
      schemas.all.forEach(schema => {
        expect(schema.description.length).toBeGreaterThan(10);
        expect(schema.description).not.toContain('TODO');
        expect(schema.description).not.toContain('FIXME');
      });
    });

    it('propriedades devem ter descrições úteis', () => {
      schemas.all.forEach(schema => {
        const properties = schema.inputSchema.properties || {};
        
        Object.entries(properties).forEach(([propName, propDef]) => {
          if (propDef.description) {
            expect(propDef.description.length).toBeGreaterThan(5);
            expect(propDef.description).not.toBe(propName);
          }
        });
      });
    });
  });

  describe('Consistência de tipos', () => {
    it('IDs devem ser consistentemente string ou number', () => {
      const idFields = ['ticket_id', 'client_id', 'desk_id', 'stage_id', 'responsible_id'];
      
      schemas.all.forEach(schema => {
        const properties = schema.inputSchema.properties || {};
        
        idFields.forEach(idField => {
          if (properties[idField]) {
            // ticket_id é sempre string, outros IDs são number
            const expectedType = idField === 'ticket_id' ? 'string' : 'number';
            expect(properties[idField].type).toBe(expectedType);
          }
        });
      });
    });

    it('campos de paginação devem ser number', () => {
      const paginationFields = ['offset', 'limit'];
      
      schemas.all.forEach(schema => {
        const properties = schema.inputSchema.properties || {};
        
        paginationFields.forEach(field => {
          if (properties[field]) {
            expect(properties[field].type).toBe('number');
          }
        });
      });
    });
  });

  describe('Integração com array "all"', () => {
    it('todos os schemas individuais devem estar em "all"', () => {
      const allSchemaNames = schemas.all.map(s => s.name);
      
      // Verificar tickets
      Object.values(schemas.tickets).forEach(schema => {
        expect(allSchemaNames).toContain(schema.name);
      });
      
      // Verificar clientes  
      Object.values(schemas.clients).forEach(schema => {
        expect(allSchemaNames).toContain(schema.name);
      });
      
      // Verificar comunicações internas
      Object.values(schemas.internalCommunications).forEach(schema => {
        expect(allSchemaNames).toContain(schema.name);
      });
    });

    it('não deve haver schemas duplicados em "all"', () => {
      const schemaNames = schemas.all.map(s => s.name);
      const uniqueNames = [...new Set(schemaNames)];
      
      expect(schemaNames).toHaveLength(uniqueNames.length);
    });
  });
});