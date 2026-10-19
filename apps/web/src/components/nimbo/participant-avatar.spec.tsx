import { renderToStaticMarkup } from 'react-dom/server';

import { initialsOf, ParticipantAvatar, participantRing } from './participant-avatar';

const RAW_COLOR = /#[0-9a-f]{3,8}\b|\[[^\]]*\]/i;

describe('ParticipantAvatar (016, DF-46)', () => {
  it('CA-6: muestra las iniciales del nombre y se oculta a los lectores (el nombre va al lado)', () => {
    const markup = renderToStaticMarkup(<ParticipantAvatar userId="u-1" name="Lucía Barrios" />);

    expect(markup).toContain('>LB<');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('el color es determinista por cuenta y sale de los tokens, sin colores escritos a mano', () => {
    const markup = renderToStaticMarkup(<ParticipantAvatar userId="u-2" name="Mario Gómez" />);

    expect(participantRing('u-2')).toBe(participantRing('u-2'));
    expect(markup).toContain(participantRing('u-2'));
    expect(markup).not.toMatch(RAW_COLOR);
  });

  it('quien solo ve lleva el anillo neutro', () => {
    const markup = renderToStaticMarkup(
      <ParticipantAvatar userId="u-3" name="Diego Morales" viewer />,
    );

    expect(markup).toContain('ring-input');
  });

  it('las iniciales toman las dos primeras palabras', () => {
    expect(initialsOf('ana  maría  de león')).toBe('AM');
    expect(initialsOf('Diego')).toBe('D');
  });
});
