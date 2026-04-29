/**
 * OpenAPI 3.0 Specification
 *
 * Served by Scalar at GET /docs
 * Descreve todos os endpoints públicos e autenticados da API.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Compliance Backend API',
    version: '1.0.0',
    description:
      'API de análise de documentos de compliance com IA. ' +
      'Endpoints de autenticação JWT e análise de contratos via Claude.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local (dev)' },
    { url: 'http://localhost:3001', description: 'Local alternativo' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token obtido em POST /api/v1/auth/login',
      },
    },
    schemas: {
      // ── Auth ────────────────────────────────────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'usuario@empresa.com' },
          password: { type: 'string', minLength: 8, example: 'senhaSegura123' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'usuario@empresa.com' },
          password: { type: 'string', example: 'senhaSegura123' },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', example: 'eyJhbGci...' },
        },
      },
      LogoutRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', example: 'eyJhbGci...' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                },
              },
            },
          },
        },
      },
      MeResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
      // ── AI ──────────────────────────────────────────────────────────────────
      GenerateRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            example: 'Analise as cláusulas de rescisão do contrato a seguir.',
          },
          context: {
            type: 'string',
            description: 'Contexto adicional opcional enviado ao modelo',
            example: 'Contrato de prestação de serviços de TI...',
          },
        },
      },
      GenerateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              result: { type: 'string', description: 'Resposta gerada pelo modelo' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Mensagem de erro' },
          statusCode: { type: 'integer', example: 400 },
        },
      },
    },
  },
  paths: {
    // ── Health ───────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Verifica se a API está no ar.',
        responses: {
          '200': {
            description: 'API operacional',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Auth ─────────────────────────────────────────────────────────────────
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Cadastrar usuário',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Usuário criado — retorna tokens JWT',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Dados inválidos',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '409': {
            description: 'Email já cadastrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Login bem-sucedido — retorna tokens JWT',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': {
            description: 'Credenciais inválidas',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Renovar access token',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Novo par de tokens emitido',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': {
            description: 'Refresh token inválido ou expirado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout (revoga refresh token)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LogoutRequest' } },
          },
        },
        responses: {
          '200': { description: 'Logout realizado com sucesso' },
          '401': {
            description: 'Token inválido',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Dados do usuário autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Perfil do usuário',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } },
            },
          },
          '401': {
            description: 'Não autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    // ── AI ───────────────────────────────────────────────────────────────────
    '/api/v1/ai/generate': {
      post: {
        tags: ['AI'],
        summary: 'Gerar análise via prompt + contexto (JSON)',
        description:
          'Envia um prompt de texto com contexto opcional. Ideal para prompts programáticos.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/GenerateRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Análise gerada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '400': {
            description: 'Prompt ausente ou inválido',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai/generate-with-files': {
      post: {
        tags: ['AI'],
        summary: 'Analisar arquivo(s) — análise completa (core)',
        description:
          'Recebe um ou mais arquivos (PDF, DOCX, TXT) e executa análise de compliance ' +
          'guiada pelo system prompt. Opcionalmente aceita `contractText` como fallback de texto.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Arquivos PDF, DOCX ou TXT (máx. 10 MB cada)',
                  },
                  contractText: {
                    type: 'string',
                    description: 'Texto do contrato como alternativa ao upload',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Análise de compliance gerada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '400': {
            description: 'Nenhum arquivo ou texto enviado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai/ask': {
      post: {
        tags: ['AI'],
        summary: 'Pergunta livre sobre arquivo (freemium)',
        description:
          'Recebe arquivo(s) + uma pergunta específica do usuário. ' +
          'Sem system prompt de compliance — o modelo responde livremente.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Arquivos PDF, DOCX ou TXT (máx. 10 MB cada)',
                  },
                  question: {
                    type: 'string',
                    description: 'Pergunta que o usuário quer fazer sobre o documento',
                    example: 'Quais são as cláusulas de rescisão?',
                  },
                  contractText: {
                    type: 'string',
                    description: 'Texto do contrato como alternativa ao upload',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Resposta à pergunta gerada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '400': {
            description: 'Pergunta ausente ou sem conteúdo',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
  },
} as const;
