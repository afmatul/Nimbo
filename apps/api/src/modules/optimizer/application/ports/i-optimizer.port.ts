/** Formatos que 021 optimiza (RN-1, recorte del 2026-10-26). */
export type ImageFormat = 'jpeg' | 'png';

/** Lo que se lee de la cabecera de una imagen, sin decodificarla (plan 021 §2). */
export interface ImageInspection {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  /** Píxeles decodificados = ancho × alto (RN-8). */
  readonly pixels: number;
  /** Orientación EXIF (1–8); `null` si no la trae. */
  readonly orientation: number | null;
  readonly hasIccProfile: boolean;
  readonly hasExif: boolean;
  readonly hasAlpha: boolean;
  /** PNG animado (fragmento `acTL`): recomprimirlo perdería los cuadros (RN-1). */
  readonly animated: boolean;
}

/**
 * Recompresión de imágenes (`IOptimizer` del diagrama; plan 021 §2): aísla `sharp`, una tecnología externa (regla (a) de
 * Art. V.2, ADR-0037). Solo el `worker` lo instancia. Una imagen dañada o con otro formato lanza `UnreadableImageError`
 * (→ `no_disponible(ilegible)`); cualquier otro error (tiempo límite incluido) es transitorio y la cola reintenta.
 */
export interface IOptimizer {
  /** Formato, dimensiones, orientación, perfil, alfa y animación, sin decodificar los píxeles. */
  inspect(content: Buffer): Promise<ImageInspection>;
  /** Recomprime en memoria en el mismo formato, con las mismas dimensiones, orientación y perfil, sin rotar. */
  optimize(content: Buffer): Promise<Buffer>;
}

export const I_OPTIMIZER = Symbol('IOptimizer');
