# Estado de la app móvil

Levantado el 17/09/2026, al empezar el **paso 3** del orden acordado
(decisión 37): *"El diseño definitivo móvil, que Bosco entrega, y con él se
termina la versión móvil."*

Este documento es la mitad del paso que **no** depende del PDF: qué tiene
hoy `apps/mobile`, qué se le ha quedado atrás mientras el paso 2 rehacía la
web, y qué de eso no se puede tocar hasta que llegue el diseño. Es el
equivalente móvil de `MAPA-DEL-DISENO.md`, y se escribe antes de construir
por la misma razón que aquel: para no descubrir a mitad de camino lo que no
existe.

**El PDF del diseño móvil no está en el repositorio.** Sin él, lo que se ha
hecho es lo de la sección "Ya arreglado", que son defectos, no diseño.

---

## Qué tiene hoy

La app es Expo 57 con `expo-router`, 29 pantallas y 4.700 líneas, y **no es
un cliente aparte**: importa por el alias `@/` el dominio (`src/core/`), los
servicios (`src/services/`), el catálogo de textos y la navegación de la
web. Un destino que entre o salga de la barra cambia en las dos superficies
a la vez, y un enlace profundo de un aviso abre el mismo elemento
(RN-MOV-01/02).

Los **once flujos de §176** están: solicitar, validar y aceptar, asignar,
comenzar, bloquear, publicar con evidencia, corregir, pagar y confirmar,
preparar menú, consultar informe, y equipo y ajustes. Con push
(RN-MOV-05/06), permisos de cámara y galería, cerrojo biométrico y el modo
sin conexión de §144 con sus borradores y su puerta de acciones críticas.

Lo que la app no trae **dice dónde está** y no se queda en blanco
(RN-MOV-03): el catch-all `[...resto].tsx` resuelve el destino contra la
misma lista de la web y lo nombra. El panel de Cuotly y Modo soporte no
están a propósito (RN-MOV-08).

## Lo que se le ha quedado atrás

El paso 2 reorganizó la web entera —contexto global, solicitud de acceso,
panel del restaurante, catorce piezas sueltas, alérgenos— entre el 16 y el
17/09/2026. La app no se tocó. Esto es el desfase, y **ninguna línea de
aquí se construye sin el diseño**, porque todas son pantallas:

### 1 · El contexto global (§36, G01 a G08, migración 98)
La web tiene ahora una zona fuera de todo espacio: Inicio con lo que
necesita atención de todos los contextos a la vez, Mis solicitudes, bandeja
**global** de mensajes, Mi cuenta y Ayuda. En el teléfono la raíz sigue
siendo el selector de contexto y nada más, y de la cuenta solo existe
`/cuenta/sesiones`.

Lo de servidor ya está y es el mismo: `my_contexts()`,
`list_my_conversations()`, `my_client_attention()`,
`my_notification_preferences()`. Falta la pantalla, que es lo que dirá el
PDF.

### 2 · El panel del restaurante como contexto propio (§40, RN-PAN)
La web le da cabecera propia, selector de restaurante y "Volver al inicio de
Cuotly". La app enseña el panel dentro del armazón del espacio, con la barra
de cinco destinos. Las direcciones son las mismas (RN-PAN-01), así que esto
es forma, no fontanería.

### 3 · La solicitud de creación de espacio y su seguimiento
`/solicitar-espacio` y `/mis-solicitudes` no tienen pantalla en la app. La
solicitud **de acceso** sí la tiene desde hoy (abajo); la de espacio, no.

### 4 · Las piezas del paso 2 que el teléfono no conoce
Grupos de restaurantes, archivados y transferencia entre espacios, copias de
seguridad, canales internos de mensajería, impuestos del espacio, cancelar
una solicitud, copiar un borrador, comparar versiones del menú, edición
simultánea, baja del servicio, pagos parciales, recordatorios de cobro y
**alérgenos** (§39, migración 101). Todas caen hoy en "esto está en la web",
que es honesto pero es una lista larga.

