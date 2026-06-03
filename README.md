# Control de Pantallas · Mundial

Aplicación web (backend + frontend) para el **control de los fondos de las
pantallas del Mundial**. Muestra en una cuadrícula todas las imágenes y las
miniaturas de los vídeos de una carpeta, permite elegir a qué pantalla va cada
fondo —**Arco**, **Larga** o **Mesa**— y enviarlos a una **escaleta** que se abre
en una ventana aparte.

No necesita Node ni Python: el backend es un servidor en **PowerShell** sin
dependencias y el frontend es HTML/CSS/JS puro.

---

## Cómo ejecutarla

```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

Luego abre **http://localhost:8090** en el navegador.

Opciones:

```powershell
# Otro puerto y abrir el navegador automáticamente
powershell -ExecutionPolicy Bypass -File server.ps1 -Port 9000 -Open
```

> Si Windows pide permisos de red la primera vez, acepta para `localhost`.

---

## Cómo se usa

1. **Indica la carpeta** de fondos: escribe la ruta (p. ej. `C:\Mundial\Fondos`)
   o pulsa **📁 Examinar** para navegar por las carpetas del equipo. Pulsa
   **Cargar**.
2. La **cuadrícula** muestra todas las imágenes y la miniatura de cada vídeo
   (la miniatura del vídeo se genera capturando un fotograma; se cachea para no
   repetir el trabajo). Clic en una miniatura para previsualizarla en grande.
3. **Elige la pantalla** de cada fondo con los botones **Arco / Larga / Mesa**
   de cada tarjeta. Cada pantalla tiene su color. Volver a pulsar la misma
   pantalla deselecciona el elemento.
   - En la barra inferior puedes **asignar una pantalla en bloque** a todo lo
     seleccionado (o a todo lo visible si no hay nada seleccionado).
4. Pulsa **➕ Añadir a la escaleta**. Cada elemento se añade con la pantalla
   elegida.
5. Abre la **🎬 escaleta** (botón arriba a la derecha): es una **ventana aparte**
   con el rundown ordenado. Puedes **reordenar** (▲▼), **quitar** elementos,
   **filtrar por pantalla** y **previsualizar** cada fondo. Los cambios se
   sincronizan en vivo con la ventana principal.

---

## Pantallas

| Pantalla | Color | Uso típico |
|---|---|---|
| **Arco** | Azul | Pantalla del arco/portería |
| **Larga** | Verde | Pantalla larga / lateral |
| **Mesa** | Ámbar | Pantalla de la mesa de estudio |

---

## Conexión con Brainstorm

La app manda las órdenes a **Brainstorm** por **socket TCP**. Como el navegador no
puede abrir sockets, las órdenes se envían al backend (`/api/brainstorm`) y este
las reenvía por TCP a la IP y puerto configurados. Cada orden se manda en su
propia línea, **terminada en `;`** y seguida de `CRLF` (si la orden ya trae `;` no
se duplica).

### Configuración (botón ⚙️ Brainstorm)
Disponible tanto en la ventana principal como en la escaleta:

- **IP**: por defecto `127.0.0.1`, editable (puedes apuntar a otra máquina).
- **Puerto**: por defecto `5123`.
- **DB**: por defecto `dbs1`. Se usa como prefijo `<db>` en las órdenes.

La configuración se guarda en el navegador y se comparte entre las dos ventanas.

### Conexión persistente (Conectar / Cerrar)
La conexión con Brainstorm es **persistente**: al pulsar **🔌 Conectar** el
backend abre el socket TCP y **lo mantiene abierto** (todos los ENTRA y VIDEO IN
reutilizan esa misma conexión) hasta que pulses **⛔ Cerrar conexión**.

- El botón está en el **panel de Brainstorm** de la escaleta y también en el
  modal de **⚙️ Configuración**. El indicador (punto verde = conectado) refleja el
  estado real y se sincroniza entre las dos ventanas.
- Si todavía **no** has conectado y envías una orden, el backend abre una conexión
  puntual, manda la orden y la cierra (para que ENTRA funcione igualmente). En
  cuanto conectas, todo va por la conexión persistente.
- Si Brainstorm corta la conexión, el estado pasa a *Desconectado* y el siguiente
  envío vuelve a abrir conexión puntual hasta que reconectes.

Endpoints: `POST /api/brainstorm/connect` `{ip,port}`,
`POST /api/brainstorm/disconnect`, `GET /api/brainstorm/status`.

### Primitivas, alternancia y cruce (doble buffer)
Cada pantalla tiene **dos primitivas (1 y 2)**. Funciona como doble buffer **con
cruce**: los **datos** (imagen o vídeo) se cargan en una primitiva, pero el
**`SubePantalla`** que se ejecuta lleva el número **contrario**.

- **Empieza por la 1 nada más abrir** la escaleta: el primer ENTRA ejecuta
  `SubePantalla…1` y carga los datos en la **primitiva 2**.
- **Solo el botón ENTRA alterna** (1 → 2 → 1 …). El segundo ENTRA ejecuta
  `SubePantalla…2` y carga los datos en la **primitiva 1**; y así sucesivamente.
- El panel de Brainstorm muestra el **próximo `SubePantalla` (ENTRA)** de cada
  pantalla, y cada elemento marca con cuál entró (`entró Sube1` / `entró Sube2`).
  El botón **↺ Reiniciar** vuelve las tres al ENTRA 1.

### Botón ENTRA (en cada elemento de la escaleta)
Al pulsar **ENTRA** se envía la secuencia completa. Llamando `S` al número de
`SubePantalla` que toca (1 ó 2) y `D` al **contrario** (donde se cargan los datos),
**la ruta es la del propio fichero** (`item.path`): como Brainstorm está en la
misma máquina, basta con cargar en la app la carpeta real de fondos. Las rutas van
entre comillas simples y con las barras dobladas (`\\`). Toda orden acaba en `;`.

**Si es IMAGEN:**
```
itemset("PrimitivaPantalla{Pantalla}{D}", "TEX_TYPE", "TexFile");
itemset("PrimitivaPantalla{Pantalla}{D}", "TEX_FILE", 'C:\\...\\fichero.png');
itemgo("<DB>SubePantalla{Pantalla}{S}/ENTRA", "EVENT_RUN",0, 1);
```

**Si es VÍDEO:**
```
itemset("PrimitivaPantalla{Pantalla}{D}", "TEX_TYPE", "TexMedia");
itemset("PrimitivaPantalla{Pantalla}{D}", "TEX_MEDIA", "VideoPantalla{Pantalla}{D}");
itemset("VideoPantalla{Pantalla}{D}", "MEDIAIN_PATH", 'C:\\...\\fichero.mp4');
itemgo("VideoPantalla{Pantalla}{D}", "MEDIAIN_PLAYER/PLAY_FORWARD",0,0.2);
itemgo("<DB>SubePantalla{Pantalla}{S}/ENTRA", "EVENT_RUN",0, 1);
```

Ejemplo del primer ENTRA en Larga (vídeo): `S=1`, `D=2` → datos en la primitiva 2
y se ejecuta `SubePantallaLarga1`. El `TEX_TYPE` solo se cambia en la primitiva de
datos (no rompe la que está en aire).

> Las pantallas **solo tienen ENTRA** (no Sale): el siguiente fondo entra sobre el
> anterior alternando primitiva y `SubePantalla`.

### VIDEO IN (botones manuales)
En el panel de Brainstorm hay tres botones (**Corto / Largo / Arco**) que envían:

```
itemset("<DB>VIDEOIN{CORTO|LARGO|ARCO}/ENTRA", "EVENT_RUN")
itemset("<DB>VIDEOIN{CORTO|LARGO|ARCO}/SALE", "EVENT_RUN")
```

### Registro de órdenes (log)

Cada orden que el backend manda a Brainstorm se registra:

- **En la app**: panel **«Registro de órdenes»** en la escaleta (debajo de la
  previsualización), con cada línea coloreada (verde = enviada, rojo = error) y
  botones para **actualizar (↻)** y **vaciar (🗑️)**. Se actualiza solo tras cada
  ENTRA, VIDEO IN o prueba de conexión.
- **En fichero**: `brainstorm.log` en la carpeta del proyecto, con marca de
  tiempo, destino `ip:puerto` y el texto exacto de cada orden. Ejemplo:

  ```
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemset("PrimitivaPantallaLarga1", "TEX_TYPE", "TexFile")
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemset("PrimitivaPantallaLarga1", "TEX_FILE", 'C:\\...\\fondo.png')
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemset("<dbs1>SubePantallaLarga1/ENTRA", "EVENT_RUN")
  ```

  Si falla la conexión, queda `ERROR: …` y cada orden como `NO ENVIADO`.

Endpoints del log: `GET /api/brainstorm/log` (leer) y
`GET /api/brainstorm/log?clear=1` (vaciar).

---

## Arquitectura

```
server.ps1          Backend: API + ficheros estáticos + streaming + socket a Brainstorm
index.html          Cuadrícula de fondos y selección de pantalla
escaleta.html       Ventana de la escaleta (rundown) + panel de Brainstorm
css/styles.css      Estilos (tema oscuro de control)
js/common.js        API de media, miniaturas de vídeo, BroadcastChannel
js/brainstorm.js    Configuración y constructores de órdenes de Brainstorm
js/settings.js      Modal de configuración (IP / Puerto / DB / probar)
js/app.js           Lógica de la cuadrícula
js/escaleta.js      Lógica de la escaleta + ENTRA / primitivas / VIDEO IN
escaleta.json       Escaleta persistida (se crea sola)
fake-brainstorm.ps1 Listener TCP de prueba (simula Brainstorm; ver nota abajo)
```

### API del backend

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/list?dir=<ruta>` | Lista imágenes y vídeos de una carpeta |
| GET | `/api/dirs?dir=<ruta>` | Navegación de carpetas (explorador) |
| GET | `/media?path=<ruta>` | Sirve un fichero (soporta `Range` para vídeo) |
| GET | `/api/escaleta` | Devuelve la escaleta guardada |
| POST | `/api/escaleta` | Guarda la escaleta |
| POST | `/api/brainstorm/connect` | Abre y **mantiene** la conexión persistente a `ip:port` |
| POST | `/api/brainstorm/disconnect` | Cierra la conexión persistente |
| GET | `/api/brainstorm/status` | Estado de la conexión persistente (`connected`, `addr`) |
| POST | `/api/brainstorm` | Envía `commands` (array). Reutiliza la conexión persistente si está abierta; si no, una puntual. Con `commands` vacío solo prueba |
| GET | `/api/brainstorm/log` | Devuelve el registro de órdenes. Con `?clear=1` lo vacía |

