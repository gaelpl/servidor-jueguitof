const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bd = require('./BD/base-datos');

const servidor = express();
servidor.use(express.json());

// Clave secreta para firmar los tokens
const CLAVE_SECRETA_JWT = 'clave_secreta_super_segura_123';

// ==========================================
// MIDDLEWARES DE SEGURIDAD
// ==========================================
const verificarTokenJWT = (solicitud, respuesta, siguiente) => {
    const cabeceraAuth = solicitud.headers['authorization'];
    const token = cabeceraAuth && cabeceraAuth.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (!token) {
        return respuesta.status(401).json({
            estado: 'error',
            mensaje: 'Acceso denegado. Token de autenticación requerido.'
        });
    }

    jwt.verify(token, CLAVE_SECRETA_JWT, (error, usuarioDecodificado) => {
        if (error) {
            return respuesta.status(403).json({
                estado: 'error',
                mensaje: 'Token inválido o expirado.'
            });
        }

        // Adjuntar los datos del usuario decodificados a la solicitud
        solicitud.usuario = usuarioDecodificado;
        siguiente();
    });
};

// ==========================================
// CONTROLADORES
// ==========================================

const manejarPruebaEstado = (solicitud, respuesta) => {
    respuesta.json({
        estado: 'exito',
        mensaje: 'Servidor de autenticación funcionando correctamente 🚀'
    });
};

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

            if (!usuario) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

            const esContrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
            if (!esContrasenaValida) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

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

// Controlador para eliminar cuenta (Ruta protegida)
const manejarEliminarCuenta = (solicitud, respuesta) => {
    try {
        const idUsuario = solicitud.usuario.idUsuario;

        const consulta = `DELETE FROM usuarios WHERE id = ?`;
        bd.run(consulta, [idUsuario], function (error) {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al eliminar la cuenta.'
                });
            }

            if (this.changes === 0) {
                return respuesta.status(404).json({
                    estado: 'error',
                    mensaje: 'Usuario no encontrado.'
                });
            }

            return respuesta.status(200).json({
                estado: 'exito',
                mensaje: 'Cuenta eliminada exitosamente.'
            });
        });
    } catch (error) {
        return respuesta.status(500).json({
            estado: 'error',
            mensaje: 'Error en el servidor al eliminar la cuenta.'
        });
    }
};

// ==========================================
// DEFINICIÓN DE RUTAS
// ==========================================
servidor.get('/ping', manejarPruebaEstado);
servidor.post('/register', manejarRegistroUsuario);
servidor.post('/login', manejarInicioSesion);
servidor.delete('/account', verificarTokenJWT, manejarEliminarCuenta);

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PUERTO || 3000;
    servidor.listen(PUERTO, () => {
        console.log(`Servidor corriendo en el puerto ${PUERTO}`);
    });
}

module.exports = servidor;