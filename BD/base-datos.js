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
        const nombresColumnas =
            !error && columnas ? columnas.map((columna) => columna.name) : [];
        if (
            nombresColumnas.includes('correo') &&
            !nombresColumnas.includes('usuario')
        ) {
            bd.run(`ALTER TABLE usuarios RENAME COLUMN correo TO usuario`);
            nombresColumnas.push('usuario');
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

        const columnasRanked = [
            { nombre: 'rp', definicion: 'INTEGER NOT NULL DEFAULT 0' },
            { nombre: 'partidas_ranked', definicion: 'INTEGER NOT NULL DEFAULT 0' },
            { nombre: 'victorias_ranked', definicion: 'INTEGER NOT NULL DEFAULT 0' },
            { nombre: 'derrotas_ranked', definicion: 'INTEGER NOT NULL DEFAULT 0' }
        ];

        columnasRanked.forEach(({ nombre, definicion }) => {
            if (!nombresColumnas.includes(nombre)) {
                bd.run(
                    `ALTER TABLE usuarios ADD COLUMN ${nombre} ${definicion}`,
                    (errorColumna) => {
                        if (errorColumna) {
                            console.warn(
                                `No se pudo agregar la columna ${nombre}:`,
                                errorColumna.message
                            );
                        }
                    }
                );
            }
        });

        bd.run(`
            CREATE TABLE IF NOT EXISTS partidas (
                id_partida TEXT PRIMARY KEY,
                codigo_sala TEXT NOT NULL,
                numero_mapa INTEGER NOT NULL,
                iniciada_en TEXT NOT NULL,
                finalizada_en TEXT,
                motivo_fin TEXT,
                asentada INTEGER NOT NULL DEFAULT 0,
                ganador_id_usuario INTEGER
            )
        `);

        bd.run(`
            CREATE TABLE IF NOT EXISTS partida_jugadores (
                id_partida TEXT NOT NULL,
                id_usuario INTEGER NOT NULL,
                posicion_desde INTEGER NOT NULL,
                posicion_hasta INTEGER NOT NULL,
                puesto_mostrado INTEGER NOT NULL,
                puntuacion INTEGER NOT NULL DEFAULT 0,
                rp_antes INTEGER NOT NULL DEFAULT 0,
                rp_delta INTEGER NOT NULL DEFAULT 0,
                rp_despues INTEGER NOT NULL DEFAULT 0,
                liga_antes TEXT NOT NULL,
                liga_despues TEXT NOT NULL,
                resultado TEXT NOT NULL,
                PRIMARY KEY (id_partida, id_usuario),
                FOREIGN KEY (id_partida) REFERENCES partidas(id_partida)
            )
        `);

        bd.run(
            `CREATE INDEX IF NOT EXISTS idx_usuarios_clasificacion ON usuarios(rp DESC, victorias_ranked DESC, id ASC)`
        );
        bd.run(
            `CREATE INDEX IF NOT EXISTS idx_partidas_asentada ON partidas(asentada)`
        );
        bd.run(`PRAGMA user_version = 1`);
    });
});

module.exports = bd;