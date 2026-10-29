const express = require('express');
const bcrypt = require('bcrypt');
const bd = require('./BD/base-datos');

const servidor = express();
servidor.use(express.json());

// Controlador para la ruta de verificación de estado
const manejarPruebaEstado = (solicitud, respuesta) => {
    respuesta.json({
        estado: 'exito',
        mensaje: 'Servidor de autenticación funcionando correctamente 🚀'
    });
};

// Controlador para el registro de nuevos usuarios
const manejarRegistroUsuario = async (solicitud, respuesta) => {
    try {
        const { correo, contrasena } = solicitud.body;

        // Validación básica de campos vacíos
        if (!correo || !contrasena) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El correo y la contraseña son obligatorios.'
            });
        }

        // Encriptar la contraseña de manera segura
        const saltRounds = 10;
        const contrasenaEncriptada = await bcrypt.hash(contrasena, saltRounds);

        // Insertar en la base de datos
        const consulta = `INSERT INTO usuarios (correo, contrasena) VALUES (?, ?)`;
        bd.run(consulta, [correo, contrasenaEncriptada], function (error) {
            if (error) {
                // Código SQL para violación de restricción UNIQUE (correo duplicado)
                if (error.message.includes('SQLITE_CONSTRAINT')) {
                    return respuesta.status(400).json({
                        estado: 'error',
                        mensaje: 'El correo electrónico ya está registrado.'
                    });
                }
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al registrar el usuario.'
                });
            }

            return respuesta.status(201).json({
                estado: 'exito',
                mensaje: 'Usuario registrado exitosamente',
                idUsuario: this.lastID
            });
        });
    } catch (error) {
        return respuesta.status(500).json({
            estado: 'error',
            mensaje: 'Error en el servidor durante el registro.'
        });
    }
};

// Definición de rutas
servidor.get('/ping', manejarPruebaEstado);
servidor.post('/register', manejarRegistroUsuario);

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PUERTO || 3000;
    servidor.listen(PUERTO, () => {
        console.log(`Servidor corriendo en el puerto ${PUERTO}`);
    });
}

module.exports = servidor;