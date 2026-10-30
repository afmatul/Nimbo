import type { SourceLocation } from './source-location';

/**
 * Fragmento recuperado para una pregunta (plan 020 §2): de la versión vigente de un archivo que el actor ve (RN-2),
 * con su procedencia ya rehidratada (`sourceLocationFromJson`). Archivo, versión y ubicación de cada cita salen de
 * aquí, nunca del modelo (D-5, RN-6); al modelo solo viaja `text`. `fileName` (`archivo.nombre`, enmienda de ADR-0036)
 * solo llega al navegador del dueño en la cita: nunca al prompt ni a bitácoras (S-1).
 */
export interface RetrievedFragment {
  readonly id: string;
  readonly fileId: string;
  readonly versionId: string;
  readonly fileName: string;
  readonly text: string;
  readonly location: SourceLocation;
}
