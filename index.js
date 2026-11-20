const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const bd = require('./BD/base-datos');
const {
    normalizarNumeroMapa,
    esRegionValidaParaMapa,
    obtenerPuntosRegion
} = require('./config/regiones');
const {
    comoEntero,
    obtenerLiga,
    obtenerDivision,
    obtenerProgresoLiga,
    asignarPuestosPorOrden
} = require('./config/rangos');

const servidor = express();

// Origen permitido para CORS. En producción define CORS_ORIGIN con el
// dominio del frontend (p. ej. https://tu-app.vercel.app).
const ORIGEN_PERMITIDO = process.env.CORS_ORIGIN || '*';

servidor.use(cors({ origin: ORIGEN_PERMITIDO }));
servidor.use(express.json());

// Clave secreta para firmar los tokens
const CLAVE_SECRETA_JWT =
    process.env.JWT_SECRET || 'clave_secreta_super_segura_123';

const crearTokenUsuario = (idUsuario, usuario) =>
    jwt.sign({ idUsuario, usuario }, CLAVE_SECRETA_JWT, { expiresIn: '24h' });

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

const verificarTokenOpcional = (solicitud, respuesta, siguiente) => {
    const cabeceraAuth = solicitud.headers['authorization'];
    const token = cabeceraAuth && cabeceraAuth.split(' ')[1];

    if (!token) {
        solicitud.usuario = null;
        return siguiente();
    }

    jwt.verify(token, CLAVE_SECRETA_JWT, (error, usuarioDecodificado) => {
        solicitud.usuario = error ? null : usuarioDecodificado;
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

                    const token = crearTokenUsuario(
                        this.lastID,
                        usuarioNormalizado
                    );

                    return respuesta.status(201).json({
                        estado: 'exito',
                        mensaje: 'Usuario registrado exitosamente',
                        idUsuario: this.lastID,
                        token
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

            const token = crearTokenUsuario(
                usuarioEncontrado.id,
                usuarioEncontrado.usuario
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

// Valida que el token siga correspondiendo a una cuenta existente.
const manejarValidarSesion = (solicitud, respuesta) => {
    const idUsuario = solicitud.usuario && solicitud.usuario.idUsuario;

    if (!idUsuario) {
        return respuesta.status(401).json({
            estado: 'error',
            mensaje: 'Sesión no válida.'
        });
    }

    bd.get(
        'SELECT id, usuario FROM usuarios WHERE id = ?',
        [idUsuario],
        (error, usuarioEncontrado) => {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al validar la sesión.'
                });
            }

            if (!usuarioEncontrado) {
                return respuesta.status(401).json({
                    estado: 'error',
                    mensaje: 'La cuenta asociada a esta sesión ya no existe.'
                });
            }

            return respuesta.status(200).json({
                estado: 'exito',
                idUsuario: usuarioEncontrado.id,
                usuario: usuarioEncontrado.usuario
            });
        }
    );
};

const CONSULTA_CLASIFICACION =
    `SELECT id, usuario, rp, victorias_ranked, partidas_ranked ` +
    `FROM usuarios ORDER BY rp DESC, victorias_ranked DESC, partidas_ranked ASC, id ASC LIMIT ?`;

const CONSULTA_POSICION =
    `SELECT COUNT(*) AS posicion FROM usuarios WHERE rp > ? ` +
    `OR (rp = ? AND victorias_ranked > ?) ` +
    `OR (rp = ? AND victorias_ranked = ? AND partidas_ranked < ?) ` +
    `OR (rp = ? AND victorias_ranked = ? AND partidas_ranked = ? AND id < ?)`;

const crearEntradaClasificacion = (fila, posicion) => ({
    posicion,
    idUsuario: fila.id,
    usuario: fila.usuario,
    liga: obtenerLiga(fila.rp).nombre,
    division: obtenerDivision(fila.rp),
    rp: comoEntero(fila.rp),
    victorias: fila.victorias_ranked,
    partidas: fila.partidas_ranked
});

const manejarClasificacion = (solicitud, respuesta) => {
    const limiteSolicitado = Number(solicitud.query.limite);
    const limite =
        Number.isInteger(limiteSolicitado) && limiteSolicitado > 0
            ? Math.min(limiteSolicitado, 100)
            : 10;

    bd.all(CONSULTA_CLASIFICACION, [limite], (error, filas) => {
        if (error) {
            return respuesta.status(500).json({
                estado: 'error',
                mensaje: 'Error interno al consultar la clasificación.'
            });
        }

        const entradas = filas.map((fila, indice) =>
            crearEntradaClasificacion(fila, indice + 1)
        );
        const responder = (usuarioActual) =>
            respuesta.json({
                estado: 'exito',
                limite,
                total: entradas.length,
                entradas,
                usuarioActual
            });

        const idUsuario = solicitud.usuario && solicitud.usuario.idUsuario;
        if (!idUsuario) return responder(null);

        const consultaUsuario =
            `SELECT id, usuario, rp, victorias_ranked, partidas_ranked FROM usuarios WHERE id = ?`;
        bd.get(consultaUsuario, [idUsuario], (errorUsuario, filaUsuario) => {
            if (errorUsuario || !filaUsuario) return responder(null);

            const parametros = [
                filaUsuario.rp,
                filaUsuario.rp,
                filaUsuario.victorias_ranked,
                filaUsuario.rp,
                filaUsuario.victorias_ranked,
                filaUsuario.partidas_ranked,
                filaUsuario.rp,
                filaUsuario.victorias_ranked,
                filaUsuario.partidas_ranked,
                filaUsuario.id
            ];

            bd.get(CONSULTA_POSICION, parametros, (errorPosicion, filaPosicion) => {
                if (errorPosicion || !filaPosicion) return responder(null);
                responder(
                    crearEntradaClasificacion(
                        filaUsuario,
                        filaPosicion.posicion + 1
                    )
                );
            });
        });
    });
};

const manejarPerfilRanked = (solicitud, respuesta) => {
    const idUsuario = solicitud.usuario && solicitud.usuario.idUsuario;
    if (!idUsuario) {
        return respuesta.status(401).json({
            estado: 'error',
            mensaje: 'Sesión no válida.'
        });
    }

    bd.get(
        `SELECT id, usuario, rp, partidas_ranked, victorias_ranked, derrotas_ranked FROM usuarios WHERE id = ?`,
        [idUsuario],
        (error, fila) => {
            if (error) {
                return respuesta.status(500).json({
                    estado: 'error',
                    mensaje: 'Error interno al consultar el perfil.'
                });
            }

            if (!fila) {
                return respuesta.status(404).json({
                    estado: 'error',
                    mensaje: 'Usuario no encontrado.'
                });
            }

            respuesta.json({
                estado: 'exito',
                idUsuario: fila.id,
                usuario: fila.usuario,
                rp: comoEntero(fila.rp),
                liga: obtenerLiga(fila.rp).nombre,
                division: obtenerDivision(fila.rp),
                progreso: obtenerProgresoLiga(fila.rp),
                partidas: fila.partidas_ranked,
                victorias: fila.victorias_ranked,
                derrotas: fila.derrotas_ranked
            });
        }
    );
};

// ==========================================
// DEFINICIÓN DE RUTAS
// ==========================================
servidor.get('/ping', manejarPruebaEstado);
servidor.post('/register', manejarRegistroUsuario);
servidor.post('/login', manejarInicioSesion);
servidor.get('/session', verificarTokenJWT, manejarValidarSesion);
servidor.delete('/account', verificarTokenJWT, manejarEliminarCuenta);
servidor.get('/clasificacion', verificarTokenOpcional, manejarClasificacion);
servidor.get('/perfil', verificarTokenJWT, manejarPerfilRanked);

// ==========================================
// SERVIDOR HTTP Y SOCKET.IO
// ==========================================
const servidorHttp = http.createServer(servidor);

const io = new Server(servidorHttp, {
    cors: {
        origin: ORIGEN_PERMITIDO,
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

        bd.get(
            `SELECT id, usuario FROM usuarios WHERE id = ?`,
            [usuarioDecodificado.idUsuario],
            (errorConsulta, usuarioExistente) => {
                if (errorConsulta) {
                    return siguiente(new Error('Error interno de autenticación.'));
                }

                if (!usuarioExistente) {
                    return siguiente(
                        new Error('La cuenta asociada a esta sesión ya no existe.')
                    );
                }

                socket.usuario = {
                    idUsuario: usuarioExistente.id,
                    usuario: usuarioExistente.usuario
                };
                siguiente();
            }
        );
    });
});

// ==========================================
// GESTIÓN DE SALAS DE JUEGO (MEMORIA)
// ==========================================
const salas = new Map();

const CARACTERES_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_JUGADORES = 5;
const MIN_JUGADORES = 2;
const SEGUNDOS_POR_RONDA = 30;
const MILISEGUNDOS_POR_RONDA = SEGUNDOS_POR_RONDA * 1000;
const SEGUNDOS_GRACIA_RANKED = 25;
const MILISEGUNDOS_GRACIA_RANKED = SEGUNDOS_GRACIA_RANKED * 1000;

const normalizarModo = (modo) =>
    String(modo ?? '').trim().toLowerCase() === 'ranked' ? 'ranked' : 'casual';

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
    puntuacion: 0,
    listo: false,
    conectado: true
});

