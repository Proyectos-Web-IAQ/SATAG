# E8 — Hoja de pruebas del 11-sep-2026

> Acompaña al documento «08 - Go-no-go 11-sep y verificacion final» (sección 4). Esta hoja es la
> que se imprime y se reparte a quien va a probar; el documento de Dirección no trae el paso a paso.

| | |
|---|---|
| **Para** | Zairet Ledezma (Administración), Lidia Segundo y Ángel Martínez (TI) |
| **Prepara** | Gerardo Sánchez — Soporte TI |
| **Dónde** | https://satag.asuncionqro.edu.mx (el sitio real; no hay entorno de pruebas) |
| **Cuándo** | Viernes 11-sep y el fin de semana, antes de la limpieza |

---

## El orden importa

**Haga los bloques en orden: A crea los expedientes, B los cobra, C los instala; D y E van al
final, cuando ya haya instalaciones.** Si le toca empezar en B o en C, pida los folios de prueba a
quien hizo A: sin altas cobradas, la cola de «Instalar TAG» aparece vacía y no es una falla.

| Bloque | Qué se prueba | Quién | Con qué cuenta |
|---|---|---|---|
| A | Registro público (7 altas) | Cualquiera del equipo | Sin cuenta, en celular |
| B | Cobro y finanzas | Zairet | La suya, de Administración |
| C | Instalación del TAG | Lidia o Ángel | La suya, de TI, **en celular** |
| D | Buzón (actualizar y dar de baja) | TI | La suya |
| E | Exportación a ZKBioSecurity | TI o Gerardo | La suya |

## Antes de empezar

- Use **solo datos inventados**. Ponga «Prueba» como uno de los apellidos para reconocerlos a
  simple vista.
- Use **placas inventadas y distintas** en cada alta (o marque «Sin placas»): el sistema rechaza
  las mismas placas en dos expedientes.
- **No pegue físicamente ningún TAG** que se vaya a entregar a una familia: basta con teclear el
  número.
- **No toque «Cerrar corte»** en «Finanzas», ni siquiera en pruebas.
- El archivo que se exporte para ZK **no se importa al ZK real**. Si se decide importarlo para
  probar, que sea solo con números de TAG inventados, y después se eliminan en ZK esas personas de
  prueba.
- El buzón acepta hasta 10 notas por hora desde la misma conexión; y si al probar con folio se
  equivoca diez veces en un cuarto de hora, la conexión queda frenada quince minutos. Las dos
  cosas son la protección, no una falla.
- **Todo lo de prueba se borra con la limpieza.** Anote cada folio y cualquier cosa que no
  funcione (qué hizo, en qué pantalla y qué mensaje salió) y pásesela a Gerardo.

## A. Registro público

En un celular, ventana privada, satag.asuncionqro.edu.mx/registro/

1. **Padre o madre** con dos apellidos, apellidos de la familia y un vehículo del catálogo. Firme,
   envíe y anote el folio. Abra el aviso de privacidad: debe decir «Versión 6», y «Volver» debe
   regresar al registro.
2. **Conductor menor de edad:** marque «El conductor es menor de edad», capture a quien firma y
   compruebe que pide «Apellidos de la familia» y no avanza sin ellos.
3. **«Alumno» elegido a mano** en «Tipo de usuario», sin marcar la casilla del menor: también debe
   pedir los apellidos de la familia.
4. **«Otro familiar»**, escribiendo su parentesco (por ejemplo, tío del alumno).
5. **Extranjero con un solo apellido** (marque esa casilla) y un vehículo que no esté en la lista
   («Otro»).
6. **Maestro**, para cambiarle el tipo al cobrar (B.5).
7. Una alta más con las placas del alta 1: debe salir «Las placas … ya estan registradas…».
   Corríjalas con «Atrás» y reenvíe: la firma se conserva. **Ese expediente se deja sin cobrar;
   solo sirve para ver el mensaje.**
