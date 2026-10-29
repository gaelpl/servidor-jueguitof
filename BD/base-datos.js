const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Definir la ruta del archivo de la base de datos dentro de la carpeta BD
const rutaBaseDatos = path.join(__dirname, 'usuarios.db');
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
            correo TEXT UNIQUE NOT NULL,
            contrasena TEXT NOT NULL
        )
    `);
});

module.exports = bd;