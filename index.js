const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const bd = require('./BD/base-datos');

const servidor = express();
servidor.use(cors());
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
// VALIDACIONES
// ==========================================
const NOMBRE_USUARIO_REGEX = /^[a-zA-Z0-9._-]+$/;

const esNombreUsuarioValido = (usuario) => {
    return (
        typeof usuario === 'string' &&
        usuario.length >= 3 &&
        usuario.length <= 30 &&
        NOMBRE_USUARIO_REGEX.test(usuario)
    );
};

const normalizarUsuario = (usuario) => {
    if (typeof usuario !== 'string') return null;

    const usuarioNormalizado = usuario.trim();
    return esNombreUsuarioValido(usuarioNormalizado)
        ? usuarioNormalizado
        : null;
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
        const { usuario, contrasena } = solicitud.body;
        const usuarioNormalizado = normalizarUsuario(usuario);

        if (!usuario || !contrasena) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El nombre de usuario y la contraseña son obligatorios.'
            });
        }

        if (!usuarioNormalizado) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje:
                    'El nombre de usuario debe tener entre 3 y 30 caracteres y solo puede contener letras, números, puntos, guiones y guiones bajos.'
            });
        }

        const consultaExistente = `SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER(?)`;
        bd.get(consultaExistente, [usuarioNormalizado], async (error, usuarioExistente) => {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al registrar el usuario.'
                });
            }

            if (usuarioExistente) {
                return respuesta.status(400).json({
                    estado: 'error',
                    mensaje: 'El nombre de usuario ya está registrado.'
                });
            }

            try {
                const saltRounds = 10;
                const contrasenaEncriptada = await bcrypt.hash(contrasena, saltRounds);

                const consulta = `INSERT INTO usuarios (usuario, contrasena) VALUES (?, ?)`;
                bd.run(consulta, [usuarioNormalizado, contrasenaEncriptada], function (errorInsercion) {
                    if (errorInsercion) {
                        if (errorInsercion.message.includes('SQLITE_CONSTRAINT')) {
                            return respuesta.status(400).json({
                                estado: 'error',
                                mensaje: 'El nombre de usuario ya está registrado.'
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
            } catch (errorEncriptacion) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al registrar el usuario.'
                });
            }
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
        const { usuario, contrasena } = solicitud.body;
        const usuarioNormalizado = normalizarUsuario(usuario);

        if (!usuario || !contrasena) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El nombre de usuario y la contraseña son obligatorios.'
            });
        }

        if (!usuarioNormalizado) {
            return respuesta.status(400).json({
                estado: 'error',
                mensaje: 'El nombre de usuario no es válido.'
            });
        }

        const consulta = `SELECT * FROM usuarios WHERE LOWER(usuario) = LOWER(?)`;
        bd.get(consulta, [usuarioNormalizado], async (error, usuarioEncontrado) => {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno en el servidor.'
                });
            }

            if (!usuarioEncontrado) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

            const esContrasenaValida = await bcrypt.compare(
                contrasena,
                usuarioEncontrado.contrasena
            );
            if (!esContrasenaValida) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'Credenciales inválidas.'
                });
            }

            const token = jwt.sign(
                {
                    idUsuario: usuarioEncontrado.id,
                    usuario: usuarioEncontrado.usuario
                },
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

// ==========================================
// SERVIDOR HTTP Y SOCKET.IO
// ==========================================
const servidorHttp = http.createServer(servidor);

const io = new Server(servidorHttp, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware de autenticación para Socket.io
io.use((socket, siguiente) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;

    if (!token) {
        return siguiente(new Error('Acceso denegado. Token de autenticación requerido.'));
    }

    jwt.verify(token, CLAVE_SECRETA_JWT, (error, usuarioDecodificado) => {
        if (error) {
            return siguiente(new Error('Token inválido o expirado.'));
        }

        // Guardar los datos del usuario en el objeto socket
        socket.usuario = usuarioDecodificado;
        siguiente();
    });
});

// ==========================================
// GESTIÓN DE SALAS DE JUEGO (MEMORIA)
// ==========================================
const salas = new Map();

const CARACTERES_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_JUGADORES = 5;
const MIN_JUGADORES = 2;

const generarCodigoSala = () => {
    let codigo;
    do {
        codigo = '';
        for (let i = 0; i < 6; i++) {
            codigo += CARACTERES_CODIGO.charAt(
                Math.floor(Math.random() * CARACTERES_CODIGO.length)
            );
        }
    } while (salas.has(codigo));
    return codigo;
};

const calcularPuntosParaGanar = (cantidadJugadores) => {
    if (cantidadJugadores === 2) return 26;
    if (cantidadJugadores === 3) return 24;
    if (cantidadJugadores === 4) return 22;
    if (cantidadJugadores === 5) return 20;
    return null;
};

const normalizarCodigoSala = (codigo) => {
    if (typeof codigo !== 'string') return null;

    const codigoNormalizado = codigo.trim().toUpperCase();
    return codigoNormalizado || null;
};

const obtenerCodigoSala = (datos) => {
    if (typeof datos === 'string') {
        return normalizarCodigoSala(datos);
    }

    if (datos && typeof datos === 'object') {
        return normalizarCodigoSala(
            datos.codigoSala || datos.sala || datos.codigo
        );
    }

    return null;
};

const crearJugadorSala = (socket) => ({
    socketId: socket.id,
    idUsuario: socket.usuario.idUsuario,
    usuario: socket.usuario.usuario,
    puntuacion: 0
});

const crearSalaParaSocket = (socket) => {
    const codigo = generarCodigoSala();
    const sala = {
        codigo,
        anfitrion: socket.id,
        iniciada: false,
        puntosParaGanar: null,
        ganador: null,
        jugadores: [crearJugadorSala(socket)]
    };

    salas.set(codigo, sala);
    return sala;
};

const buscarSala = (codigo) => salas.get(normalizarCodigoSala(codigo));

const buscarJugadorEnSala = (sala, socketId) =>
    sala.jugadores.find((jugador) => jugador.socketId === socketId);

const agregarJugadorASala = (sala, socket) => {
    if (sala.iniciada) {
        return 'La partida ya inició.';
    }

    if (sala.jugadores.length >= MAX_JUGADORES) {
        return 'La sala está llena.';
    }

    if (buscarJugadorEnSala(sala, socket.id)) {
        return 'Ya estás en esta sala.';
    }

    sala.jugadores.push(crearJugadorSala(socket));
    return null;
};

const iniciarPartidaEnSala = (sala, socketId) => {
    if (sala.anfitrion !== socketId) {
        return 'Solo el anfitrión puede iniciar la partida.';
    }

    if (sala.iniciada) {
        return 'La partida ya inició.';
    }

    if (sala.jugadores.length < MIN_JUGADORES) {
        return 'Se necesitan al menos 2 jugadores para iniciar.';
    }

    sala.iniciada = true;
    sala.puntosParaGanar = calcularPuntosParaGanar(sala.jugadores.length);
    sala.jugadores.forEach((jugador) => {
        jugador.puntuacion = 0;
    });

    return null;
};

const actualizarPuntuacionEnSala = (sala, socketId, puntuacion) => {
    const jugador = buscarJugadorEnSala(sala, socketId);

    if (!jugador) {
        return { error: 'No perteneces a esta sala.', gano: false };
    }

    if (!sala.iniciada) {
        return { error: 'La partida no ha iniciado.', gano: false };
    }

    if (sala.ganador) {
        return { error: 'La partida ya terminó.', gano: false };
    }

    const valor = Number(puntuacion);
    if (!Number.isFinite(valor)) {
        return { error: 'Puntuación inválida.', gano: false };
    }

    jugador.puntuacion = Math.max(0, Math.trunc(valor));

    if (jugador.puntuacion >= sala.puntosParaGanar) {
        sala.ganador = {
            socketId: jugador.socketId,
            usuario: jugador.usuario,
            puntuacion: jugador.puntuacion
        };
    }

    return {
        error: null,
        gano: Boolean(sala.ganador),
        ganador: sala.ganador
    };
};

const salirDeSala = (sala, socketId) => {
    const indice = sala.jugadores.findIndex(
        (jugador) => jugador.socketId === socketId
    );

    if (indice === -1) return null;

    const [jugador] = sala.jugadores.splice(indice, 1);

    if (sala.jugadores.length === 0) {
        salas.delete(sala.codigo);
        return {
            jugador,
            salaEliminada: true,
            ganador: null,
            anfitrion: null
        };
    }

    if (sala.anfitrion === socketId) {
        sala.anfitrion = sala.jugadores[0].socketId;
    }

    let ganador = null;
    if (sala.iniciada && !sala.ganador && sala.jugadores.length === 1) {
        const restante = sala.jugadores[0];
        sala.ganador = {
            socketId: restante.socketId,
            usuario: restante.usuario,
            puntuacion: restante.puntuacion
        };
        ganador = sala.ganador;
    }

    return {
        jugador,
        salaEliminada: false,
        ganador,
        anfitrion: sala.anfitrion
    };
};

const construirSalaActualizada = (sala) => ({
    codigo: sala.codigo,
    anfitrion: sala.anfitrion,
    jugadores: sala.jugadores,
    iniciada: sala.iniciada,
    puntosParaGanar: sala.puntosParaGanar,
    ganador: sala.ganador
});

const construirPuntuaciones = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    jugadores: sala.jugadores,
    puntosParaGanar: sala.puntosParaGanar
});

