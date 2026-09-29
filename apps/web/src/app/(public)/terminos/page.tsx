import type { ReactNode } from 'react';

import { LegalDocument } from '../../../features/identity/components/legal-document';
import { TermsV1 } from '../../../features/identity/components/terms-v1';

export default function TerminosPage(): ReactNode {
  return (
    <LegalDocument kind="terms">
      <TermsV1 />
    </LegalDocument>
  );
}
