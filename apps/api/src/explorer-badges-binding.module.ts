import { Global, Module } from '@nestjs/common';

import { IndexStatusReaderModule, SqlIndexStatusReader } from './modules/intelligence';
import { SqlSharedNodeReader } from './modules/sharing';
import { I_INDEX_STATUS_READER, I_SHARED_NODE_READER } from './modules/storage';

/**
 * Raíz de composición de los distintivos del explorador: `storage` declara `ISharedNodeReader` e
 * `IIndexStatusReader` y no conoce a `sharing` ni a `intelligence` (que ya dependen de `storage`), así que el enlace
 * vive aquí y es global, como `ContentMatchBindingModule`. Solo el `api`: el `worker` no lista carpetas.
 */
@Global()
@Module({
  imports: [IndexStatusReaderModule],
  providers: [
    { provide: I_SHARED_NODE_READER, useClass: SqlSharedNodeReader },
    { provide: I_INDEX_STATUS_READER, useExisting: SqlIndexStatusReader },
  ],
  exports: [I_SHARED_NODE_READER, I_INDEX_STATUS_READER],
})
export class ExplorerBadgesBindingModule {}
