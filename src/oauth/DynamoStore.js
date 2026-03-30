/**
 * DynamoStore - Storage OAuth usando DynamoDB
 *
 * Single table design com PK/SK para armazenar:
 * - Clients (Dynamic Client Registration)
 * - Authorization Codes
 * - Access Tokens
 * - Refresh Tokens
 *
 * TTL automatico via atributo `ttl` para limpeza de registros expirados.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.OAUTH_TABLE_NAME || 'tiflux-mcp-oauth';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'sa-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

class DynamoStore {
  // --- Clients ---

  static async saveClient({ clientId, clientSecret, clientName, redirectUris }) {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CLIENT#${clientId}`,
        SK: 'META',
        clientId,
        clientSecret,
        clientName,
        redirectUris,
        createdAt: new Date().toISOString()
      }
    }));
  }

  static async getClient(clientId) {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CLIENT#${clientId}`, SK: 'META' }
    }));
    return result.Item || null;
  }

  // --- Authorization Codes ---

  static async saveAuthorizationCode({ code, clientId, apiKey, codeChallenge, codeChallengeMethod, state, redirectUri }) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CODE#${code}`,
        SK: 'META',
        code,
        clientId,
        apiKey,
        codeChallenge,
        codeChallengeMethod,
        state,
        redirectUri,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl: Math.floor(expiresAt.getTime() / 1000)
      }
    }));
  }

  static async getAuthorizationCode(code) {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CODE#${code}`, SK: 'META' }
    }));

    const item = result.Item;
    if (!item) return null;

    // Verificar expiracao
    if (new Date(item.expiresAt) < new Date()) {
      await this.deleteAuthorizationCode(code);
      return null;
    }

    return item;
  }

  static async deleteAuthorizationCode(code) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CODE#${code}`, SK: 'META' }
    }));
  }

  // --- Access Tokens ---

  static async saveAccessToken({ accessToken, clientId, apiKey, expiresInSeconds = 3600 }) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TOKEN#${accessToken}`,
        SK: 'META',
        accessToken,
        clientId,
        apiKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl: Math.floor(expiresAt.getTime() / 1000)
      }
    }));
  }

  static async getAccessToken(accessToken) {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TOKEN#${accessToken}`, SK: 'META' }
    }));

    const item = result.Item;
    if (!item) return null;

    // Verificar expiracao
    if (new Date(item.expiresAt) < new Date()) {
      return null;
    }

    return item;
  }

  // --- Refresh Tokens ---

  static async saveRefreshToken({ refreshToken, clientId, apiKey, expiresInSeconds = 30 * 24 * 3600 }) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `REFRESH#${refreshToken}`,
        SK: 'META',
        refreshToken,
        clientId,
        apiKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl: Math.floor(expiresAt.getTime() / 1000)
      }
    }));
  }

  static async getRefreshToken(refreshToken) {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REFRESH#${refreshToken}`, SK: 'META' }
    }));

    const item = result.Item;
    if (!item) return null;

    if (new Date(item.expiresAt) < new Date()) {
      return null;
    }

    return item;
  }

  static async deleteRefreshToken(refreshToken) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REFRESH#${refreshToken}`, SK: 'META' }
    }));
  }
}

module.exports = DynamoStore;
