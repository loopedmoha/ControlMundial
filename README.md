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

## Llevarla a otro equipo y usarla en red local

La app puede ejecutarse en un equipo y controlarse desde **otro ordenador de la
misma red** (mismo router/switch). Siempre usa el **puerto 8090**.

### 1) Crear el paquete

En el equipo de desarrollo:

```powershell
powershell -ExecutionPolicy Bypass -File empaquetar.ps1
```

Genera `dist\ControlMundial.zip` con todo lo necesario (sin estado ni
herramientas de desarrollo).

### 2) En el equipo destino

1. Copia y **descomprime** `ControlMundial.zip`.
2. Doble clic en **`Iniciar Control Mundial.bat`**.
   - **La primera vez** pedirá permisos de administrador para la *preparación de
     red* (una sola vez): crea la **reserva de URL** (`netsh http add urlacl`) y la
     **regla de firewall** del puerto 8090. Acepta.
   - A partir de ahí (y en los siguientes arranques) **el servidor se ejecuta SIN
     privilegios de administrador**, escuchando en **todas las interfaces**, y abre
     el navegador local.
3. En la consola verás las **URLs de acceso**, por ejemplo:

   ```
   En este equipo:        http://localhost:8090/
   Desde otros equipos:
      http://192.168.1.50:8090/
   ```

### 3) Conectarse desde otro ordenador

En el navegador del otro equipo abre `http://<IP-del-equipo-servidor>:8090/`
(la IP que aparece en la consola). Ambos equipos deben estar en la **misma red**.

> **¿Por qué el servidor NO va como administrador?** Un proceso elevado **pierde el
> acceso a las unidades de red del usuario** (Z:, `\\servidor\...`) y daría
> *"carpeta no existe"* al leer los fondos. Por eso el lanzador deja el servidor sin
> elevar y solo eleva la preparación inicial (reserva de URL + firewall). Esa reserva
> es lo que permite escuchar en red (`http://+:8090/`) sin ser administrador.
>
> Para uso **solo local** también vale `server.ps1` sin más (escucha en `localhost`).

---

## Cómo se usa

1. **Indica la carpeta** de fondos. Al abrir, el programa apunta **por defecto**
   a `\\172.28.51.62\COMPARTIDA DEPORTES\MUNDIAL 2026` y la carga automáticamente. Para usar
   otra, escribe la ruta (p. ej. `C:\Mundial\Fondos`) o pulsa **📁 Examinar** y
   luego **Cargar**.
   - *(La carpeta por defecto se define en `js/app.js`, constante `DEFAULT_DIR`.)*
   - **Ubicaciones en red:** también puedes usar rutas UNC, p. ej.
     `\\servidor\fondos`. Escríbelas en la barra superior, o ábrelas desde
     **📁 Examinar** con la caja **«Ruta o ubicación de red»** y el botón **Ir**.
     Al entrar en un servidor (`\\servidor`) se listan sus recursos compartidos.
   - **Unidades de red mapeadas** (p. ej. `Z:` → `\\servidor\carpeta`): aparecen
     en el explorador y se pueden usar directamente. Si el servidor se arranca
     **como administrador** (modo red), Windows no comparte las unidades mapeadas
     con el proceso elevado; en ese caso la app **resuelve automáticamente** la
     letra a su ruta UNC (leída de `HKCU:\Network`), así que `Z:` sigue
     funcionando igual.
   > El equipo donde corre el servidor debe tener **acceso** a esa ruta de red
   > (mismas credenciales/permisos que el usuario que lo ejecuta).
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

| Pantalla (interfaz) | Color | Uso típico |
|---|---|---|
| **Arco** | Azul | Pantalla del arco/portería |
| **Curva** | Verde | Pantalla de la curva (internamente «Larga» = P1) |
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
reutilizan esa misma conexión).

- Una vez conectado, el botón se convierte en un **indicador verde «✓ Conectado»**
  (no se puede cerrar por accidente). El botón **⛔ Cerrar conexión** solo aparece
  en **modo desarrollador**.
- **Modo desarrollador:** botón **🛠️ Modo dev** (arriba). Pide una **clave** para
  entrar y muestra las herramientas avanzadas: primitivas «próx. ENTRA», reinicio,
  registro de órdenes y cerrar conexión. Empieza siempre desactivado.
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

### Pantallas → primitivas (P1/P2/P3)
Cada pantalla se corresponde con una primitiva de Brainstorm:

| Pantalla (app) | Primitiva (Brainstorm) |
|---|---|
| **Larga** | **P1** |
| **Arco** | **P2** |
| **Mesa** | **P3** |

### Fondos y alternancia (doble buffer, sin cruce)
Cada pantalla tiene **dos fondos (Fondo1 y Fondo2)**. Se alterna entre ellos, y
**`SUBE{n}` cambia `Fondo{n}`** (mapeo directo, sin cruce): los **datos** (imagen o
vídeo) se cargan en `Fondo{n}` y se ejecuta `{P}/SUBE{n}` con el **mismo** número.

