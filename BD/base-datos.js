const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ruta del archivo de la base de datos. Configurable mediante DB_PATH para
// entornos con filesystem efímero (Render/Railway): apunta a un disco
// persistente montado, p. ej. DB_PATH=/var/data/usuarios.db.
const rutaBaseDatos =
    process.env.DB_PATH || path.join(__dirname, 'usuarios.db');

// Garantiza que exista el directorio destino antes de abrir la base de datos.
fs.mkdirSync(path.dirname(rutaBaseDatos), { recursive: true });

const bd = new sqlite3.Database(rutaBaseDatos, (error) => {
    if (error) {
        console.error('Error al conectar con la base de datos:', error.message);
    }
});

// Inicializar la tabla de usuarios
bd.serialize(() => {
    bd.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE NOT NULL,
            contrasena TEXT NOT NULL
        )
    `);

    // Migrar bases de datos existentes que aún usan la columna "correo"
    bd.all(`PRAGMA table_info(usuarios)`, (error, columnas) => {
        if (!error && columnas) {
            const nombresColumnas = columnas.map((columna) => columna.name);
            if (
                nombresColumnas.includes('correo') &&
                !nombresColumnas.includes('usuario')
            ) {
                bd.run(`ALTER TABLE usuarios RENAME COLUMN correo TO usuario`);
            }
        }

        // Migración opcional: eliminar espacios accidentales de registros antiguos
        bd.run(
            `UPDATE usuarios SET usuario = TRIM(usuario) WHERE usuario <> TRIM(usuario)`,
            (errorLimpieza) => {
                if (errorLimpieza) {
                    console.warn(
                        'No se pudieron normalizar los usuarios existentes:',
                        errorLimpieza.message
                    );
                }
            }
        );

        // Índice único case-insensitive para evitar cuentas duplicadas
        bd.run(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_nocase ON usuarios(LOWER(usuario))`,
            (errorIndice) => {
                if (errorIndice) {
                    console.warn(
                        'No se pudo crear el índice case-insensitive de usuarios:',
                        errorIndice.message
                    );
                }
            }
        );
    });
});

module.exports = bd;