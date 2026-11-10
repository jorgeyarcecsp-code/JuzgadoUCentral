# Sala Virtual de Litigio Simulado

Plataforma académica del Consultorio Jurídico de la Universidad Central para simular, con todas sus instancias, el proceso verbal por infracción de derechos sobre marca registrada.

## Funciones

- **Consulta pública sin registro:** por número de radicación (23 dígitos), por nombre o razón social, por construcción del número y por despacho y clase de proceso. Muestra los datos del proceso, los sujetos procesales, la etapa, las actuaciones, los estados electrónicos y las audiencias.
- **Registro limitado al correo institucional:** solo se crean usuarios con correo @ucentral.edu.co. El servidor rechaza cualquier otro dominio y exige la autorización de tratamiento de datos personales.
- **Docente administrador:** la cuenta registrada con el correo definido en la configuración recibe el rol de docente. Desde Administración asigna los roles de juez, secretaría, magistrado, partes, perito u observador.
- **Radicación con numeración automática:** el escrito inicial asigna el radicado consecutivo y cada actuación recibe su número dentro del proceso. El servidor valida que cada rol radique solo lo que le corresponde.
- **Documentos privados:** se cargan archivos PDF, de imagen o de texto de hasta 20 MB, con huella SHA-256. Solo los consultan los participantes con rol asignado.
- **Términos en días hábiles:** el cálculo excluye los festivos colombianos y, de forma opcional, la vacancia judicial.

## Identidad y estilo

El sitio aplica el *Manual de identidad visual corporativa* (2024) y el *Manual de estilo* (2013) de la Universidad Central:

- Logosímbolo en la versión 2 (justificado a la izquierda, en dos líneas), en policromía sobre fondo blanco. Se muestra con 212 px de ancho, por encima del mínimo digital de 76 px, y conserva su área de respeto.
- Solo se usan colores de la paleta institucional:
  - primarios: #636F03, #1A171B, #B11F16, #ACAA00 y #F3E7CE;
  - secundarios, para estados: #E95D0F, #0B8689, #1472B8 y #634998.
- Tipografías Titillium y Roboto, dos de las familias secundarias autorizadas por el Manual, que permite hasta tres familias por pieza.
- Redacción sin mayúsculas sostenidas, con tratamiento de usted, siglas presentadas con su nombre completo la primera vez, meses en minúscula, horas con dos puntos y cifras de cinco o más dígitos con espacio fino.

Antes de publicar el sitio, solicite el visto bueno de la dependencia encargada de la identidad visual corporativa para el uso del logosímbolo fuera del dominio institucional.

## Instalación (una sola vez)

### 1. Supabase

1. Cree una cuenta gratuita en <https://supabase.com> y un proyecto nuevo, preferiblemente en la región São Paulo. Guarde la contraseña de la base de datos.
2. En **SQL Editor**, ejecute en este orden:
   - `supabase/01_esquema.sql`: crea las tablas, las reglas de acceso, las funciones de radicación y el depósito de archivos. Antes de ejecutarlo, confirme en la sección 1 el dominio (`ucentral.edu.co`) y el correo del docente administrador.
   - `supabase/02_catalogo.sql`: crea las etapas y los tipos de actuación.
   - `supabase/03_ejemplo.sql` (opcional): crea el proceso de ejemplo CUMBRE ANDINA.
   - `supabase/04_preasignaciones.sql`: permite al docente preasignar roles por correo institucional antes de que el estudiante se registre.
3. En **Authentication > Sign In / Providers > Email**, mantenga activa la opción *Confirm email*.
4. En **Authentication > URL Configuration**:
   - en *Site URL*, escriba la dirección pública del sitio (paso 3);
   - en *Redirect URLs*, agregue esa misma dirección.
5. **Configure el envío de correos.** El servidor de correo incluido en Supabase solo envía mensajes a los miembros del equipo del proyecto y admite dos correos por hora. Sin un servidor propio, los estudiantes no recibirán el enlace de confirmación.
   - Configúrelo en **Authentication > Emails > SMTP Settings**. Hay dos opciones gratuitas:
     - **Brevo:** 300 correos diarios. Solo exige verificar el remitente.
     - **Gmail:** use una contraseña de aplicación. Servidor `smtp.gmail.com`, puerto `587`.
   - Después, en **Authentication > Rate Limits**, ajuste el límite de correos por hora al tamaño del curso.
6. En **Project Settings > API**, copie la *Project URL* y la clave *anon public*.

### 2. Configuración del sitio

Edite `js/config.js` con los dos valores del paso anterior. La clave anónima es pública por diseño; la seguridad la imponen las reglas de la base de datos.

### 3. Publicación en GitHub Pages

1. En el repositorio, abra **Settings > Pages**.
2. En *Source*, seleccione **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La dirección pública será `https://jorgeyarcecsp-code.github.io/JuzgadoUCentral/`. Regístrela en Supabase (paso 1.4).

### 4. Primer ingreso

1. Cree su usuario en el sitio con el correo de docente configurado. La cuenta recibe el rol de docente automáticamente.
2. Comparta la dirección con los estudiantes. Cada uno crea su usuario con el correo institucional, confirma el enlace recibido y espera la asignación de rol.
3. En **Administración**, preasigne los roles por correo (el estudiante los recibe al registrarse) o asígnelos a los usuarios ya registrados, y registre los datos del despacho simulado.

## Actualizar el catálogo de actuaciones

El catálogo vive en `js/catalogo.js`. Si lo modifica, regenere el archivo SQL y vuelva a ejecutarlo en Supabase:

```
node supabase/generar_catalogo.js > supabase/02_catalogo.sql
```

## Protección de datos personales

El aviso de privacidad del sitio identifica como responsable a la Universidad Central, con base en:

- la Ley 1581 de 2012, artículos 9 y 12;
- el Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015;
- la Política de Protección de Datos Personales de la Universidad (Acuerdo del Consejo Superior 16 de 2018, modificado por el Acuerdo 13 de 2023).

Valide el texto con la Secretaría General antes de abrir el registro. La consulta pública no muestra nombres de usuarios, correos, firmantes ni documentos.
