/**
 * Ámbito de una pregunta (RN-9): todos los archivos accesibles, una carpeta con sus subcarpetas o un archivo. Un
 * ámbito ajeno o inexistente se responde con `AgentScopeNotFoundError` (CA-17).
 */
export type AgentScope =
  { readonly type: 'all' } | { readonly type: 'folder' | 'file'; readonly id: string };
