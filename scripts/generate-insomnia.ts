/**
 * scripts/generate-insomnia.ts
 *
 * Auto-generates and syncs the Insomnia collection from route files.
 *
 * Comportamento:
 *  - Parseia src/modules/**\/*.routes.ts via regex para descobrir endpoints
 *  - Faz merge inteligente com a collection existente:
 *      · Rotas existentes → preservadas sem alteração (descrição, body, headers, etc.)
 *      · Rotas novas      → skeleton entry adicionado automaticamente
 *      · Entradas extras  → preservadas (error cases, pastas customizadas, etc.)
 *  - Escreve em: ./insomnia-collection.json (workspace)
 *  - Copia para: diretório de dados do Insomnia (sincroniza automaticamente)
 *
 * Uso:
 *   npm run generate:insomnia          ← manual
 *   git commit ...                     ← automático via .githooks/pre-commit
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_COLLECTION = path.join(ROOT, 'insomnia-collection.json');
const INSOMNIA_APP_COLLECTION =
  'C:\\Users\\gabri\\AppData\\Roaming\\Insomnia\\version-control\\git\\git_c082853cbbc0444ca43ae82ce46c71f8\\other\\insomnia-collection.json';
const MODULES_DIR = path.join(ROOT, 'src', 'modules');

// ── Module config — deve espelhar src/app.ts ──────────────────────────────────

interface ModuleConfig {
  /** Prefixo registrado em app.use() */
  prefix: string;
  /** _id da pasta correspondente na collection */
  folderId: string;
  /** Nome exibido na pasta */
  folderName: string;
  /** Ordem de exibição */
  sortKey: number;
}

/**
 * Adicione aqui sempre que um novo módulo for registrado em app.ts.
 * Chave = nome da pasta em src/modules/.
 */
const MODULES: Record<string, ModuleConfig> = {
  auth: { prefix: '/api/v1/auth', folderId: 'fld_auth', folderName: '🔐 Auth', sortKey: 2 },
  ai: { prefix: '/api/v1/ai', folderId: 'fld_ai', folderName: '🤖 AI', sortKey: 4 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InsomniaResource = Record<string, any>;

interface InsomniaCollection {
  _type: string;
  __export_format: number;
  __export_date: string;
  __export_source: string;
  resources: InsomniaResource[];
}

interface DiscoveredRoute {
  method: string; // GET, POST, PUT, PATCH, DELETE
  fullPath: string; // /api/v1/auth/register
  subPath: string; // /register
  module: string; // auth, ai
}

// ── Route discovery ───────────────────────────────────────────────────────────

/**
 * Parseia todos os arquivos *.routes.ts via regex para extrair endpoints.
 * Regex cobre: router.get('/path', ...) e authRouter.post('/path', ...)
 */
function discoverRoutes(): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  for (const [moduleName, config] of Object.entries(MODULES)) {
    const routeFile = path.join(MODULES_DIR, moduleName, `${moduleName}.routes.ts`);
    if (!fs.existsSync(routeFile)) {
      console.warn(`  ⚠️  Route file not found: ${routeFile}`);
      continue;
    }

    const content = fs.readFileSync(routeFile, 'utf8');

    // Captura: <qualquerCoisa>.get('/path', ou "path", ou `path`
    const routeRegex = /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match: RegExpExecArray | null;

    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const subPath = match[2];

      // Ignora sub-routers internos (caminhos que não começam com /)
      if (!subPath.startsWith('/')) continue;

      routes.push({
        method,
        fullPath: config.prefix + subPath,
        subPath,
        module: moduleName,
      });
    }
  }

  return routes;
}

// ── ID generation ─────────────────────────────────────────────────────────────