const construirPartidaGanada = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    ganador: sala.ganador,
    jugadores: sala.jugadores,
    puntosParaGanar: sala.puntosParaGanar
});

const construirPartidaLista = (sala, socketId) => ({
    estado: 'exito',
    codigo: sala.codigo,
    jugadores: sala.jugadores,
    anfitrion: sala.anfitrion,
    puntosParaGanar: sala.puntosParaGanar,
    tuSocketId: socketId
});

const emitirSalaActualizada = (sala) => {
    io.to(sala.codigo).emit(
        'sala_actualizada',
        construirSalaActualizada(sala)
    );
};

const construirEventoSalida = (sala, jugador, anfitrion) => ({
    estado: 'exito',
    codigo: sala.codigo,
    jugador,
    anfitrion,
    jugadores: sala.jugadores
});

const manejarSalidaJugador = (socket, codigoSala, motivo) => {
    const codigo = normalizarCodigoSala(codigoSala);
    const sala = buscarSala(codigo);

    if (!sala) return;

    const cantidadAntes = sala.jugadores.length;
    const estabaIniciada = sala.iniciada;
    const resultado = salirDeSala(sala, socket.id);

    if (!resultado) return;

    socket.leave(codigo);

    if (resultado.salaEliminada) return;

    const eventoSalida = construirEventoSalida(
        sala,
        resultado.jugador,
        resultado.anfitrion
    );

    if (resultado.ganador) {
        io.to(codigo).emit('partida_ganada', construirPartidaGanada(sala));

        if (cantidadAntes === 2) {
            if (motivo === 'concedio') {
                socket.to(codigo).emit('rival_concedio');
            } else {
                socket.to(codigo).emit('rival_desconectado');
            }
        } else if (motivo === 'concedio') {
            socket.to(codigo).emit('jugador_concedio', eventoSalida);
        } else {
            socket.to(codigo).emit('jugador_desconectado', eventoSalida);
        }
    } else if (estabaIniciada && cantidadAntes > 2) {
        if (motivo === 'concedio') {
            socket.to(codigo).emit('jugador_concedio', eventoSalida);
        } else {
            socket.to(codigo).emit('jugador_desconectado', eventoSalida);
        }
    }

    emitirSalaActualizada(sala);
};

