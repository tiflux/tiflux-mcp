// Teste simples do fluxo de mapeamento
const _extractId = (value) => {
  if (value === null || value === undefined) return null;
  const id = parseInt(value);
  return isNaN(id) ? null : id;
};

const _cleanObject = (obj) => {
  const cleaned = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const cleanedChild = _cleanObject(value);
        if (Object.keys(cleanedChild).length > 0) {
          cleaned[key] = cleanedChild;
        }
      } else {
        cleaned[key] = value;
      }
    }
  });

  return cleaned;
};

// Simula mapUpdateToAPI
const mapUpdateToAPI = (updateData) => {
  const apiData = {};

  const idFields = [
    'client_id', 'desk_id', 'priority_id', 'status_id',
    'stage_id', 'responsible_id', 'services_catalogs_item_id'
  ];

  idFields.forEach(field => {
    if (updateData[field] !== undefined) {
      if (updateData[field] === null) {
        apiData[field] = null;
      } else {
        apiData[field] = _extractId(updateData[field]);
      }
    }
  });

  return _cleanObject(apiData);
};

// TESTE
const updateData = {
  desk_id: 42821,
  services_catalogs_item_id: 1388284
};

console.log('Input:', JSON.stringify(updateData));

const result = mapUpdateToAPI(updateData);

console.log('Output:', JSON.stringify(result));
console.log('Keys:', Object.keys(result));
console.log('desk_id:', result.desk_id, typeof result.desk_id);
console.log('services_catalogs_item_id:', result.services_catalogs_item_id, typeof result.services_catalogs_item_id);
