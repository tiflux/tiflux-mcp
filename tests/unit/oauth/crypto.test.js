const crypto = require('../../../src/oauth/crypto');

describe('OAuth Crypto', () => {
  describe('generateClientId', () => {
    it('deve gerar client_id com prefixo cl_', () => {
      const id = crypto.generateClientId();
      expect(id).toMatch(/^cl_[a-f0-9]{32}$/);
    });

    it('deve gerar IDs unicos', () => {
      const ids = new Set(Array.from({ length: 100 }, () => crypto.generateClientId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('generateClientSecret', () => {
    it('deve gerar secret com prefixo cs_', () => {
      const secret = crypto.generateClientSecret();
      expect(secret).toMatch(/^cs_[a-f0-9]{64}$/);
    });
  });

  describe('generateAuthorizationCode', () => {
    it('deve gerar code com prefixo ac_', () => {
      const code = crypto.generateAuthorizationCode();
      expect(code).toMatch(/^ac_[a-f0-9]{48}$/);
    });
  });

  describe('generateAccessToken', () => {
    it('deve gerar token com prefixo at_', () => {
      const token = crypto.generateAccessToken();
      expect(token).toMatch(/^at_[a-f0-9]{64}$/);
    });
  });

  describe('generateRefreshToken', () => {
    it('deve gerar token com prefixo rt_', () => {
      const token = crypto.generateRefreshToken();
      expect(token).toMatch(/^rt_[a-f0-9]{64}$/);
    });
  });

  describe('validatePKCE', () => {
    it('deve validar code_verifier correto contra code_challenge S256', () => {
      const nodeCrypto = require('crypto');
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = nodeCrypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      expect(crypto.validatePKCE(codeVerifier, codeChallenge)).toBe(true);
    });

    it('deve rejeitar code_verifier incorreto', () => {
      const nodeCrypto = require('crypto');
      const codeVerifier = 'correct-verifier';
      const codeChallenge = nodeCrypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      expect(crypto.validatePKCE('wrong-verifier', codeChallenge)).toBe(false);
    });

    it('deve rejeitar valores nulos', () => {
      expect(crypto.validatePKCE(null, 'challenge')).toBe(false);
      expect(crypto.validatePKCE('verifier', null)).toBe(false);
      expect(crypto.validatePKCE(null, null)).toBe(false);
    });
  });
});
