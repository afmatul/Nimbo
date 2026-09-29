import type { ReactNode } from 'react';

/** Texto final de los Términos, versión 1 (plan §6.13). La versión y la fecha las pone `LegalDocument`. */
export function TermsV1(): ReactNode {
  return (
    <>
      <p>
        <strong>Nimbo es un proyecto académico</strong> del curso Ingeniería de Software I de la{' '}
        <strong>Universidad Rafael Landívar</strong> (Guatemala, 2026). No es un servicio comercial
        y estos Términos no son un contrato de servicio.
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          <strong>Qué es Nimbo.</strong> Nimbo es un servicio de almacenamiento en la nube. Te
          permite guardar y compartir archivos, editar documentos .docx en el navegador y hacer
          preguntas sobre tus archivos a un agente. Como es un proyecto académico, Nimbo no afirma
          cumplir ninguna ley ni tener ninguna certificación.
        </li>
        <li>
          <strong>Quién puede usarlo.</strong> Necesitas tener <strong>18 años o más</strong> para
          crear una cuenta; al aceptar estos Términos declaras que los tienes. Cada correo puede
          tener una sola cuenta.
        </li>
        <li>
          <strong>Tu cuenta.</strong> Para activar tu cuenta abres el enlace que te enviamos por
          correo. Ese enlace abre tu sesión y funciona una sola vez durante 24 horas:{' '}
          <strong>no lo reenvíes</strong>. Cuida tu contraseña; nadie de Nimbo te la va a pedir.
        </li>
        <li>
          <strong>Tus archivos.</strong> Tus archivos son tuyos. Nimbo los usa solo para prestarte
          el servicio. El equipo interno (Administración, Soporte y Operación) nunca ve su
          contenido. La Política de privacidad explica qué datos se guardan y con quién se
          comparten.
        </li>
        <li>
          <strong>Uso aceptable.</strong> Te comprometes a no subir contenido ilegal ni contenido
          que infrinja derechos de otras personas, a no intentar entrar a cuentas que no son tuyas y
          a no intentar saltarte los límites de tu plan o de los intentos de acceso.
        </li>
        <li>
          <strong>Planes y pagos simulados.</strong>{' '}
          <strong>Los pagos son simulados: no se cobra dinero real.</strong> Los precios de los
          planes, en quetzales, son parte de la demostración. Toda cuenta nueva empieza en el plan
          gratuito Personal. No escribas los datos de una tarjeta real.
        </li>
        <li>
          <strong>Disponibilidad y copias.</strong> Nimbo se ofrece «tal cual». Puede tener
          interrupciones y, por ser un proyecto académico, puede perder datos.{' '}
          <strong>Guarda siempre una copia de tus archivos importantes</strong> fuera de Nimbo.
        </li>
        <li>
          <strong>Suspensión de cuentas.</strong> Nimbo puede suspender las cuentas que no cumplan
          estos Términos.
        </li>
        <li>
          <strong>Eliminar tu cuenta y fin del proyecto.</strong> Puedes pedir que se elimine tu
          cuenta cuando quieras: escribe a{' '}
          <a href="mailto:amatultab@gmail.com">amatultab@gmail.com</a> desde el correo con el que te
          registraste. Cuando termine el proyecto,{' '}
          <strong>
            todos los datos (cuentas, archivos y bitácoras) se borrarán a finales de noviembre de
            2026
          </strong>
          .
        </li>
        <li>
          <strong>Cambios a estos Términos.</strong> Si cambian, se publica una versión nueva con su
          número y su fecha en esta misma página.
        </li>
        <li>
          <strong>Contacto.</strong> El responsable de Nimbo es <strong>Adrián Matul</strong> (
          <a href="mailto:amatultab@gmail.com">amatultab@gmail.com</a>).
        </li>
      </ol>
    </>
  );
}
