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
            <li>Recibes un comprobante; pagas el TAG en administración y Sistemas lo instala.</li>
          </ol>
          <Link href="/registro/" className="primary-action" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Iniciar registro
          </Link>
        </div>

        <div className="panel">
          <p className="panel-title">¿Ya tienes TAG?</p>
          <p style={{ margin: "0 0 12px", color: "var(--ink)" }}>
            Solicita una actualización de datos (placas, vehículo, reposición) o la baja de tu registro.
          </p>
          <Link href="/solicitudes/" className="link-action">Solicitar actualización o baja →</Link>
        </div>

        <p style={{ marginTop: 16, textAlign: "right" }}>
          <Link href="/admin/" className="link-action">Acceso del personal →</Link>
        </p>
      </section>
    </main>
  );
}