const crearSalaParaSocket = (socket, numeroMapa = 1, modo = 'casual') => {
    const codigo = generarCodigoSala();
    const mapa = normalizarNumeroMapa(numeroMapa);
    const sala = {
        codigo,
        idPartida: crypto.randomUUID(),
        modo: normalizarModo(modo),
        anfitrion: socket.id,
        numeroMapa: mapa,
        iniciada: false,
        puntosParaGanar: null,
        ganador: null,
        resultadoAsentado: false,
        jugadores: [crearJugadorSala(socket)],
        numeroRonda: 0,
        dadosRonda: null,
        accionesTurno: new Set(),
        jugadoresListos: new Set(),
        regionesReclamadas: new Map(),
        historialRegiones: [],
        tablerosPorSocket: new Map(),
        desconectados: new Map(),
        temporizadorRonda: null
    };

    sala.jugadoresListos.add(socket.id);
    sala.jugadores[0].listo = true;
    salas.set(codigo, sala);
    return sala;
};

const buscarSala = (codigo) => salas.get(normalizarCodigoSala(codigo));

const buscarJugadorEnSala = (sala, socketId) =>
    sala.jugadores.find((jugador) => jugador.socketId === socketId);

const cargarPerfilRanked = (sala, jugador) => {
    bd.get(
        `SELECT rp FROM usuarios WHERE id = ?`,
        [jugador.idUsuario],
        (error, fila) => {
            if (error || !fila) return;
            if (!sala.jugadores.includes(jugador)) return;

            jugador.rp = comoEntero(fila.rp);
            jugador.liga = obtenerLiga(jugador.rp).nombre;
            jugador.division = obtenerDivision(jugador.rp);
        }
    );
};

const detenerTemporizadorRonda = (sala) => {
    if (!sala || !sala.temporizadorRonda) return;

    clearTimeout(sala.temporizadorRonda);
    sala.temporizadorRonda = null;
};

