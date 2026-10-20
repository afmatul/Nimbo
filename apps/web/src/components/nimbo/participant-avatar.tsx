import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Anillos de participante (DF-46, mockup `editing/editor`): los tonos de la secuencia que ya son tokens. El color nunca
 * identifica solo: el nombre y el rol van siempre en texto al lado.
 */
const PARTICIPANT_RINGS = [
  'ring-brand',
  'ring-live',
  'ring-success',
  'ring-warning',
  'ring-destructive-soft',
] as const;

/** Quien solo ve lleva un anillo neutro. */
const VIEWER_RING = 'ring-input';

/** Color determinista por cuenta: el mismo en cada pantalla y para cada participante. */
export function participantRing(userId: string): (typeof PARTICIPANT_RINGS)[number] {
  const hash = Array.from(userId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PARTICIPANT_RINGS[hash % PARTICIPANT_RINGS.length] ?? PARTICIPANT_RINGS[0];
}

/** Iniciales de las dos primeras palabras del nombre visible. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export interface ParticipantAvatarProps {
  readonly userId: string;
  readonly name: string;
  /** Solo ve: anillo neutro (no cuenta para el límite). */
  readonly viewer?: boolean;
}

/**
 * Avatar de participante (RF-26): iniciales en `foreground` sobre `card` con el anillo de su color. Es decorativo: el
 * nombre visible va al lado, así que se oculta a los lectores de pantalla.
 */
export function ParticipantAvatar({
  userId,
  name,
  viewer = false,
}: ParticipantAvatarProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground ring-2',
        viewer ? VIEWER_RING : participantRing(userId),
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