8. Cuando el cartel con QR esté impreso, escanéelo: debe abrir /registro/ del dominio
   institucional.

## B. Administración

Zairet, con su cuenta, en satag.asuncionqro.edu.mx/admin/

1. Entre con su correo, contraseña y código de verificación: debe llegar a la pestaña
   «Administración».
2. En «Registrar pago», cobre el alta 1: lea el recordatorio de GES, registre el pago y anote el
   recibo.
3. Cobre el alta 4 (otro familiar) y confirme o corrija el parentesco; si lo deja vacío debe salir
   «Escriba el parentesco con la familia.»
4. Cobre el alta 2 (menor): el tipo debe quedar fijo en «Alumno». Cobre también el alta 5.
5. Cobre el alta 6 (maestro) cambiando el tipo a «Padre / madre / tutor»: debe avisar que el
   expediente no trae los apellidos de la familia, y el pago debe registrarse.
6. Intente cobrar otra vez el alta 1: debe decir que ya tiene el pago.
7. En «Padrón completo», busque por folio, por nombre y por placas. En «Finanzas», revise «En caja
   ahora».
8. Deje **sin cobrar** el alta 3 (para C.6) y el alta 7 (la del choque de placas).

## C. TI

Lidia o Ángel, con su cuenta, **en celular**

1. Entre con su cuenta: debe llegar a la pantalla de TI.
2. Toque «Instalar TAG» y busque el alta 1 por placas, por apellidos y por nombre. Si
   Administración acaba de cobrar y no aparece, toque «Actualizar lista».
3. Instale el alta 1 marcando «La familia trae su propio TAG» con un número inventado de 6 a 11
   dígitos (deje vacío «No. del TAG apartado»). Compare el número grande del aviso, espere
   «Instalando el TAG…» y confirme «TAG … instalado y activado».
4. Instale el alta 4 (otro familiar) con un TAG del inventario de la escuela, **tecleando su
   número sin pegarlo**, y elija su estacionamiento.
5. En el alta 5, toque «¿Los datos del vehículo no coinciden?», corrija el color o el modelo
   (pruebe «Otro») e instale.
6. Busque el alta 3: debe seguir en «Esperando pago».
7. Abra el alta 2 (menor) y toque «Ver la firma»: en «Firmó» debe salir quien firma por el menor,
   no el menor.
8. En «Actualizar datos», cambie un dato del alta 1 y guarde; después escriba un número de TAG
   nuevo (reposición) y compruebe que el anterior queda inactivo.
9. En «Dar de baja», dé de baja el alta 5 con un motivo.

## D. Buzón

En celular: portada → «Solicitar actualización o baja →»

1. «Sí, tengo mi folio»: con el folio y las placas del alta 1, pida un cambio de color. En TI debe
   aparecer en «Actualizar datos» → «Con solicitud pendiente»; atiéndala con «Guardar cambios» y
   compruebe que sale de la lista.
2. «No tengo folio»: como padre o madre, deje una nota pidiendo la baja del alta 4. En TI, en
   «Notas sin expediente», toque «Vincular a un expediente», elija el alta 4 y confirme el
   trámite; después dé la baja en «Dar de baja».
3. Deje otra nota y, en TI, descártela con un motivo.

## E. Exportación a ZKBioSecurity

TI o Gerardo, después de las instalaciones del bloque C

1. En «TAGs de la escuela» → «Exportar a ZKBioSecurity», deje la fecha de hoy en «Padrón:
   instalados desde» y toque «Descargar padrón instalado para ZK».
2. Abra el archivo en Excel: deben venir las instalaciones de prueba con su número de TAG, y el
   otro familiar en «Padres de familia».
3. No lo importe al ZK real (ver «Antes de empezar»).

## Al terminar

Entregue a Gerardo la lista de folios de prueba que generó y los hallazgos (qué hizo, en qué
pantalla y qué mensaje salió). Con eso se llena la sección 9 del documento de Dirección y se
decide si la limpieza se corre tal cual.
