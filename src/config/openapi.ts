/**
 * OpenAPI 3.0 Specification
 *
 * Served by Scalar at GET /docs
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Compliance Backend API',
    version: '2.0.0',
    description:
      'API de analise de documentos de compliance com IA. ' +
      'Autenticacao JWT com RBAC (user / admin). ' +
      'Historico de analises por usuario.',
  },
  servers: [
    { url: 'https://compliance-back-production.up.railway.app', description: 'Produção (Railway)' },
    { url: 'http://localhost:3000', description: 'Local (dev)' },
  ],
  security: [{ bearerAuth: [] }],
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
        properties: { refreshToken: { type: 'string', example: 'eyJhbGci...' } },
      },
      LogoutRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string', example: 'eyJhbGci...' } },
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
              role: { type: 'string', enum: ['user', 'admin'] },
            },
          },
        },
      },
      PromoteRequest: {
        type: 'object',
        required: ['role'],
        properties: { role: { type: 'string', enum: ['user', 'admin'], example: 'admin' } },
      },
      GenerateRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', example: 'Analise as clausulas de rescisao.' },
          context: { type: 'string' },
        },
      },
      GenerateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              analysis: { type: 'object', nullable: true },
              response: { type: 'string' },
              model: { type: 'string' },
              usage: {
                type: 'object',
                properties: {
                  inputTokens: { type: 'integer' },
                  outputTokens: { type: 'integer' },
                  totalTokens: { type: 'integer' },
                  costUsd: { type: 'number' },
                },
              },
            },
          },
        },
      },
      GenerateWithFilesResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              analysis: {
                type: 'object',
                nullable: true,
                description: 'Analise estruturada (problemas, sugestoes, risco)',
              },
              documentId: {
                type: 'string',
                example: '6634a1b2c3d4e5f6a7b8c9d0',
                description: 'ID do DocumentRecord — usar em /document-analysis',
              },
              analysisId: {
                type: 'string',
                example: '6634a1b2c3d4e5f6a7b8c9d1',
                description: 'ID do Analysis — usar em /document-analysis/generate-patches',
              },
              model: { type: 'string' },
              usage: {
                type: 'object',
                properties: {
                  inputTokens: { type: 'integer' },
                  outputTokens: { type: 'integer' },
                  totalTokens: { type: 'integer' },
                  costUsd: { type: 'number' },
                },
              },
            },
          },
        },
      },
      DocumentPatch: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6634a1b2c3d4e5f6a7b8c9d2' },
          documentId: { type: 'string' },
          analysisId: { type: 'string', nullable: true },
          trecho_exato: { type: 'string', description: 'Trecho verbatim do documento original' },
          problema: { type: 'string', description: 'Descricao do problema em pt-BR' },
          rewrite: { type: 'string', description: 'Substituto cirurgico para trecho_exato' },
          needs_context: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      GeneratePatchesRequest: {
        type: 'object',
        required: ['documentId', 'analysisId'],
        properties: {
          documentId: {
            type: 'string',
            example: '6634a1b2c3d4e5f6a7b8c9d0',
            description: 'Retornado por /ai/generate-with-files',
          },
          analysisId: {
            type: 'string',
            example: '6634a1b2c3d4e5f6a7b8c9d1',
            description: 'Retornado por /ai/generate-with-files',
          },
        },
      },
      GeneratePatchesResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              documentId: { type: 'string' },
              analysisId: { type: 'string' },
              fromCache: {
                type: 'boolean',
                description: 'true = patches ja existiam, IA nao foi chamada',
              },
              totalPatches: { type: 'integer' },
              patches: { type: 'array', items: { $ref: '#/components/schemas/DocumentPatch' } },
              usage: {
                nullable: true,
                type: 'object',
                properties: {
                  inputTokens: { type: 'integer' },
                  outputTokens: { type: 'integer' },
                  costUsd: { type: 'number' },
                },
              },
            },
          },
        },
      },
      CorrectDocumentRequest: {
        type: 'object',
        properties: {
          issueIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs dos patches a aplicar. Omitir para aplicar todos.',
            example: ['6634a1b2c3d4e5f6a7b8c9d2'],
          },
        },
      },
      CorrectDocumentResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              documentId: { type: 'string' },
              correctedText: {
                type: 'string',
                description: 'Texto completo do documento corrigido',
              },
              metrics: {
                type: 'object',
                properties: {
                  issuesApplied: { type: 'integer' },
                  issuesSkipped: {
                    type: 'integer',
                    description: 'Patches cujo trecho_exato nao foi encontrado',
                  },
                },
              },
              appliedIssueIds: { type: 'array', items: { type: 'string' } },
              skippedIssueIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      AnalysisSummary: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          userId: { type: 'string' },
          fileName: { type: 'string', nullable: true, example: 'Contrato_Agencia.pdf' },
          fileExtension: { type: 'string', nullable: true, example: '.pdf' },
          analysisType: { type: 'string', enum: ['generate-with-files', 'ask'] },
          status: { type: 'string', enum: ['completed', 'error'] },
          riskLevel: { type: 'string', nullable: true, enum: ['baixo', 'medio', 'alto'] },
          riskScore: { type: 'number', nullable: true, example: 7 },
          model: { type: 'string' },
          costUsd: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AnalysisDetail: {
        allOf: [
          { $ref: '#/components/schemas/AnalysisSummary' },
          {
            type: 'object',
            properties: {
              analysis: { type: 'object', nullable: true },
              rawResponse: { type: 'string' },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              errorMessage: { type: 'string', nullable: true },
            },
          },
        ],
      },
      HistoryPage: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/AnalysisSummary' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          statusCode: { type: 'integer' },
        },
      },

      // ── Billing ────────────────────────────────────────────────────────────
      PlanDefinition: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            enum: ['free', 'basic', 'essential', 'monthly'],
            example: 'essential',
          },
          name: { type: 'string', example: 'Essencial' },
          priceInCents: { type: 'integer', example: 1490 },
          anchorPriceInCents: { type: 'integer', nullable: true, example: 1990 },
          creditAmount: { type: 'integer', example: 10 },
          analysisLimit: { type: 'integer', example: 10 },
          questionLimitPerContract: { type: 'integer', description: '-1 = ilimitado', example: 5 },
          autoFixLimitPerContract: {
            type: 'integer',
            description: '-1 = ilimitado, 0 = bloqueado',
            example: 1,
          },
          isMonthly: { type: 'boolean', example: false },
        },
      },
      BillingStatus: {
        type: 'object',
        properties: {
          planSlug: { type: 'string', example: 'essential' },
          planName: { type: 'string', example: 'Essencial' },
          creditsRemaining: { type: 'integer', example: 7 },
          analysisLimit: { type: 'integer', example: 10 },
          questionLimitPerContract: { type: 'integer', example: 5 },
          autoFixLimitPerContract: { type: 'integer', example: 1 },
          isMonthly: { type: 'boolean', example: false },
          subscriptionStatus: { type: 'string', nullable: true, example: null },
          currentPeriodEnd: { type: 'string', format: 'date-time', nullable: true, example: null },
        },
      },
      RechargeRequest: {
        type: 'object',
        required: ['planSlug'],
        properties: {
          planSlug: {
            type: 'string',
            enum: ['free', 'basic', 'essential', 'monthly'],
            example: 'essential',
          },
        },
      },
      CreditTransaction: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          type: { type: 'string', enum: ['grant', 'consume', 'restore', 'adjustment'] },
          amount: {
            type: 'integer',
            description: 'Positivo = adicionado, negativo = deduzido',
            example: -1,
          },
          balanceAfter: { type: 'integer', example: 6 },
          reason: { type: 'string', example: 'AI analysis completed' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ContractUsage: {
        type: 'object',
        properties: {
          questionsUsed: { type: 'integer', example: 2 },
          questionsRemaining: { type: 'integer', description: '-1 = ilimitado', example: 3 },
          autoFixUsed: { type: 'integer', example: 0 },
          autoFixRemaining: {
            type: 'integer',
            description: '-1 = ilimitado, 0 = bloqueado',
            example: 1,
          },
        },
      },

      // ── AI Costs ───────────────────────────────────────────────────────────
      CostSummary: {
        type: 'object',
        properties: {
          period: {
            type: 'object',
            properties: {
              from: { type: 'string', nullable: true, example: '2025-01-01' },
              to: { type: 'string', nullable: true, example: '2025-12-31' },
            },
          },
          usdToBrlRate: { type: 'number', example: 5.9 },
          requests: { type: 'integer', example: 42 },
          inputTokens: { type: 'integer', example: 158400 },
          outputTokens: { type: 'integer', example: 52200 },
          totalTokens: { type: 'integer', example: 210600 },
          costUsd: { type: 'number', example: 0.03159 },
          costBrl: { type: 'number', example: 0.186381 },
          avgCostPerRequestUsd: { type: 'number', example: 0.000752 },
          avgCostPerRequestBrl: { type: 'number', example: 0.004437 },
          byModel: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                model: { type: 'string', example: 'claude-haiku-4-5' },
                requests: { type: 'integer' },
                inputTokens: { type: 'integer' },
                outputTokens: { type: 'integer' },
                costUsd: { type: 'number' },
                costBrl: { type: 'number' },
              },
            },
          },
          byType: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'generate-with-files' },
                requests: { type: 'integer' },
                costUsd: { type: 'number' },
                costBrl: { type: 'number' },
              },
            },
          },
        },
      },
      PeriodBreakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            period: { type: 'string', example: '2025-05-10' },
            label: { type: 'string', example: '10 mai 2025' },
            requests: { type: 'integer' },
            inputTokens: { type: 'integer' },
            outputTokens: { type: 'integer' },
            costUsd: { type: 'number' },
            costBrl: { type: 'number' },
          },
        },
      },
      RequestsPage: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                analysisType: { type: 'string' },
                status: { type: 'string' },
                fileName: { type: 'string', nullable: true },
                aiModel: { type: 'string' },
                inputTokens: { type: 'integer' },
                outputTokens: { type: 'integer' },
                costUsd: { type: 'number' },
                costBrl: { type: 'number' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
          usdToBrlRate: { type: 'number' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: [],
        responses: { '200': { description: 'API operacional' } },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Cadastrar usuario (primeiro vira admin)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Usuario criado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '409': {
            description: 'Email ja cadastrado',
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
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Tokens JWT',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': {
            description: 'Credenciais invalidas',
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
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Novo par de tokens',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': {
            description: 'Refresh token invalido',
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
        summary: 'Logout',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LogoutRequest' } },
          },
        },
        responses: { '200': { description: 'Logout realizado' } },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Perfil do usuario autenticado (email + role)',
        responses: {
          '200': {
            description: 'Perfil',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/auth/promote/{userId}': {
      patch: {
        tags: ['Auth - Admin'],
        summary: 'Alterar role de um usuario (admin only)',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PromoteRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Role atualizado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Usuario nao encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai/generate': {
      post: {
        tags: ['AI'],
        summary: 'Prompt livre com contexto opcional',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/GenerateRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Resposta gerada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
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
        summary: 'Analise completa de arquivo(s) — salva no historico e cria DocumentRecord',
        description:
          'Analisa o contrato e retorna a analise estruturada (problemas, sugestoes, risco). ' +
          'Tambem cria um **DocumentRecord** com o texto original e retorna `documentId` e `analysisId`, ' +
          'necessarios para gerar e aplicar patches em `/api/v1/document-analysis`.',
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
                    description: 'PDF, DOCX ou TXT (max 10 MB)',
                  },
                  contractText: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Analise estruturada + documentId + analysisId',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateWithFilesResponse' },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
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
        summary: 'Pergunta livre sobre arquivo - salva no historico',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  files: { type: 'array', items: { type: 'string', format: 'binary' } },
                  question: { type: 'string', example: 'Quais sao as clausulas de rescisao?' },
                  contractText: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Resposta a pergunta',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerateResponse' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/history': {
      get: {
        tags: ['History'],
        summary: 'Listar historico do usuario autenticado',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Lista paginada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HistoryPage' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/history/{id}': {
      get: {
        tags: ['History'],
        summary: 'Detalhes completos de uma analise',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Analise detalhada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/AnalysisDetail' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Analise nao encontrada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/document-analysis/generate-patches': {
      post: {
        tags: ['Document Analysis'],
        summary: 'Gerar patches cirurgicos a partir de uma analise existente',
        description:
          'Usa os `problemas` e `sugestoes` da analise ja realizada em `/ai/generate-with-files` ' +
          'para localizar trechos exatos no documento original e gerar rewrites pontuais. ' +
          'Faz apenas **uma chamada barata** a IA (sem re-analisar o documento). ' +
          'Chamadas subsequentes com os mesmos IDs retornam do cache sem custo.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/GeneratePatchesRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Lista de patches para revisao',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GeneratePatchesResponse' },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Document ou Analysis nao encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '422': {
            description: 'Analysis nao possui dados estruturados',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/document-analysis/correct/{documentId}': {
      post: {
        tags: ['Document Analysis'],
        summary: 'Aplicar patches e obter documento corrigido',
        description:
          'Aplica os patches selecionados (ou todos) ao texto original do documento ' +
          'e retorna o texto corrigido. Apenas trechos com `trecho_exato` encontrado verbatim sao substituidos.',
        parameters: [
          {
            name: 'documentId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Retornado por /ai/generate-with-files',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CorrectDocumentRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Documento corrigido',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CorrectDocumentResponse' },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Documento nao encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/document-analysis/{documentId}/download': {
      get: {
        tags: ['Document Analysis'],
        summary: 'Baixar documento corrigido como arquivo .txt',
        description:
          'Aplica os patches ao texto original e devolve o arquivo pronto para download. ' +
          'Passe `issueIds` como query param separados por virgula para aplicar apenas patches especificos; ' +
          'omita para aplicar todos. O nome do arquivo e derivado do upload original.',
        parameters: [
          {
            name: 'documentId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'issueIds',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'IDs dos patches separados por virgula. Ex: id1,id2,id3',
            example: '6634a1b2c3d4e5f6a7b8c9d2,6634a1b2c3d4e5f6a7b8c9d3',
          },
        ],
        responses: {
          '200': {
            description: 'Arquivo .txt com o documento corrigido',
            headers: {
              'Content-Disposition': {
                schema: {
                  type: 'string',
                  example: 'attachment; filename="contrato-corrigido.txt"',
                },
              },
            },
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Documento nao encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/document-analysis/{documentId}/issues': {
      get: {
        tags: ['Document Analysis'],
        summary: 'Listar todos os patches de um documento',
        parameters: [
          {
            name: 'documentId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Retornado por /ai/generate-with-files',
          },
        ],
        responses: {
          '200': {
            description: 'Lista de patches',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GeneratePatchesResponse' },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Documento nao encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/history/admin/all': {
      get: {
        tags: ['History - Admin'],
        summary: 'Listar analises de TODOS os usuarios (admin only)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          {
            name: 'userId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtrar por userId especifico',
          },
        ],
        responses: {
          '200': {
            description: 'Lista de todas as analises',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HistoryPage' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    // ── Billing ──────────────────────────────────────────────────────────────
    '/api/v1/billing/plans': {
      get: {
        tags: ['Billing'],
        summary: 'Listar todos os planos ativos',
        security: [],
        responses: {
          '200': {
            description: 'Lista de planos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/PlanDefinition' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/billing/status': {
      get: {
        tags: ['Billing'],
        summary: 'Status de billing do usuario autenticado (plano + creditos)',
        responses: {
          '200': {
            description: 'Status atual do billing',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/BillingStatus' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/billing/recharge': {
      post: {
        tags: ['Billing'],
        summary: 'Aplicar um plano imediatamente (sem pagamento)',
        description:
          'Endpoint de teste/desenvolvimento. Aplica qualquer plano ao usuario autenticado ' +
          'e recarrega os creditos conforme o plano escolhido.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RechargeRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Plano aplicado — retorna o novo BillingStatus',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string', example: 'Plano "essential" aplicado com sucesso' },
                    data: { $ref: '#/components/schemas/BillingStatus' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'planSlug invalido',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/billing/history': {
      get: {
        tags: ['Billing'],
        summary: 'Historico de transacoes de creditos',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
        ],
        responses: {
          '200': {
            description: 'Transacoes paginadas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        transactions: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/CreditTransaction' },
                        },
                        total: { type: 'integer' },
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/billing/contract-usage/{documentId}': {
      get: {
        tags: ['Billing'],
        summary: 'Uso por contrato (perguntas e autocorrecao)',
        parameters: [
          {
            name: 'documentId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'DocumentRecord ID retornado por /ai/generate-with-files',
          },
        ],
        responses: {
          '200': {
            description: 'Contadores de uso do contrato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/ContractUsage' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    // ── AI Costs (user) ───────────────────────────────────────────────────────
    '/api/v1/ai-costs/summary': {
      get: {
        tags: ['AI Costs'],
        summary: 'Resumo de custo do usuario autenticado',
        parameters: [
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', format: 'date' },
            description: 'Data inicial (ISO)',
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date' },
            description: 'Data final (ISO, inclusiva)',
          },
        ],
        responses: {
          '200': {
            description: 'Resumo de custos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/CostSummary' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/requests': {
      get: {
        tags: ['AI Costs'],
        summary: 'Lista paginada de requisicoes do usuario',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Requisicoes paginadas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RequestsPage' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/daily': {
      get: {
        tags: ['AI Costs'],
        summary: 'Breakdown diario de custos do usuario',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown diario',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/weekly': {
      get: {
        tags: ['AI Costs'],
        summary: 'Breakdown semanal de custos do usuario',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown semanal',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/monthly': {
      get: {
        tags: ['AI Costs'],
        summary: 'Breakdown mensal de custos do usuario',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown mensal',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    // ── AI Costs (admin) ──────────────────────────────────────────────────────
    '/api/v1/ai-costs/admin/summary': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Resumo global de custos (todos os usuarios)',
        parameters: [
          {
            name: 'userId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filtrar por usuario especifico',
          },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Resumo global',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/CostSummary' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/admin/requests': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Todas as requisicoes paginadas (admin)',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Requisicoes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/RequestsPage' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/admin/daily': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Breakdown diario global (admin)',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown diario',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/admin/weekly': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Breakdown semanal global (admin)',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown semanal',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/admin/monthly': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Breakdown mensal global (admin)',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'America/Sao_Paulo' },
          },
        ],
        responses: {
          '200': {
            description: 'Breakdown mensal',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/PeriodBreakdown' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/ai-costs/admin/by-user': {
      get: {
        tags: ['AI Costs - Admin'],
        summary: 'Ranking de custo por usuario (admin)',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Custo por usuario ordenado decrescente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          userId: { type: 'string' },
                          email: { type: 'string' },
                          requests: { type: 'integer' },
                          costUsd: { type: 'number' },
                          costBrl: { type: 'number' },
                          lastRequestAt: { type: 'string', format: 'date-time', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Nao autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '403': {
            description: 'Permissao negada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
  },
} as const;