const construirDadosLanzados = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    dado1: sala.dadosRonda.dado1,
    dado2: sala.dadosRonda.dado2,
    numeroRonda: sala.numeroRonda,
    anfitrion: sala.anfitrion,
    inicioRonda: sala.dadosRonda.inicioRonda,
    duracionRondaSegundos: SEGUNDOS_POR_RONDA,
    segundosRestantes: SEGUNDOS_POR_RONDA
});

const construirRondaLista = (sala, motivo) => ({
    estado: 'exito',
    codigo: sala.codigo,
    numeroRonda: sala.numeroRonda,
    anfitrion: sala.anfitrion,
    jugadores: sala.jugadores,
    puntosParaGanar: sala.puntosParaGanar,
    motivo
});

const finalizarRondaEnSala = (sala, motivo = 'completada') => {
    if (!sala || !sala.dadosRonda) return null;

    const evento = construirRondaLista(sala, motivo);
    detenerTemporizadorRonda(sala);
    sala.dadosRonda = null;
    sala.accionesTurno.clear();

    return evento;
};

const finalizarRondaPorTiempo = (sala) => {
    if (!sala || !sala.dadosRonda || sala.ganador) return null;

    sala.jugadores.forEach((jugador) => {
        sala.accionesTurno.add(jugador.socketId);
    });

    return finalizarRondaEnSala(sala, 'tiempo');
};

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

    if (
        sala.jugadores.some(
            (jugador) => jugador.idUsuario === socket.usuario.idUsuario
        )
    ) {
        return 'Ya estás en esta sala con otra conexión.';
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

    if (sala.jugadores.some((jugador) => jugador.conectado === false)) {
        return 'Todos los jugadores deben estar conectados para iniciar.';
    }

    if (!sala.jugadores.every((jugador) =>
        sala.jugadoresListos.has(jugador.socketId))) {
        return 'Todos los jugadores deben estar listos para iniciar.';
    }

    sala.iniciada = true;
    sala.puntosParaGanar = calcularPuntosParaGanar(sala.jugadores.length);
    sala.numeroRonda = 0;
    sala.dadosRonda = null;
    sala.accionesTurno.clear();
    sala.regionesReclamadas.clear();
    sala.historialRegiones = [];
    sala.tablerosPorSocket.clear();
    detenerTemporizadorRonda(sala);
    sala.jugadores.forEach((jugador) => {
        jugador.puntuacion = 0;
    });

    return null;
};

const lanzarDadosEnSala = (sala, socketId, random = Math.random) => {
    if (!sala) {
        return { error: 'La sala no existe.', evento: null };
    }

    if (sala.anfitrion !== socketId) {
        return {
            error: 'Solo el anfitrión puede lanzar los dados.',
            evento: null
        };
    }

    if (!sala.iniciada) {
        return { error: 'La partida no ha iniciado.', evento: null };
    }

    if (sala.jugadoresListos.size < sala.jugadores.length) {
        return {
            error: 'Esperando a que todos los jugadores estén listos.',
            evento: null
        };
    }

    if (sala.ganador) {
        return { error: 'La partida ya terminó.', evento: null };
    }

    if (sala.dadosRonda) {
        return {
            error: 'La ronda actual aún no ha terminado.',
            evento: null
        };
    }

    const dado1 = Math.floor(random() * 6) + 1;
    const dado2 = Math.floor(random() * 6) + 1;

    sala.numeroRonda += 1;
    sala.accionesTurno.clear();
    sala.dadosRonda = {
        dado1,
        dado2,
        inicioRonda: Date.now()
    };

    return { error: null, evento: construirDadosLanzados(sala) };
};

const registrarAccionTurnoEnSala = (sala, socketId) => {
    const jugador = sala ? buscarJugadorEnSala(sala, socketId) : null;

    if (!jugador) {
        return { error: 'No perteneces a esta sala.', rondaCompleta: false };
    }

    if (jugador.conectado === false) {
        return {
            error: 'Esperando a que se restablezca tu conexión.',
            rondaCompleta: false
        };
    }

    if (!sala.iniciada) {
        return { error: 'La partida no ha iniciado.', rondaCompleta: false };
    }

    if (sala.ganador) {
        return { error: 'La partida ya terminó.', rondaCompleta: false };
    }

    if (!sala.dadosRonda) {
        return {
            error: 'Debes esperar el lanzamiento de dados del anfitrión.',
            rondaCompleta: false
        };
    }

    if (sala.accionesTurno.has(socketId)) {
        return {
            error: 'Ya completaste tu acción en esta ronda.',
            rondaCompleta: false
        };
    }

    sala.accionesTurno.add(socketId);

    const rondaCompleta =
        sala.jugadores.length > 0 &&
        sala.jugadores.every((jugadorSala) =>
            sala.accionesTurno.has(jugadorSala.socketId)
        );

    return { error: null, rondaCompleta };
};

const esTableroValidoParaRanked = (tablero) => {
    if (!tablero || !Array.isArray(tablero.celdas) || tablero.celdas.length !== 49) {
        return false;
    }

    const numeroMapa = Number(tablero.numeroMapa);
    if (!Number.isInteger(numeroMapa) || numeroMapa < 1 || numeroMapa > 4) {
        return false;
    }

    const valoresEstrella = tablero.celdas
        .filter((celda) => celda && celda.esEstrella === true)
        .map((celda) => celda.valor)
        .sort((a, b) => a - b);

    return (
        valoresEstrella.length === 6 &&
        valoresEstrella.every((valor, indice) => valor === indice + 1)
    );
};

