import { configure } from '@testing-library/react';
import type * as ReactTypes from 'react';

/**
 * `pnpm test` en la raíz corre las suites de `api` y `web` a la vez; con esa carga, 1 s de `findBy*`/`waitFor` no
 * alcanza para que una vista con efectos llegue a su estado (p. ej. `reset-password-view`). Solo alarga la espera
 * de lo que sí aparece: una aserción que nunca se cumple sigue fallando.
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * `next/link` navega con el router de la app, que en jsdom no está montado: un clic en un enlace lanzaría. Las
 * pruebas comprueban el destino (`href`) y lo que el clic provoca en la página, no la navegación de Next.
 */
jest.mock('next/link', () => {
  const React = jest.requireActual<typeof ReactTypes>('react');
  const MockLink = React.forwardRef<HTMLAnchorElement, ReactTypes.ComponentProps<'a'>>(
    function MockLink(props, ref) {
      return React.createElement('a', { ref, ...props });
    },
  );
  return { __esModule: true, default: MockLink };
});