La decisión de cuáles suben al teléfono es del diseño. Los alérgenos son la
que más pesa: es una obligación legal del restaurante y el restaurante
escribe el menú desde el móvil.

### 5 · Una pregunta que el diseño tiene que contestar
Los tres destinos del panel —Solicitudes, Nueva solicitud, Mensajes— son
**secciones de una misma pantalla larga**, y en la web se distinguen con
ancla (RN-PAN-07). `expo-router` no sabe de fragmentos. Hoy los tres llevan
a la pantalla del panel, que es donde está lo que prometen; que la app
pueda ir **a la parte** o que cada bloque sea su propia pantalla es
exactamente el tipo de cosa que decide el diseño, y no se inventa aquí.

## Ya arreglado (17/09/2026)

Cuatro defectos encontrados al auditar. Ninguno es diseño: son cosas que el
paso 2 dejó rotas o desalineadas en el teléfono, y esperar al PDF para
arreglarlas no tenía sentido.

1. **La app ofrecía una tercera puerta.** `app/signup.tsx` llamaba a
   `supabase.auth.signUp()` y el login decía "¿No tienes cuenta?
   Regístrate". La decisión 41 cerró el registro abierto el 16/09/2026 y la
   web puso allí el formulario de solicitud de acceso. No era un agujero
   —`enable_signup = false` en `supabase/config.toml` cierra la puerta de
   verdad, y GoTrue contestaba que no—, pero sí una pantalla que pedía una
   contraseña para una cuenta que no se iba a crear. Ahora es el formulario
   de solicitud de acceso (RN-ACC-02), con la misma comprobación campo a
   campo que la web y el mismo final único de RN-ACC-12.
   **Lo que impide que vuelva a pasar** no es haberlo arreglado. El barrido
   que busca la tercera puerta ya existía —`registro-cerrado.test.ts`— y
   miraba **solo `apps/web/src`**: ese era el hueco. Ahora barre las dos
   superficies, y se ha comprobado que falla nombrando el archivo.
2. **El login culpaba a la contraseña de cualquier fallo.** Contestaba
   "Correo o contraseña incorrectos" también sin red, con el servicio caído
   o con demasiados intentos — el error que la web arregló con
   `core/auth-errors.ts` y que en un teléfono es el caso frecuente, no el
   raro. El mapa de motivos vivía dentro de un módulo `"use server"` que la
   app no puede importar; ahora está en `core/` y lo usan las dos.
3. **Los tres destinos con ancla no llegaban a ninguna parte.** Un
   restaurante que abriera "Más" y tocara Solicitudes, Nueva solicitud o
   Mensajes aterrizaba en "esto está en la web" **con la pantalla
   delante**: `expo-router` no casa una ruta con `#`. Se navega por
   `navigableHref()`, y un barrido comprueba que ningún destino llegue al
   router con un fragmento.
4. **El selector de contexto se armaba a mano**, con una llamada a
   `space_slug()` por restaurante y la regla de "de quién es cada contexto"
   escrita por segunda vez —"no está en mis espacios" en vez de
   `is_establishment_client()`, que dejan de coincidir en cuanto alguien
   del equipo es además cliente de otro espacio—. Ahora sale de
   `my_contexts()` (RN-GLO-03), la misma función que la web.

Y dos de limpieza que salieron con ellos: el bloque `auth` del catálogo del
teléfono era una copia del de la web y se había quedado atrás, así que se
ha ido entero; y subir un archivo sin sesión decía "Correo o
contraseña incorrectos", que tampoco era verdad.

## Lo que hace falta para seguir

**El PDF del diseño definitivo móvil.** Igual que el de escritorio, se lee
entero, se cruza con las pantallas que hay, y de ahí sale la lista de qué
cambia de forma, qué no existe y qué hay que decidir antes de construir.
Hasta entonces las cinco secciones de "Lo que se le ha quedado atrás" se
quedan escritas y sin tocar: son pantallas, y las pantallas las dice el
diseño.
