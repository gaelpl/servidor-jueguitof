const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bd = require('./BD/base-datos');

const servidor = express();
servidor.use(express.json());

// Clave secreta para firmar los tokens (en un entorno de producción va en variables de entorno .env)
const CLAVE_SECRETA_JWT = 'clave_secreta_super_segura_123';

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

        if (!correo || !contrasena) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El correo y la contraseña son obligatorios.'
            });
        }

        const saltRounds = 10;
        const contrasenaEncriptada = await bcrypt.hash(contrasena, saltRounds);

        const consulta = `INSERT INTO usuarios (correo, contrasena) VALUES (?, ?)`;
        bd.run(consulta, [correo, contrasenaEncriptada], function (error) {
            if (error) {
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

// Controlador para el inicio de sesión (Login)
const manejarInicioSesion = async (solicitud, respuesta) => {
    try {
        const { correo, contrasena } = solicitud.body;

        if (!correo || !contrasena) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El correo y la contraseña son obligatorios.'
            });
        }

        const consulta = `SELECT * FROM usuarios WHERE correo = ?`;
        bd.get(consulta, [correo], async (error, usuario) => {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno en el servidor.'
                });
            }

            // Validar si el usuario existe
            if (!usuario) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

            // Comparar la contraseña ingresada con el hash de la base de datos
            const esContrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
            if (!esContrasenaValida) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

            // Generar el Token JWT con vigencia de 24 horas
            const token = jwt.sign(
                { idUsuario: usuario.id, correo: usuario.correo },
                CLAVE_SECRETA_JWT,
                { expiresIn: '24h' }
            );

            return respuesta.status(200).json({
                estado: 'exito',
                mensaje: 'Inicio de sesión exitoso',
                token: token
            });
        });
    } catch (error) {
        return respuesta.status(500).json({
            estado: 'error',
            mensaje: 'Error en el servidor durante el login.'
        });
    }
};

// Definición de rutas
servidor.get('/ping', manejarPruebaEstado);
servidor.post('/register', manejarRegistroUsuario);
servidor.post('/login', manejarInicioSesion);

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PUERTO || 3000;
    servidor.listen(PUERTO, () => {
        console.log(`Servidor corriendo en el puerto ${PUERTO}`);
    });
}

module.exports = servidor;