import { Global, Module } from '@nestjs/common';

import { SqlContentMatchReader } from './modules/intelligence';
import { I_CONTENT_MATCH_READER } from './modules/storage';

/**
 * Raíz de composición del puerto de coincidencia por contenido (spec 018b D-1, DF-95). `storage` lo declara y no
 * conoce a `intelligence` (que ya depende de `storage`), así que el enlace vive aquí y es global para que la búsqueda
 * de `StorageModule` lo resuelva. Solo el `api`: el `worker` no monta la búsqueda.
 */
@Global()
@Module({
  providers: [{ provide: I_CONTENT_MATCH_READER, useClass: SqlContentMatchReader }],
  exports: [I_CONTENT_MATCH_READER],
})
export class ContentMatchBindingModule {}
