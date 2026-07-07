import Link from "next/link";

export default function Inicio() {
  return (
    <main className="page-shell">
      <section className="survey-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Registro de acceso vehicular</h1>
          <p>
            Da de alta tu vehículo para obtener el TAG de acceso al estacionamiento del Instituto
            Asunción de Querétaro. El trámite toma unos minutos.
          </p>
        </header>

        <div className="panel">
          <p className="panel-title">¿Cómo funciona?</p>
          <ol style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--ink)" }}>
            <li>Capturas tus datos y los de tu vehículo.</li>
            <li>Lees y <strong>firmas</strong> el reglamento de acceso.</li>
            <li>Recibes un comprobante; administración asigna estacionamiento y cobra el TAG.</li>
          </ol>
          <Link href="/registro/" className="primary-action" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Iniciar registro
          </Link>
        </div>

        <div className="notice">
          <strong>Aviso de privacidad.</strong> Los datos que proporciones (nombre, vehículo y placas)
          se usan únicamente para gestionar el acceso vehicular al plantel, conforme a la LFPDPPP. No se
          comparten con terceros. <em>(Texto legal completo pendiente.)</em>
        </div>

        <p style={{ marginTop: 16, textAlign: "right" }}>
          <Link href="/admin/" className="link-action">Acceso del personal →</Link>
        </p>
      </section>
    </main>
  );
}
