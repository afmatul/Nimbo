import type { ReactNode } from 'react';

import { LegalDocument } from '../../../features/identity/components/legal-document';
import { PrivacyV1 } from '../../../features/identity/components/privacy-v1';

export default function PrivacidadPage(): ReactNode {
  return (
    <LegalDocument kind="privacy">
      <PrivacyV1 />
    </LegalDocument>
  );
}