### Probar sin Brainstorm (opcional)

`fake-brainstorm.ps1` es un listener TCP que **simula** Brainstorm: escucha en el
puerto 5123 y guarda en `bs-recv.log` lo que recibe, para comprobar las órdenes.

```powershell
powershell -ExecutionPolicy Bypass -File fake-brainstorm.ps1
```

> ⚠️ No lo arranques si el **Brainstorm real** ya está usando el puerto 5123 (en
> este equipo corre `ipf.exe` con la escena `PantallasMundial`): solo un programa
> puede escuchar ese puerto a la vez.

---

## Notas

- **Formatos de imagen**: jpg, jpeg, png, gif, webp, bmp, svg, avif, jfif, tif/tiff.
- **Formatos de vídeo**: mp4, webm, mov, mkv, avi, m4v, mpg/mpeg, wmv, ogv.
  La miniatura y la reproducción dentro del navegador dependen de los códecs que
  soporte el navegador (mp4/webm funcionan siempre; mkv/avi/wmv pueden no
  previsualizarse aunque sí aparecen en la lista).
- La escaleta se guarda en `escaleta.json` y, además, se sincroniza al instante
  entre la ventana principal y la de la escaleta mediante `BroadcastChannel`.
- La última carpeta usada se recuerda en el navegador.