const reclamarRegionEnSala = (sala, idSocket, region) => {
    const jugador = sala ? buscarJugadorEnSala(sala, idSocket) : null;

    if (!jugador) {
        return { error: 'No perteneces a esta sala.', gano: false };
    }

    if (jugador.conectado === false) {
        return {
            error: 'Esperando a que se restablezca tu conexión.',
            gano: false
        };
    }

    if (!sala.iniciada) {
        return { error: 'La partida no ha iniciado.', gano: false };
    }

    if (sala.ganador) {
        return { error: 'La partida ya terminó.', gano: false };
    }

    if (sala.modo === 'ranked') {
        if (!sala.dadosRonda) {
            return {
                error: 'Debes esperar al lanzamiento de dados del anfitrión.',
                gano: false
            };
        }

        if (sala.accionesTurno.has(idSocket)) {
            return {
                error: 'Ya completaste tu acción en esta ronda.',
                gano: false
            };
        }

        const tablero = sala.tablerosPorSocket.get(idSocket);
        if (
            tablero &&
            !tablero.celdas.some((celda) => celda.region === region)
        ) {
            return {
                error: 'La región no está en tu tablero.',
                gano: false
            };
        }
    }

    if (typeof region !== 'string' || !esRegionValidaParaMapa(sala.numeroMapa, region)) {
        return { error: 'Región inválida para este mapa.', gano: false };
    }

    const reclamaciones = sala.regionesReclamadas.get(region) || [];

    if (reclamaciones.some((reclamacion) => reclamacion.socketId === idSocket)) {
        return {
            error: 'Ya completaste esta región en esta partida.',
            gano: false
        };
    }

    const puesto = reclamaciones.length + 1;
    const puntos = obtenerPuntosRegion(region, puesto);

    reclamaciones.push({
        socketId: jugador.socketId,
        usuario: jugador.usuario,
        puesto,
        puntos
    });
    sala.regionesReclamadas.set(region, reclamaciones);

    jugador.puntuacion += puntos;

    const registro = {
        region,
        socketId: jugador.socketId,
        usuario: jugador.usuario,
        puesto,
        puntos,
        numeroRonda: sala.numeroRonda
    };
    sala.historialRegiones.push(registro);

    if (jugador.puntuacion >= sala.puntosParaGanar) {
        sala.ganador = {
            socketId: jugador.socketId,
            usuario: jugador.usuario,
            puntuacion: jugador.puntuacion
        };
        detenerTemporizadorRonda(sala);
    }

    return {
        error: null,
        gano: Boolean(sala.ganador),
        ganador: sala.ganador,
        region: registro
    };
};

const transferirAnfitrion = (sala, idSocketSaliente) => {
    if (sala.anfitrion !== idSocketSaliente) return;

    sala.anfitrion = sala.jugadores.length > 0
        ? sala.jugadores[0].socketId
        : null;

    if (sala.anfitrion) {
        sala.jugadoresListos.add(sala.anfitrion);
        sala.jugadores[0].listo = true;
    }
};

const salirDeSala = (sala, idSocket) => {
    const indice = sala.jugadores.findIndex(
        (jugador) => jugador.socketId === idSocket
    );

    if (indice === -1) return null;

    const [jugador] = sala.jugadores.splice(indice, 1);
    sala.accionesTurno.delete(idSocket);
    sala.jugadoresListos.delete(idSocket);
    sala.tablerosPorSocket.delete(idSocket);

    if (sala.jugadores.length === 0) {
        detenerTemporizadorRonda(sala);
        salas.delete(sala.codigo);
        return {
            jugador,
            salaEliminada: true,
            ganador: null,
            anfitrion: null
        };
    }

    transferirAnfitrion(sala, idSocket);

    let ganador = null;
    if (sala.iniciada && !sala.ganador && sala.jugadores.length === 1) {
        const restante = sala.jugadores[0];
        sala.ganador = {
            socketId: restante.socketId,
            usuario: restante.usuario,
            puntuacion: restante.puntuacion
        };
        detenerTemporizadorRonda(sala);
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
    idPartida: sala.idPartida,
    modo: sala.modo,
    anfitrion: sala.anfitrion,
    numeroMapa: sala.numeroMapa,
    jugadores: sala.jugadores,
    iniciada: sala.iniciada,
    puntosParaGanar: sala.puntosParaGanar,
    ganador: sala.ganador,
    listosIds: [...sala.jugadoresListos]
});

const construirPuntuaciones = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    numeroMapa: sala.numeroMapa,
    jugadores: sala.jugadores,
    puntosParaGanar: sala.puntosParaGanar,
    historialRegiones: sala.historialRegiones
});

const construirPartidaGanada = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    idPartida: sala.idPartida,
    modo: sala.modo,
    numeroMapa: sala.numeroMapa,
    ganador: sala.ganador,
    jugadores: sala.jugadores,
    puntosParaGanar: sala.puntosParaGanar,
    historialRegiones: sala.historialRegiones
});

const registrarPartidaEnBD = (sala) => {
    if (!sala || sala.modo !== 'ranked') return;

    bd.run(
        `INSERT OR IGNORE INTO partidas (id_partida, codigo_sala, numero_mapa, iniciada_en) VALUES (?, ?, ?, ?)`,
        [sala.idPartida, sala.codigo, sala.numeroMapa, new Date().toISOString()]
    );
};

const emitirResultadoRanked = (sala, motivoFin, resultados) => {
    io.to(sala.codigo).emit('partida_ganada', construirPartidaGanada(sala));

    const clasificacion = resultados.map((entrada) => ({
        idUsuario: entrada.idUsuario,
        usuario: entrada.usuario,
        puesto: entrada.puesto,
        puntuacion: entrada.puntuacion,
        rpDelta: entrada.rpDelta,
        liga: entrada.ligaDespues
    }));

    resultados.forEach((entrada) => {
        io.to(entrada.socketId).emit('resultado_ranked', {
            estado: 'exito',
            idPartida: sala.idPartida,
            codigo: sala.codigo,
            motivoFin,
            puesto: entrada.puesto,
            posicionDesde: entrada.posicionDesde,
            posicionHasta: entrada.posicionHasta,
            puntuacion: entrada.puntuacion,
            rpAntes: entrada.rpAntes,
            rpDelta: entrada.rpDelta,
            rpDespues: entrada.rpDespues,
            ligaAntes: entrada.ligaAntes,
            ligaDespues: entrada.ligaDespues,
            cambioLiga: entrada.cambioLiga,
            clasificacion
        });
    });

    io.to(sala.codigo).emit('clasificacion_actualizada');
};