io.on('connection', (socket) => {
    console.log(
        `Usuario conectado: ${socket.usuario.usuario} (id: ${socket.usuario.idUsuario})`
    );

    socket.on('crear_sala', () => {
        const sala = crearSalaParaSocket(socket);

        socket.join(sala.codigo);
        socket.emit('sala_creada', sala.codigo);
        emitirSalaActualizada(sala);

        console.log(
            `Sala ${sala.codigo} creada por ${socket.usuario.usuario} (${socket.id})`
        );
    });

    socket.on('unirse_sala', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        const error = agregarJugadorASala(sala, socket);
        if (error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: error
            });
        }

        socket.join(sala.codigo);
        emitirSalaActualizada(sala);

        console.log(
            `Usuario ${socket.usuario.usuario} (${socket.id}) se unió a la sala ${sala.codigo}`
        );
    });

    socket.on('iniciar_partida', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        if (!buscarJugadorEnSala(sala, socket.id)) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'No perteneces a esta sala.'
            });
        }

        const error = iniciarPartidaEnSala(sala, socket.id);
        if (error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: error
            });
        }

        sala.jugadores.forEach((jugador) => {
            io.to(jugador.socketId).emit(
                'partida_lista',
                construirPartidaLista(sala, jugador.socketId)
            );
        });
        emitirSalaActualizada(sala);

        console.log(
            `Partida iniciada en la sala ${sala.codigo} por ${socket.usuario.usuario}`
        );
    });

    socket.on('movimiento_tablero', (datos, codigoSala) => {
        const codigo = normalizarCodigoSala(codigoSala) ||
            obtenerCodigoSala(datos);

        if (!codigo) return;

        const sala = buscarSala(codigo);
        if (!sala) return;

        if (!buscarJugadorEnSala(sala, socket.id)) return;

        socket.to(codigo).emit('movimiento_recibido', datos);
    });

    socket.on('puntuacion_actualizada', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        const resultado = actualizarPuntuacionEnSala(
            sala,
            socket.id,
            datos && datos.puntuacion
        );

        if (resultado.error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: resultado.error
            });
        }

        io.to(codigo).emit(
            'puntuaciones_actualizadas',
            construirPuntuaciones(sala)
        );

        if (resultado.gano) {
            io.to(codigo).emit(
                'partida_ganada',
                construirPartidaGanada(sala)
            );
        }
    });

    socket.on('conceder_partida', (codigoSala) => {
        manejarSalidaJugador(socket, codigoSala, 'concedio');
    });

    socket.on('disconnect', (motivo) => {
        const salasDelJugador = [...salas.values()].filter((sala) =>
            buscarJugadorEnSala(sala, socket.id)
        );

        salasDelJugador.forEach((sala) => {
            manejarSalidaJugador(socket, sala.codigo, 'desconectado');
        });

        console.log(
            `Usuario desconectado: ${socket.usuario.usuario} (id: ${socket.usuario.idUsuario}). Motivo: ${motivo}`
        );
    });
});

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PUERTO || 3000;
    servidorHttp.listen(PUERTO, () => {
        console.log(`Servidor corriendo en el puerto ${PUERTO}`);
    });
}

module.exports = servidorHttp;
module.exports.io = io;
module.exports.salas = salas;
module.exports.MAX_JUGADORES = MAX_JUGADORES;
module.exports.MIN_JUGADORES = MIN_JUGADORES;
module.exports.calcularPuntosParaGanar = calcularPuntosParaGanar;
module.exports.normalizarCodigoSala = normalizarCodigoSala;
module.exports.obtenerCodigoSala = obtenerCodigoSala;
module.exports.crearSalaParaSocket = crearSalaParaSocket;
module.exports.buscarSala = buscarSala;
module.exports.buscarJugadorEnSala = buscarJugadorEnSala;
module.exports.agregarJugadorASala = agregarJugadorASala;
module.exports.iniciarPartidaEnSala = iniciarPartidaEnSala;
module.exports.actualizarPuntuacionEnSala = actualizarPuntuacionEnSala;
module.exports.salirDeSala = salirDeSala;
module.exports.construirSalaActualizada = construirSalaActualizada;
module.exports.construirPartidaLista = construirPartidaLista;
module.exports.construirPuntuaciones = construirPuntuaciones;
module.exports.construirPartidaGanada = construirPartidaGanada;