- **Empieza por la 1 nada más abrir** la escaleta: el primer ENTRA carga los datos
  en **Fondo1** y ejecuta `{P}/SUBE1`.
- **Solo el botón ENTRA alterna** (1 → 2 → 1 …). El segundo ENTRA carga **Fondo2** y
  ejecuta `{P}/SUBE2`; y así sucesivamente.
- El panel de Brainstorm muestra el **próximo `SUBE` (ENTRA)** de cada pantalla, y
  cada elemento marca con cuál entró (`entró Sube1` / `entró Sube2`).
  El botón **↺ Reiniciar** vuelve las tres al ENTRA 1.

### Botón ENTRA (en cada elemento de la escaleta)
Al pulsar **ENTRA** se envía la secuencia completa. Llamando `P` a la primitiva de
la pantalla (`P1`/`P2`/`P3`) y `N` al número que toca (1 ó 2) —el mismo para `Fondo`
y para `SUBE`—, **la ruta es la del propio fichero** (`item.path`). Las rutas van
entre comillas simples y con las barras dobladas (`\\`). Toda orden acaba en `;`.

**Si es IMAGEN:**
```
itemset("{P}/Fondo{N}", "TEX_TYPE", "TexFile");
itemset("{P}/Fondo{N}", "TEX_FILE", 'C:\\...\\fichero.png');
itemgo("<DB>{P}/SUBE{N}", "EVENT_RUN",0, 1);
```

**Si es VÍDEO:**
```
itemset("{P}/Fondo{N}", "TEX_TYPE", "TexMedia");
itemset("{P}/Fondo{N}", "TEX_MEDIA", "{P}/Fondo{N}");
itemset("{P}/Fondo{N}", "MEDIAIN_PATH", 'C:\\...\\fichero.mp4');
itemgo("{P}/Fondo{N}", "MEDIAIN_PLAYER/PLAY_FORWARD",0,0.2);
itemgo("<DB>{P}/SUBE{N}", "EVENT_RUN",0, 1);
```

Ejemplo del primer ENTRA en Larga (vídeo): `P=P1`, `N=1` → datos en `P1/Fondo1`
y se ejecuta `P1/SUBE1`. El `TEX_TYPE` solo se cambia en el fondo de datos (no rompe
el que está en aire). Solo las órdenes `SUBE` llevan prefijo `<DB>`; las de
`Fondo`/`MEDIAIN` van sin prefijo.

### Sale por pantalla y ENTRA/SALE TODO
- En **PANTALLAS · Sale** hay un botón **Sale** por pantalla → `itemgo("<DB>{P}/SALE", "EVENT_RUN",0, 1)`.
- Al final del panel, apartados para evitar accidentes:
  - **▶ ENTRA TODO** (verde) → una sola orden `itemgo("<DB>ENTRATODO", "EVENT_RUN",0, 1)`.
  - **■ SALE TODO** (rojo) → `P1/SALE`, `P2/SALE` y `P3/SALE`.

### VIDEO IN (botones manuales)
En el panel de Brainstorm hay cuatro video IN, cada uno con dos botones
independientes (**Entra** y **Sale**). Etiqueta en la interfaz → identificador:

| Interfaz | Video IN |
|---|---|
| **Pequeño** | `P1_PEQUENO` |
| **Largo** | `P1_LARGO` |
| **Total** | `P1_TOTAL` |
| **Arco** | `P2` |
| **Cartones peq.** | `CARTONES_P` |
| **Cartones largo** | `CARTONES_L` |

Cada botón envía una sola orden:

```
itemset("<DB>VIDEO_IN/{P1_PEQUENO|P1_LARGO|P1_TOTAL|P2|CARTONES_P|CARTONES_L}/ENTRA", "EVENT_RUN")  // Entra
itemset("<DB>VIDEO_IN/{P1_PEQUENO|P1_LARGO|P1_TOTAL|P2|CARTONES_P|CARTONES_L}/SALE", "EVENT_RUN")   // Sale
```

### LOGO (botones manuales)
Dos botones (**Entra / Sale**) que meten y sacan el logo. Van **sin** prefijo de
base de datos:

```
itemset("LOGO/ENTRA", "EVENT_RUN")   // botón Entra
itemset("LOGO/SALE", "EVENT_RUN")    // botón Sale
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
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemset("P1/Fondo2", "TEX_TYPE", "TexFile")
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemset("P1/Fondo2", "TEX_FILE", 'C:\\...\\fondo.png')
  [2026-06-03 17:55:38.643] 127.0.0.1:5123  ENVIADO  itemgo("<dbs1>P1/SUBE1", "EVENT_RUN",0, 1)
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
