import type { ReactNode } from 'react';

/** Texto final de la Política, versión 1 (plan §6.13), sin los puntos dobles de los apartados 7 y 8. */
export function PrivacyV1(): ReactNode {
  return (
    <>
      <p>
        <strong>Nimbo es un proyecto académico</strong> del curso Ingeniería de Software I de la{' '}
        <strong>Universidad Rafael Landívar</strong> (Guatemala, 2026). No es un servicio comercial ni un
        contrato de servicio, y no afirma cumplir ninguna ley ni tener ninguna certificación.
      </p>
      <p>
        <strong>Lo esencial.</strong> Tus datos no se venden ni se usan para publicidad. Nadie del equipo
        interno ve el contenido de tus archivos. Los pagos son simulados. Todos los datos se borran a
        finales de noviembre de 2026.
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          <strong>Quién es responsable.</strong> Adrián Matul (
          <a href="mailto:amatultab@gmail.com">amatultab@gmail.com</a>), para dudas, para ejercer tus
          derechos sobre tus datos o para pedir que se borren.
        </li>
        <li>
          <strong>Qué datos se guardan.</strong> Al registrarte: tu nombre completo y tu correo; tu
          contraseña, <strong>solo como hash con Argon2id</strong>; la fecha y la versión de los Términos y
          de esta Política que aceptaste. El plan que eliges al registrarte se guarda{' '}
          <strong>solo en tu navegador</strong>, no en Nimbo. Mientras usas Nimbo: tus archivos y carpetas
          y sus metadatos; las versiones y quién participó; con quién compartes y los enlaces públicos; las
          preguntas al agente; tus datos de facturación simulada. Para proteger el servicio: la dirección
          IP y bitácoras que <strong>nunca contienen el contenido de tus archivos, tus contraseñas ni tus tokens</strong>.
        </li>
        <li>
          <strong>Para qué se usan.</strong> Para prestarte el servicio; verificar tu correo; proteger tu
          cuenta; mostrarte cuánto de tu cuota usas; y operar el sistema y corregir errores.
        </li>
        <li>
          <strong>Con quién se comparten.</strong> Con los proveedores que hacen funcionar el servicio:
          DigitalOcean, Resend y Google Gemini. Tus datos no se venden ni se usan para publicidad.
        </li>
        <li>
          <strong>Qué ve el equipo interno.</strong> Administración, Soporte y Operación{' '}
          <strong>nunca acceden al contenido de tus archivos ni a sus vistas previas</strong>.
        </li>
        <li>
          <strong>Cómo se protegen.</strong> La comunicación va cifrada (TLS); las contraseñas y los
          enlaces de un solo uso se guardan solo como hash; cada cuenta está aislada.
        </li>
        <li>
          <strong>Cuánto tiempo se guardan.</strong> Lo que envías a la papelera y las versiones anteriores
          de tus archivos se guardan el tiempo que indica tu plan, visible en la página de planes. Todo lo
          demás, hasta que elimines tu cuenta o hasta el borrado de finales de noviembre de 2026, lo que
          ocurra primero.
        </li>
        <li>
          <strong>Cookies y almacenamiento del navegador.</strong> Nimbo usa solo lo necesario: una cookie
          para mantener tu sesión, otra para reconocer tu navegador y avisarte si alguien entra desde uno
          nuevo, y el almacenamiento local del navegador para recordar el plan que elegiste al registrarte.
          No hay cookies de publicidad ni de análisis de terceros.
        </li>
        <li>
          <strong>Eliminar tu cuenta y tus datos.</strong> Escribe a{' '}
          <a href="mailto:amatultab@gmail.com">amatultab@gmail.com</a> desde el correo con el que te
          registraste. Al terminar el proyecto se borran todos los datos a finales de noviembre de 2026.
        </li>
        <li>
          <strong>Edad mínima.</strong> Nimbo es solo para personas de <strong>18 años o más</strong>.
        </li>
        <li>
          <strong>Cambios a esta Política.</strong> Si cambia, se publica una versión nueva con su número y
          su fecha en esta misma página.
        </li>
      </ol>
    </>
  );
}
