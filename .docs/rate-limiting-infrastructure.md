# Rate Limiting via Infraestrutura AWS

Implementacao de controle de chamadas diretamente na infraestrutura AWS Lambda.

## Configuracao Implementada

### ReservedConcurrentExecutions: 10

**O que faz:**
- Limita Lambda a processar NO MAXIMO 10 requisicoes simultaneas
- Requisicoes adicionais recebem erro 429 (Too Many Requests)
- Protege contra custos excessivos e abuso

**Capacidade:**
```
10 execucoes simultaneas x 30s timeout = ~20 req/min maximo teorico
Na pratica (media 2s por request): ~300 req/min
```

## Como Funciona

**Request Flow:**
```
Cliente -> Lambda Function URL -> Fila (se >10 simultaneos)
                                    |
                                    v
                              Erro 429 (se fila cheia)
```

**Comportamento por Cenario:**

1. **Uso Normal (1-5 requests simultaneos)**
   - Processamento instantaneo
   - Latencia: 1-3s

2. **Pico Moderado (6-10 requests simultaneos)**
   - Todos processados
   - Latencia: 1-3s

3. **Pico Alto (>10 requests simultaneos)**
   - Primeiros 10: processados
   - Demais: erro 429 instantaneo
   - Cliente deve implementar retry

## Vantagens

**Controle de Custos:**
- Custo maximo previsivel
- 10 execucoes x 30s x $0.0000166667/GB-s = $0.0025/minuto
- Teto de ~$3.60/dia mesmo sob ataque

**Protecao contra Abuso:**
- DDoS mitigado automaticamente
- Sem necessidade de WAF adicional
- Implementacao zero-code

**Simplicidade:**
- Configuracao nativa AWS
- Sem codigo adicional
- Sem servicos extras

## Quando Aumentar o Limite

**Sinais para aumentar:**
- CloudWatch mostra throttling frequente
- Usuarios reportam erro 429 em uso normal
- Metricas de concorrencia consistentemente em 10

**Como aumentar:**
```yaml
ReservedConcurrentExecutions: 20  # Dobrar capacidade
```

**Custos por limite:**
- 10 simultaneous: ~$5/mes uso moderado
- 20 simultaneous: ~$10/mes uso moderado
- 50 simultaneous: ~$25/mes uso moderado

## Monitoramento

**Metricas CloudWatch:**
```bash
# Ver throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Throttles \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-01T23:59:59Z \
  --period 300 \
  --statistics Sum

# Ver concorrencia
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-01T23:59:59Z \
  --period 60 \
  --statistics Maximum
```

## Alternativas Futuras

**Se precisar rate limiting mais granular:**

### Opcao 1: CloudFront + Lambda@Edge
```yaml
# Rate limit por IP
# Cache de responses
# Custo: +$1-2/mes
```

### Opcao 2: API Gateway (em vez de Function URL)
```yaml
# Throttling por API key
# Quotas diarias/mensais
# Custo: +$3.50/milhao requests
```

### Opcao 3: AWS WAF
```yaml
# Rate limit por IP + regras avancadas
# Protecao DDoS nivel enterprise
# Custo: +$5/mes base + $1/milhao requests
```

## Recomendacao

**Para fase inicial: MANTER ReservedConcurrentExecutions: 10**

Motivos:
- Simples e efetivo
- Custo controlado
- Facil de aumentar depois
- Suficiente para testes e uso inicial

Avaliar upgrade apos 1 mes de metricas reais.
