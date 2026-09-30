import { configure } from '@testing-library/react';

/**
 * `pnpm test` en la raíz corre las suites de `api` y `web` a la vez; con esa carga, 1 s de `findBy*`/`waitFor` no
 * alcanza para que una vista con efectos llegue a su estado (p. ej. `reset-password-view`). Solo alarga la espera
 * de lo que sí aparece: una aserción que nunca se cumple sigue fallando.
 */
configure({ asyncUtilTimeout: 5_000 });
