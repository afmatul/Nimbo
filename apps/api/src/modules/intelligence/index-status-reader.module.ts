import { Module } from '@nestjs/common';

import {
  EXTRACTOR_PROVIDERS,
  ghostscriptConfigProvider,
} from './infrastructure/extractors/extractors.providers';
import { SqlIndexStatusReader } from './infrastructure/persistence/sql-index-status.reader';

/**
 * El lector del estado de indexación que el explorador de `storage` muestra (`IIndexStatusReader`). Trae su propio
 * `ExtractorRegistry` (la única fuente de «qué es indexable»; el `api` solo pregunta `supports(kind)`, sin Ghostscript)
 * para que la raíz lo enlace sin depender de la instancia de `IntelligenceModule`. `TransactionContext` llega de
 * `SharedModule` (global).
 */
@Module({
  providers: [...EXTRACTOR_PROVIDERS, ghostscriptConfigProvider(null), SqlIndexStatusReader],
  exports: [SqlIndexStatusReader],
})
export class IndexStatusReaderModule {}
