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
            Dé de alta su vehículo para obtener el TAG de acceso al estacionamiento del Instituto
            Asunción de Querétaro. El trámite toma unos minutos.
          </p>
        </header>

        <div className="panel">
          <p className="panel-title">¿Cómo funciona?</p>
          <ol style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--ink)" }}>
            <li>Captura sus datos y los de su vehículo.</li>
            <li>Lee y <strong>firma</strong> el reglamento de acceso.</li>
            <li>Recibe un comprobante; paga el TAG en administración y Sistemas lo instala.</li>
          </ol>
          <Link href="/registro/" className="primary-action" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Iniciar registro
          </Link>
        </div>

        <div className="panel">
          <p className="panel-title">¿Ya tiene TAG?</p>
          <p style={{ margin: "0 0 12px", color: "var(--ink)" }}>
            Solicite una actualización de datos (placas, vehículo, reposición) o la baja de su registro.
          </p>
          <Link href="/solicitudes/" className="link-action">Solicitar actualización o baja →</Link>
        </div>

        <p style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link href="/aviso-de-privacidad/" className="link-action">Aviso de privacidad</Link>
          <Link href="/admin/" className="link-action">Acceso del personal →</Link>
        </p>
      </section>
    </main>
  );
}
