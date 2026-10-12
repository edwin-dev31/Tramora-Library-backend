# Google Books con respaldo de Open Library

Google Books continúa siendo el proveedor principal de `GET /api/books`. Si la
llamada falla por cuota, HTTP no exitoso (excepto 404), red, timeout o respuesta
inválida, se repite la búsqueda en Open Library con los mismos filtros, `limit` y
`offset`. Una búsqueda válida sin resultados no activa el respaldo. Tampoco se
ocultan errores internos de programación o validación.

La pausa existente de Google se conserva: 15 minutos después de HTTP 429 y un
minuto después de otros fallos de disponibilidad. Durante esa pausa, las búsquedas
usan el respaldo; al vencer, la próxima búsqueda vuelve a intentar Google. Si
ambos proveedores fallan, la API devuelve HTTP 502 con
`BOOK_PROVIDERS_UNAVAILABLE`.

## Configuración y activación

Las variables de Google siguen vigentes. Open Library permite búsquedas públicas
sin credenciales, pero la implementación acepta las claves `access` y `secret`
de Open Library/Internet Archive y las usa para abrir una sesión autenticada:

```dotenv
GOOGLE_BOOKS_API_URL=https://www.googleapis.com/books/v1/volumes
GOOGLE_BOOKS_KEY=
OPEN_LIBRARY_API_URL=https://openlibrary.org
OPEN_LIBRARY_ACCESS_KEY=tu_access_key
OPEN_LIBRARY_SECRET_KEY=tu_secret_key
OPEN_LIBRARY_USER_AGENT=MiBiblioteca/1.0 (contacto@ejemplo.com)
```

Al configurar ambas claves, el backend hace `POST /account/login.json` con
`{"access": "...", "secret": "..."}`, conserva únicamente la cookie de sesión
en memoria y la manda en las llamadas posteriores a Open Library. Las claves no
se incluyen en URLs, respuestas, logs ni código del frontend. Si solo se configura
una, la integración falla con `BOOK_PROVIDER_CONFIG_INVALID`; si no se configura
ninguna, el respaldo sigue funcionando con acceso público de lectura.
También se aceptan los nombres alternativos `OPEN_LIBRARY_ACCESS` y
`OPEN_LIBRARY_SECRET`.

El backend usa el `Logger` de NestJS para dejar trazabilidad en la consola. Cuando
Google falla aparece un `WARN` indicando que se activó Open Library; después el
servicio registra `Using Open Library for book search` o `Using Open Library for
book detail`. También registra si se creó la sesión autenticada y si ambos
proveedores fallaron. Nunca registra los valores de `access`, `secret` ni la
cookie.

Desde el directorio del backend:

```bash
npm run migration:run
npm test
npm run start:dev
```

La migración `003_open_library_provider.sql` agrega `open_library` al enum de
PostgreSQL. Debe aplicarse antes de desplegar este código, porque las consultas de
listas usan el nuevo valor. No modifica los libros de Google existentes. La
reversión se rechaza si existen libros de Open Library, para conservar préstamos,
reservas y favoritos asociados.

## Identificadores y persistencia

| Proveedor    | ID público (`id` / `bookId`) | `books.provider` | `books.provider_id` |
| ------------ | ---------------------------- | ---------------- | ------------------- |
| Google Books | `google-volume-id`           | `google_books`   | `google-volume-id`  |
| Open Library | `openlibrary:OL893415W`      | `open_library`   | `OL893415W`         |

El contrato `Book` y la paginación no cambian. El frontend puede seguir enviando
`book.id` tal como lo recibe, codificado con `encodeURIComponent` en las rutas.
Las listas de préstamos, lectura, reservas y favoritos reconstruyen el mismo ID
público. Buscar o consultar un detalle no importa libros a la base: se guardan
cuando una operación de biblioteca los necesita.

Los detalles se consultan en el proveedor identificado por el ID, incluso si
Google ya se recuperó. Los metadatos previamente guardados siguen disponibles
sin depender de las APIs. Un ID de Google no permite identificar por sí solo una
obra en Open Library: un detalle de Google no guardado puede fallar durante una
caída. No se adivinan equivalencias ni se sustituyen libros por coincidencias de
título. La misma obra en ambos catálogos mantiene referencias independientes.

## Open Library

- Búsqueda con `/search.json`; solicita solamente título, autores, año, portada
  e identificador. Acepta todos los campos de búsqueda actuales.
- Detalle con `/works/OL…W.json`; una búsqueda por clave agrega autores y año sin
  hacer una petición por autor. Si esa información adicional falla, se conserva
  el detalle de la obra. La descripción puede ser texto u objeto `{ value }`.
- Timeout de 10 segundos por petición; caché en memoria de cinco minutos y hasta
  200 respuestas; las peticiones simultáneas idénticas comparten una llamada.
- Máximo de una petición por segundo por proceso. La espera en cola se limita
  a menos de diez segundos. Con varias réplicas, se requiere coordinar el límite
  entre procesos. HTTP 429 pausa llamadas nuevas durante un minuto; otros fallos
  las pausan diez segundos. Las respuestas válidas en caché siguen disponibles.

La paginación pertenece al proveedor que responde cada petición. Si cambia el
proveedor entre páginas, el orden y el total pueden cambiar; volver a buscar
reinicia la lista. No hay equivalencia de posiciones entre ambos catálogos.

Documentación oficial consultada:
[Search API](https://openlibrary.org/dev/docs/api/search),
[Works / Books](https://openlibrary.org/dev/docs/api/books),
[uso y límites](https://openlibrary.org/developers/api).

## Verificación

`npm test` compila y ejecuta las pruebas de Node sin claves ni llamadas externas.
Cubren prioridad de Google, errores HTTP/red/timeout/respuestas inválidas, pausa y
recuperación, ambos proveedores caídos, caché, límite de peticiones, identificadores,
metadatos, referencias y consultas de las listas. Los repositorios usan dobles de
base de datos: estas pruebas no reemplazan aplicar la migración en PostgreSQL.

Para probar la caída manualmente en un entorno de desarrollo, iniciar el backend
con `GOOGLE_BOOKS_API_URL=http://127.0.0.1:1/volumes`, realizar una búsqueda y
comprobar que los IDs empiezan por `openlibrary:`. Abrir un detalle y guardar el
libro en favoritos. Restaurar la URL de Google y reiniciar el backend para
comprobar que vuelve a ser principal y el libro guardado sigue accesible.
