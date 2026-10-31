import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema } from '@nimbo/contracts';
import type { SearchQuery, SearchResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { storageQueryValidationError } from '../../presentation/storage-validation';
import { SearchService } from '../application/search.service';

/**
 * Búsqueda por nombre, tipo y fecha (spec 018, DF-15). Solo `CLIENT`: los roles internos reciben `403` antes del
 * servicio (CA-14). Un `400` lleva los motivos, nunca el texto buscado (CA-15).
 */
@Roles(Role.CLIENT)
@Controller('search')
export class SearchController {
  constructor(private readonly searches: SearchService) {}

  @Get()
  search(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(searchQuerySchema, storageQueryValidationError))
    query: SearchQuery,
  ): Promise<SearchResponse> {
    return this.searches.search(actor, query);
  }
}