/** Gera um _id determinístico e estável para um request baseado em method + path */
function routeToRequestId(method: string, fullPath: string): string {
  const sanitized = fullPath
    .replace(/^\//, '') // remove leading /
    .replace(/\//g, '_') // / → _
    .replace(/[^a-z0-9_]/gi, ''); // remove chars inválidos
  return `req_auto_${method.toLowerCase()}_${sanitized}`;
}

// ── Skeleton builder ──────────────────────────────────────────────────────────

function buildSkeletonRequest(
  route: DiscoveredRoute,
  folderId: string,
  sortKey: number,
): InsomniaResource {
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(route.method);
  const headers: { name: string; value: string }[] = [
    { name: 'Accept', value: 'application/json' },
  ];
  if (hasBody) headers.unshift({ name: 'Content-Type', value: 'application/json' });

  return {
    _id: routeToRequestId(route.method, route.fullPath),
    _type: 'request',
    parentId: folderId,
    name: `${route.method} ${route.subPath}`,
    method: route.method,
    url: `{{ _.base_url }}${route.fullPath}`,
    headers,
    body: hasBody ? { mimeType: 'application/json', text: '{}' } : {},
    description: `[Auto-gerado] ${route.method} ${route.fullPath}\n\nStatus esperado: 200 OK`,
    metaSortKey: sortKey,
  };
}

// ── Merge logic ───────────────────────────────────────────────────────────────

/**
 * Estratégia de merge:
 * 1. Recursos não-request (workspace, env, pastas) → preservados
 * 2. Pastas de módulos ausentes → criadas
 * 3. Rotas descobertas que JÁ existem na collection → preservadas sem mudança
 * 4. Rotas descobertas que NÃO existem → skeleton adicionado
 * 5. Requests na collection que não são rotas descobertas → preservados (error cases, etc.)
 */
function mergeCollection(
  discovered: DiscoveredRoute[],
  existing: InsomniaCollection,
): InsomniaResource[] {
  // ── 1. Indexar requests existentes por method:path ──────────────────────────
  const existingRequests = existing.resources.filter(r => r._type === 'request');
  const existingByKey = new Map<string, InsomniaResource>();

  for (const req of existingRequests) {
    const urlPath = String(req.url ?? '').replace('{{ _.base_url }}', '');
    const key = `${req.method}:${urlPath}`;
    existingByKey.set(key, req);
  }

  // ── 2. Base: recursos não-request (workspace, env, pastas) ─────────────────
  const baseResources = existing.resources.filter(r => r._type !== 'request');

  // ── 3. Garantir que pastas dos módulos existem ─────────────────────────────
  const existingFolderIds = new Set(
    baseResources.filter(r => r._type === 'request_group').map(r => String(r._id)),
  );

  for (const [, mod] of Object.entries(MODULES)) {
    if (!existingFolderIds.has(mod.folderId)) {
      console.log(`  [+] Nova pasta criada: ${mod.folderName}`);
      baseResources.push({
        _id: mod.folderId,
        _type: 'request_group',
        parentId: 'wrk_backend_api',
        name: mod.folderName,
        description: `Endpoints do módulo ${mod.folderName}`,
        environment: {},
        metaSortKey: mod.sortKey,
      });
    }
  }

  // ── 4. Processar rotas descobertas ─────────────────────────────────────────
  const handledKeys = new Set<string>();
  const managedRequests: InsomniaResource[] = [];
  const sortCounters: Record<string, number> = {};

  for (const route of discovered) {
    const mod = MODULES[route.module];
    if (!mod) continue;

    const key = `${route.method}:${route.fullPath}`;
    sortCounters[route.module] = (sortCounters[route.module] ?? 0) + 1;
    handledKeys.add(key);

    if (existingByKey.has(key)) {
      // Rota já existe — preservar completamente
      managedRequests.push(existingByKey.get(key)!);
    } else {
      // Rota nova — adicionar skeleton
      console.log(`  [+] Nova rota detectada: ${route.method} ${route.fullPath}`);
      managedRequests.push(buildSkeletonRequest(route, mod.folderId, sortCounters[route.module]));
    }
  }

  // ── 5. Preservar requests não gerenciados (error cases, etc.) ──────────────
  const unmanagedRequests: InsomniaResource[] = [];
  for (const req of existingRequests) {
    const urlPath = String(req.url ?? '').replace('{{ _.base_url }}', '');
    const key = `${req.method}:${urlPath}`;
    if (!handledKeys.has(key)) {
      unmanagedRequests.push(req);
    }
  }

  return [...baseResources, ...managedRequests, ...unmanagedRequests];
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('\n🔄 Gerando Insomnia collection...\n');

  // Carregar collection existente
  if (!fs.existsSync(WORKSPACE_COLLECTION)) {
    console.error(`❌ Collection não encontrada: ${WORKSPACE_COLLECTION}`);
    process.exit(1);
  }

  const existing = JSON.parse(fs.readFileSync(WORKSPACE_COLLECTION, 'utf8')) as InsomniaCollection;

  // Descobrir rotas
  const discovered = discoverRoutes();
  console.log(`  Rotas descobertas: ${discovered.length}`);
  for (const r of discovered) {
    console.log(`    ${r.method.padEnd(6)} ${r.fullPath}`);
  }
  console.log();

  // Fazer merge
  const resources = mergeCollection(discovered, existing);

  const output: InsomniaCollection = {
    _type: existing._type,
    __export_format: existing.__export_format,
    __export_date: new Date().toISOString(),
    __export_source: 'compliance-back/scripts/generate-insomnia.ts',
    resources,
  };

  const json = JSON.stringify(output, null, 2);

  // Escrever no workspace
  fs.writeFileSync(WORKSPACE_COLLECTION, json, 'utf8');
  console.log(`  ✅ Workspace: ${WORKSPACE_COLLECTION}`);

  // Copiar para o Insomnia
  const insomniaDir = path.dirname(INSOMNIA_APP_COLLECTION);
  if (fs.existsSync(insomniaDir)) {
    fs.writeFileSync(INSOMNIA_APP_COLLECTION, json, 'utf8');
    console.log(`  ✅ Insomnia:  ${INSOMNIA_APP_COLLECTION}`);
  } else {
    console.warn(`  ⚠️  Diretório do Insomnia não encontrado — apenas workspace atualizado`);
    console.warn(`     Esperado: ${insomniaDir}`);
  }

  console.log('\n✨ Collection atualizada!\n');
}

main();