const asentarEnBaseDeDatos = (sala, motivoFin, clasificacion, idGanador, alTerminar) => {
    if (!clasificacion.length) return alTerminar([]);

    const resultados = [];
    let pendientes = clasificacion.length;
    let huboError = false;

    const finalizar = () => {
        if (huboError) {
            bd.run('ROLLBACK');
            return alTerminar(null);
        }

        bd.run('COMMIT');
        alTerminar(resultados);
    };

    bd.serialize(() => {
        bd.run('BEGIN IMMEDIATE');
        bd.run(
            `UPDATE partidas SET asentada = 1, finalizada_en = ?, motivo_fin = ?, ganador_id_usuario = ? WHERE id_partida = ? AND asentada = 0`,
            [new Date().toISOString(), motivoFin, idGanador, sala.idPartida],
            function (error) {
                if (error || this.changes !== 1) huboError = true;
            }
        );

        clasificacion.forEach((entrada) => {
            bd.get(
                `SELECT rp FROM usuarios WHERE id = ?`,
                [entrada.idUsuario],
                (errorConsulta, fila) => {
                    if (errorConsulta || !fila) {
                        pendientes -= 1;
                        if (pendientes === 0) finalizar();
                        return;
                    }

                    const rpAntes = comoEntero(fila.rp);
                    const ligaAntes = obtenerLiga(rpAntes).nombre;
                    const rpDespues = Math.max(0, rpAntes + entrada.rpDelta);
                    const ligaDespues = obtenerLiga(rpDespues).nombre;
                    const gano = entrada.puesto === 1;

                    bd.run(
                        `INSERT INTO partida_jugadores (
                            id_partida, id_usuario, posicion_desde, posicion_hasta,
                            puesto_mostrado, puntuacion, rp_antes, rp_delta,
                            rp_despues, liga_antes, liga_despues, resultado
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            sala.idPartida,
                            entrada.idUsuario,
                            entrada.posicionDesde,
                            entrada.posicionHasta,
                            entrada.puesto,
                            entrada.puntuacion,
                            rpAntes,
                            entrada.rpDelta,
                            rpDespues,
                            ligaAntes,
                            ligaDespues,
                            gano ? 'victoria' : 'derrota'
                        ]
                    );

                    bd.run(
                        `UPDATE usuarios SET rp = ?, partidas_ranked = partidas_ranked + 1, victorias_ranked = victorias_ranked + ?, derrotas_ranked = derrotas_ranked + ? WHERE id = ?`,
                        [rpDespues, gano ? 1 : 0, gano ? 0 : 1, entrada.idUsuario]
                    );

                    resultados.push({
                        socketId: entrada.socketId,
                        idUsuario: entrada.idUsuario,
                        usuario: entrada.usuario,
                        puesto: entrada.puesto,
                        posicionDesde: entrada.posicionDesde,
                        posicionHasta: entrada.posicionHasta,
                        puntuacion: entrada.puntuacion,
                        rpAntes,
                        rpDelta: entrada.rpDelta,
                        rpDespues,
                        ligaAntes,
                        ligaDespues,
                        cambioLiga: {
                            antes: ligaAntes,
                            despues: ligaDespues,
                            tipo:
                                ligaAntes === ligaDespues
                                    ? null
                                    : obtenerLiga(rpDespues).min > obtenerLiga(rpAntes).min
                                        ? 'ascenso'
                                        : 'descenso'
                        }
                    });

                    pendientes -= 1;
                    if (pendientes === 0) finalizar();
                }
            );
        });
    });
};

const finalizarYAsentarPartida = (sala, motivoFin, opciones = {}) => {
    if (
        !sala ||
        sala.modo !== 'ranked' ||
        !sala.iniciada ||
        sala.resultadoAsentado
    ) {
        return false;
    }

    sala.resultadoAsentado = true;
    detenerTemporizadorRonda(sala);
    sala.dadosRonda = null;

    const participantes = sala.jugadores.map((jugador) => ({
        socketId: jugador.socketId,
        idUsuario: jugador.idUsuario,
        usuario: jugador.usuario,
        puntuacion: comoEntero(jugador.puntuacion)
    }));

    const ordenados = [...participantes].sort(
        (a, b) => b.puntuacion - a.puntuacion
    );

    if (opciones.forzarUltimo) {
        const indice = ordenados.findIndex(
            (jugador) => jugador.socketId === opciones.forzarUltimo
        );
        if (indice >= 0 && indice < ordenados.length - 1) {
            const [jugador] = ordenados.splice(indice, 1);
            ordenados.push(jugador);
        }
    }

    const clasificacion = asignarPuestosPorOrden(ordenados);
    const ganador = clasificacion[0];

    sala.ganador = {
        socketId: ganador.socketId,
        usuario: ganador.usuario,
        puntuacion: ganador.puntuacion
    };

    asentarEnBaseDeDatos(
        sala,
        motivoFin,
        clasificacion,
        ganador.idUsuario,
        (resultados) => {
            if (resultados) emitirResultadoRanked(sala, motivoFin, resultados);
        }
    );

    return true;
};

const construirPartidaLista = (sala, socketId) => ({
    estado: 'exito',
    codigo: sala.codigo,
    idPartida: sala.idPartida,
    modo: sala.modo,
    numeroMapa: sala.numeroMapa,
    jugadores: sala.jugadores,
    anfitrion: sala.anfitrion,
    puntosParaGanar: sala.puntosParaGanar,
    historialRegiones: sala.historialRegiones,
    tuSocketId: socketId
});

const construirEstadoListos = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    todosListos:
        sala.jugadores.length > 0 &&
        sala.jugadores.every((jugador) =>
            sala.jugadoresListos.has(jugador.socketId)),
    listos: sala.jugadores.filter((jugador) =>
        sala.jugadoresListos.has(jugador.socketId)).length,
    total: sala.jugadores.length,
    listosIds: [...sala.jugadoresListos]
});

const marcarJugadorListoEnSala = (sala, socketId, listo = true) => {
    const jugador = sala ? buscarJugadorEnSala(sala, socketId) : null;
    if (!jugador) return false;

    if (listo) {
        sala.jugadoresListos.add(socketId);
    } else {
        sala.jugadoresListos.delete(socketId);
    }
    jugador.listo = listo;
    return true;
};

const normalizarTableroRecibido = (tablero) => {
    if (!tablero || typeof tablero !== 'object') return null;

    const celdas = Array.isArray(tablero.celdas)
        ? tablero.celdas
            .filter((celda) =>
                celda &&
                Number.isInteger(celda.columna) &&
                celda.columna >= 0 &&
                celda.columna < 7 &&
                Number.isInteger(celda.fila) &&
                celda.fila >= 0 &&
                celda.fila < 7)
            .map((celda) => ({
                columna: celda.columna,
                fila: celda.fila,
                valor: Number.isInteger(celda.valor) ? celda.valor : null,
                region: typeof celda.region === 'string' ? celda.region : null,
                esEstrella: celda.esEstrella === true
            }))
        : [];

    if (celdas.length === 0) return null;

    return {
        numeroMapa: Number.isInteger(tablero.numeroMapa) ? tablero.numeroMapa : 1,
        celdas,
        puntuacion: Number.isInteger(tablero.puntuacion) ? tablero.puntuacion : 0,
        numeroRonda: Number.isInteger(tablero.numeroRonda) ? tablero.numeroRonda : 0,
        actualizadoEn: Date.now()
    };
};

const guardarTableroEnSala = (sala, socketId, tablero) => {
    if (!sala || !buscarJugadorEnSala(sala, socketId)) return null;

    const normalizado = normalizarTableroRecibido(tablero);
    if (!normalizado) return null;

    sala.tablerosPorSocket.set(socketId, normalizado);
    return normalizado;
};

const construirTablerosActualizados = (sala) => ({
    estado: 'exito',
    codigo: sala.codigo,
    tableros: Object.fromEntries(sala.tablerosPorSocket)
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

const notificarSalidaConGracia = (sala, jugador, motivo) => {
    const evento = {
        ...construirEventoSalida(sala, jugador, sala.anfitrion),
        idUsuario: jugador.idUsuario,
        graciaSegundos: SEGUNDOS_GRACIA_RANKED
    };

    if (sala.jugadores.length === 2) {
        io.to(sala.codigo).emit(
            motivo === 'concedio' ? 'rival_concedio' : 'rival_desconectado',
            evento
        );
        return;
    }

    io.to(sala.codigo).emit(
        motivo === 'concedio' ? 'jugador_concedio' : 'jugador_desconectado',
        evento
    );
};

const iniciarGraciaDesconexion = (conexion, sala, motivo) => {
    const jugador = buscarJugadorEnSala(sala, conexion.id);
    if (!jugador) return;

    if (!sala.iniciada || sala.resultadoAsentado) {
        return manejarSalidaJugador(conexion, sala.codigo, motivo, {
            idSocket: conexion.id
        });
    }

    if (sala.desconectados.has(conexion.id)) return;

    jugador.conectado = false;
    jugador.desconectadoEn = Date.now();
    detenerTemporizadorRonda(sala);
    notificarSalidaConGracia(sala, jugador, motivo);

    const temporizador = setTimeout(() => {
        sala.desconectados.delete(conexion.id);
        manejarSalidaJugador(conexion, sala.codigo, motivo, {
            idSocket: conexion.id,
            confirmado: true,
            forzarUltimo: true,
            silencioso: true
        });
    }, MILISEGUNDOS_GRACIA_RANKED);

    if (typeof temporizador.unref === 'function') temporizador.unref();

    sala.desconectados.set(conexion.id, {
        idUsuario: jugador.idUsuario,
        motivo,
        temporizador
    });
};

const reasociarJugadorDesconectado = (socket) => {
    for (const sala of salas.values()) {
        const entrada = [...sala.desconectados.entries()].find(
            ([, pendiente]) => pendiente.idUsuario === socket.usuario.idUsuario
        );
        if (!entrada) continue;

        const [idSocketAnterior, pendiente] = entrada;
        clearTimeout(pendiente.temporizador);
        sala.desconectados.delete(idSocketAnterior);

        const jugador = buscarJugadorEnSala(sala, idSocketAnterior);
        if (!jugador) continue;

        jugador.socketId = socket.id;
        jugador.conectado = true;
        delete jugador.desconectadoEn;

        if (sala.jugadoresListos.delete(idSocketAnterior)) {
            sala.jugadoresListos.add(socket.id);
        }
        if (sala.accionesTurno.delete(idSocketAnterior)) {
            sala.accionesTurno.add(socket.id);
        }
        if (sala.tablerosPorSocket.has(idSocketAnterior)) {
            sala.tablerosPorSocket.set(
                socket.id,
                sala.tablerosPorSocket.get(idSocketAnterior)
            );
            sala.tablerosPorSocket.delete(idSocketAnterior);
        }
        if (sala.anfitrion === idSocketAnterior) sala.anfitrion = socket.id;
        if (sala.ganador && sala.ganador.socketId === idSocketAnterior) {
            sala.ganador.socketId = socket.id;
        }

        sala.regionesReclamadas.forEach((reclamaciones) => {
            reclamaciones.forEach((reclamacion) => {
                if (reclamacion.socketId === idSocketAnterior) {
                    reclamacion.socketId = socket.id;
                }
            });
        });
        sala.historialRegiones.forEach((registro) => {
            if (registro.socketId === idSocketAnterior) {
                registro.socketId = socket.id;
            }
        });

        socket.join(sala.codigo);
        if (sala.dadosRonda) programarTemporizadorRonda(sala);

        io.to(sala.codigo).emit(
            'jugador_reconectado',
            construirEventoSalida(sala, jugador, sala.anfitrion)
        );
        emitirSalaActualizada(sala);
        io.to(sala.codigo).emit('estado_listos', construirEstadoListos(sala));
        socket.emit('tableros_actualizados', construirTablerosActualizados(sala));
        return;
    }
};

const manejarSalidaJugador = (conexion, codigoSala, motivo, opciones = {}) => {
    const codigo = normalizarCodigoSala(codigoSala);
    const sala = buscarSala(codigo);

    if (!sala) return;

    const idSocket = opciones.idSocket || conexion.id;
    if (!buscarJugadorEnSala(sala, idSocket)) return;

    const cantidadAntes = sala.jugadores.length;
    const estabaIniciada = sala.iniciada;
    const debeAsentar = Boolean(
        opciones.confirmado && sala.modo === 'ranked' && sala.iniciada
    );

    if (debeAsentar) {
        finalizarYAsentarPartida(
            sala,
            motivo === 'concedio' ? 'rendicion' : 'abandono',
            { forzarUltimo: idSocket }
        );
    }

    const resultado = salirDeSala(sala, idSocket);
    if (!resultado) return;

    const pendiente = sala.desconectados.get(idSocket);
    if (pendiente) {
        clearTimeout(pendiente.temporizador);
        sala.desconectados.delete(idSocket);
    }

    if (conexion.connected) conexion.leave(codigo);
    if (resultado.salaEliminada) return;

    if (!opciones.silencioso) {
        const eventoSalida = construirEventoSalida(
            sala,
            resultado.jugador,
            resultado.anfitrion
        );

        if (resultado.ganador && !debeAsentar) {
            io.to(codigo).emit('partida_ganada', construirPartidaGanada(sala));

            if (cantidadAntes === 2) {
                io.to(codigo).emit(
                    motivo === 'concedio' ? 'rival_concedio' : 'rival_desconectado'
                );
            } else if (motivo === 'concedio') {
                io.to(codigo).emit('jugador_concedio', eventoSalida);
            } else {
                io.to(codigo).emit('jugador_desconectado', eventoSalida);
            }
        } else if (!resultado.ganador && estabaIniciada && cantidadAntes > 2) {
            io.to(codigo).emit(
                motivo === 'concedio' ? 'jugador_concedio' : 'jugador_desconectado',
                eventoSalida
            );
        }
    }

    if (
        !resultado.ganador &&
        sala.dadosRonda &&
        sala.jugadores.every((jugadorSala) =>
            sala.accionesTurno.has(jugadorSala.socketId)
        )
    ) {
        const eventoRonda = finalizarRondaEnSala(sala, 'jugador-salio');
        if (eventoRonda) io.to(codigo).emit('ronda_lista', eventoRonda);
    }

    emitirSalaActualizada(sala);
    io.to(codigo).emit('estado_listos', construirEstadoListos(sala));
};

const programarTemporizadorRonda = (sala) => {
    if (!sala) return;

    detenerTemporizadorRonda(sala);
    sala.temporizadorRonda = setTimeout(() => {
        sala.temporizadorRonda = null;

        if (!salas.has(sala.codigo) || !sala.dadosRonda || sala.ganador) {
            return;
        }

        const evento = finalizarRondaPorTiempo(sala);
        if (evento) {
            io.to(sala.codigo).emit('ronda_lista', evento);
        }
    }, MILISEGUNDOS_POR_RONDA);

    if (typeof sala.temporizadorRonda.unref === 'function') {
        sala.temporizadorRonda.unref();
    }
};

io.on('connection', (socket) => {
    console.log(
        `Usuario conectado: ${socket.usuario.usuario} (id: ${socket.usuario.idUsuario})`
    );

    reasociarJugadorDesconectado(socket);

    socket.on('crear_sala', (datos) => {
        const numeroMapa = normalizarNumeroMapa(datos && datos.numeroMapa);
        const sala = crearSalaParaSocket(
            socket,
            numeroMapa,
            datos && datos.modo
        );

        socket.join(sala.codigo);
        socket.emit('sala_creada', sala.codigo);
        cargarPerfilRanked(sala, sala.jugadores[0]);
        emitirSalaActualizada(sala);
        io.to(sala.codigo).emit('estado_listos', construirEstadoListos(sala));

        console.log(
            `Sala ${sala.codigo} creada por ${socket.usuario.usuario} (${socket.id}) en el mapa ${sala.numeroMapa}`
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
        cargarPerfilRanked(sala, buscarJugadorEnSala(sala, socket.id));
        emitirSalaActualizada(sala);
        io.to(sala.codigo).emit('estado_listos', construirEstadoListos(sala));

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
        registrarPartidaEnBD(sala);
        emitirSalaActualizada(sala);

        console.log(
            `Partida iniciada en la sala ${sala.codigo} por ${socket.usuario.usuario}`
        );
    });

    socket.on('jugador_listo', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        if (sala.iniciada) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'No puedes cambiar tu estado de listo durante la partida.'
            });
        }

        const listo = !datos || datos.listo === undefined
            ? true
            : datos.listo === true;
        if (!marcarJugadorListoEnSala(sala, socket.id, listo)) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'No perteneces a esta sala.'
            });
        }

        emitirSalaActualizada(sala);
        io.to(sala.codigo).emit('estado_listos', construirEstadoListos(sala));
    });

    socket.on('consultar_listos', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) return;

        socket.emit('estado_listos', construirEstadoListos(sala));
    });

    socket.on('lanzar_dados', (datos) => {
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

        const resultado = lanzarDadosEnSala(sala, socket.id);
        if (resultado.error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: resultado.error
            });
        }

        programarTemporizadorRonda(sala);
        io.to(codigo).emit('dados_lanzados', resultado.evento);
    });

    socket.on('accion_turno_completada', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        const resultado = registrarAccionTurnoEnSala(sala, socket.id);
        if (resultado.error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: resultado.error
            });
        }

        if (resultado.rondaCompleta) {
            const evento = finalizarRondaEnSala(sala, 'completada');
            if (evento) {
                io.to(codigo).emit('ronda_lista', evento);
            }
        }
    });

    socket.on('reclamar_region', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        const resultado = reclamarRegionEnSala(
            sala,
            socket.id,
            datos && datos.region
        );

        if (resultado.error) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: resultado.error
            });
        }

        io.to(codigo).emit('puntuaciones_actualizadas', {
            ...construirPuntuaciones(sala),
            ultimaRegion: resultado.region
        });

        if (resultado.gano) {
            if (sala.modo === 'ranked') {
                finalizarYAsentarPartida(sala, 'puntos');
            } else {
                io.to(codigo).emit(
                    'partida_ganada',
                    construirPartidaGanada(sala)
                );
            }
        }
    });

    socket.on('tablero_actualizado', (datos) => {
        const codigo = obtenerCodigoSala(datos);
        const sala = buscarSala(codigo);

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        if (
            sala.modo === 'ranked' &&
            !esTableroValidoParaRanked(datos && datos.tablero)
        ) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'El tablero de una partida clasificatoria no es válido.'
            });
        }

        if (!guardarTableroEnSala(sala, socket.id, datos && datos.tablero)) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'No se pudo registrar el tablero.'
            });
        }

        io.to(codigo).emit(
            'tableros_actualizados',
            construirTablerosActualizados(sala)
        );
    });

    socket.on('consultar_tableros', (datos) => {
        const sala = buscarSala(obtenerCodigoSala(datos));

        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        socket.emit('tableros_actualizados', construirTablerosActualizados(sala));
    });

    socket.on('conceder_partida', (codigoSala) => {
        const sala = buscarSala(obtenerCodigoSala(codigoSala));
        if (!sala) {
            return socket.emit('error_sala', {
                estado: 'error',
                mensaje: 'La sala no existe.'
            });
        }

        if (
            sala.modo === 'ranked' &&
            sala.iniciada &&
            buscarJugadorEnSala(sala, socket.id)
        ) {
            return iniciarGraciaDesconexion(socket, sala, 'concedio');
        }

        manejarSalidaJugador(socket, sala.codigo, 'concedio');
    });

    socket.on('disconnect', (motivo) => {
        const salasDelJugador = [...salas.values()].filter((sala) =>
            buscarJugadorEnSala(sala, socket.id)
        );

        salasDelJugador.forEach((sala) => {
            if (sala.modo === 'ranked' && sala.iniciada) {
                iniciarGraciaDesconexion(socket, sala, 'desconectado');
            } else {
                manejarSalidaJugador(socket, sala.codigo, 'desconectado');
            }
        });

        console.log(
            `Usuario desconectado: ${socket.usuario.usuario} (id: ${socket.usuario.idUsuario}). Motivo: ${motivo}`
        );
    });
});

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PORT || process.env.PUERTO || 3000;
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
module.exports.lanzarDadosEnSala = lanzarDadosEnSala;
module.exports.registrarAccionTurnoEnSala = registrarAccionTurnoEnSala;
module.exports.finalizarRondaEnSala = finalizarRondaEnSala;
module.exports.finalizarRondaPorTiempo = finalizarRondaPorTiempo;
module.exports.construirDadosLanzados = construirDadosLanzados;
module.exports.construirRondaLista = construirRondaLista;
module.exports.programarTemporizadorRonda = programarTemporizadorRonda;
module.exports.SEGUNDOS_POR_RONDA = SEGUNDOS_POR_RONDA;
module.exports.reclamarRegionEnSala = reclamarRegionEnSala;
module.exports.salirDeSala = salirDeSala;
module.exports.construirSalaActualizada = construirSalaActualizada;
module.exports.construirPartidaLista = construirPartidaLista;
module.exports.construirEstadoListos = construirEstadoListos;
module.exports.marcarJugadorListoEnSala = marcarJugadorListoEnSala;
module.exports.normalizarTableroRecibido = normalizarTableroRecibido;
module.exports.guardarTableroEnSala = guardarTableroEnSala;
module.exports.construirTablerosActualizados = construirTablerosActualizados;
module.exports.construirPuntuaciones = construirPuntuaciones;
module.exports.construirPartidaGanada = construirPartidaGanada;
module.exports.normalizarModo = normalizarModo;
module.exports.SEGUNDOS_GRACIA_RANKED = SEGUNDOS_GRACIA_RANKED;
module.exports.esTableroValidoParaRanked = esTableroValidoParaRanked;
module.exports.registrarPartidaEnBD = registrarPartidaEnBD;
module.exports.finalizarYAsentarPartida = finalizarYAsentarPartida;
module.exports.crearEntradaClasificacion = crearEntradaClasificacion;