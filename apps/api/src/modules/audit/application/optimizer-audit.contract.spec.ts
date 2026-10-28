import { sanitizeAttributes } from '../domain/attribute-sanitizer';

import { isAuditAction } from './audit-action';
import type { AuditAction } from './audit-action';
import { AUDIT_CATALOG } from './audit-catalog';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const BASE = { optimizationId: ID, sourceVersionId: ID, originalBytes: 4_800_000 };
const CASES = [
  ['file.optimized', { ...BASE, versionId: ID, resultBytes: 2_000_000 }],
  ['file.optimization_discarded', { ...BASE, resultBytes: 4_700_000, reason: 'ahorro_minimo' }],
  ['file.optimization_failed', { ...BASE, reason: 'integridad' }],
] as const;

describe('021 CA-21: contrato cerrado de auditoría del optimizador', () => {
  it.each(CASES)('%s admite exactamente los atributos aprobados', (name, attributes) => {
    expect(isAuditAction(name)).toBe(true);
    const spec = AUDIT_CATALOG[name as AuditAction];
    expect(spec?.resourceType).toBe('file');
    expect(Object.keys(spec.attributes).sort()).toEqual(
      [
        ...Object.keys(BASE),
        'resultBytes',
        name === 'file.optimized' ? 'versionId' : 'reason',
      ].sort(),
    );
    expect(sanitizeAttributes(spec?.attributes ?? {}, attributes)).toEqual({
      attributes,
      rejections: [],
    });
  });

  it.each(CASES)(
    '%s descarta extras y valores sensibles incluso bajo claves permitidas',
    (name) => {
      const leaked = {
        fileName: 'secreto.png',
        originalName: 'original.png',
        objectKey: 'u/secreto',
        url: 'https://secreto/?signature=secreto',
        tempPath: 'C:\\temp\\secreto',
        content: 'contenido secreto',
        mime: 'image/png',
        message: 'error secreto',
        stack: 'stack secreto',
        optimizationId: 'https://secreto',
        sourceVersionId: 'ruta/secreta',
        originalBytes: 'secreto',
        resultBytes: 'secreto',
        reason: 'error secreto',
        versionId: 'secreto',
      };
      const spec = AUDIT_CATALOG[name as AuditAction];
      const result = sanitizeAttributes(spec?.attributes ?? {}, leaked);
      expect(result.attributes).toEqual({});
      expect(result.rejections).toHaveLength(Object.keys(leaked).length);
    },
  );
});
