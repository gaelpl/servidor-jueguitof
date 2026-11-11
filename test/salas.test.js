const {
    salas,
    MAX_JUGADORES,
    MIN_JUGADORES,
    calcularPuntosParaGanar,
    crearSalaParaSocket,
    agregarJugadorASala,
    iniciarPartidaEnSala,
    lanzarDadosEnSala,
    registrarAccionTurnoEnSala,
    finalizarRondaEnSala,
    finalizarRondaPorTiempo,
    SEGUNDOS_POR_RONDA,
    actualizarPuntuacionEnSala,
    salirDeSala,
    construirPartidaLista,
    construirSalaActualizada,
    construirPuntuaciones,
    construirPartidaGanada,
    marcarJugadorListoEnSala,
    construirEstadoListos
} = require('../index');

const crearSocketFalso = (id, usuario = 'Jugador') => ({
    id,
    usuario: {
        idUsuario: id,
        usuario
    }
});

const marcarTodosListos = (sala) => {
    sala.jugadores.forEach((jugador) => {
        marcarJugadorListoEnSala(sala, jugador.socketId);
    });
};

describe('Salas multijugador', () => {
    afterEach(() => {
        salas.clear();
    });

    it('calcula la meta de puntos según la cantidad de jugadores', () => {
        expect(calcularPuntosParaGanar(2)).toBe(26);
        expect(calcularPuntosParaGanar(3)).toBe(24);
        expect(calcularPuntosParaGanar(4)).toBe(22);
        expect(calcularPuntosParaGanar(5)).toBe(20);
        expect(calcularPuntosParaGanar(1)).toBeNull();
    });

    it('crea una sala con anfitrión y permite hasta 5 jugadores', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));

        expect(sala.anfitrion).toBe('s1');
        expect(sala.iniciada).toBe(false);
        expect(sala.jugadores).toHaveLength(1);

        for (let i = 2; i <= MAX_JUGADORES; i++) {
            expect(
                agregarJugadorASala(
                    sala,
                    crearSocketFalso(`s${i}`, `Jugador ${i}`)
                )
            ).toBeNull();
        }

        expect(sala.jugadores).toHaveLength(MAX_JUGADORES);
        expect(
            agregarJugadorASala(sala, crearSocketFalso('s6', 'Extra'))
        ).toBe('La sala está llena.');
    });

    it('no permite unirse a una partida ya iniciada', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));

        expect(iniciarPartidaEnSala(sala, 's1')).toBeNull();
        expect(
            agregarJugadorASala(sala, crearSocketFalso('s3', 'Eva'))
        ).toBe('La partida ya inició.');
    });

    it('solo el anfitrión inicia la partida y requiere al menos 2 jugadores', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));

        expect(iniciarPartidaEnSala(sala, 's2')).toBe(
            'Solo el anfitrión puede iniciar la partida.'
        );
        expect(iniciarPartidaEnSala(sala, 's1')).toBe(
            `Se necesitan al menos ${MIN_JUGADORES} jugadores para iniciar.`
        );

        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));

        expect(iniciarPartidaEnSala(sala, 's1')).toBeNull();
        expect(sala.iniciada).toBe(true);
        expect(sala.puntosParaGanar).toBe(26);
        expect(iniciarPartidaEnSala(sala, 's1')).toBe(
            'La partida ya inició.'
        );
    });

    it('incluye la meta y el socket personal en la carga de partida', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        agregarJugadorASala(sala, crearSocketFalso('s3', 'Eva'));
        iniciarPartidaEnSala(sala, 's1');

        const carga = construirPartidaLista(sala, 's2');

        expect(carga.codigo).toBe(sala.codigo);
        expect(carga.puntosParaGanar).toBe(24);
        expect(carga.tuSocketId).toBe('s2');
        expect(carga.anfitrion).toBe('s1');
        expect(carga.jugadores).toHaveLength(3);
    });

    it('expone el estado completo de la sala para el lobby', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');

        const estado = construirSalaActualizada(sala);

        expect(estado.codigo).toBe(sala.codigo);
        expect(estado.anfitrion).toBe('s1');
        expect(estado.iniciada).toBe(true);
        expect(estado.puntosParaGanar).toBe(26);
        expect(estado.jugadores).toHaveLength(2);
    });

    it('actualiza puntuaciones y declara ganador al alcanzar la meta', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');

        const actualizacion = actualizarPuntuacionEnSala(sala, 's2', 10);

        expect(actualizacion.error).toBeNull();
        expect(actualizacion.gano).toBe(false);
        expect(sala.jugadores[1].puntuacion).toBe(10);

        sala.temporizadorRonda = setTimeout(() => {}, 60000);
        sala.temporizadorRonda.unref();

        const victoria = actualizarPuntuacionEnSala(sala, 's2', 26);

        expect(victoria.error).toBeNull();
        expect(victoria.gano).toBe(true);
        expect(victoria.ganador.usuario).toBe('Luis');
        expect(sala.ganador.usuario).toBe('Luis');
        expect(sala.temporizadorRonda).toBeNull();

        const carga = construirPartidaGanada(sala);
        expect(carga.ganador.usuario).toBe('Luis');
        expect(carga.puntosParaGanar).toBe(26);
        expect(construirPuntuaciones(sala).jugadores[1].puntuacion).toBe(26);
    });

    it('rechaza puntuaciones de jugadores ajenos o antes de iniciar', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));

        expect(actualizarPuntuacionEnSala(sala, 's1', 5).error).toBe(
            'La partida no ha iniciado.'
        );
        expect(actualizarPuntuacionEnSala(sala, 's9', 5).error).toBe(
            'No perteneces a esta sala.'
        );
    });

    it('mantiene la partida si un jugador sale de una sala de 3 o más', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        agregarJugadorASala(sala, crearSocketFalso('s3', 'Eva'));
        iniciarPartidaEnSala(sala, 's1');

        const resultado = salirDeSala(sala, 's1');

        expect(resultado.salaEliminada).toBe(false);
        expect(resultado.ganador).toBeNull();
        expect(resultado.anfitrion).toBe('s2');
        expect(sala.jugadores).toHaveLength(2);
        expect(sala.iniciada).toBe(true);
    });

    it('declara ganador al restante cuando sale el rival en una partida de 2', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');

        const resultado = salirDeSala(sala, 's2');

        expect(resultado.ganador).not.toBeNull();
        expect(resultado.ganador.usuario).toBe('Ana');
        expect(sala.jugadores).toHaveLength(1);
    });

    it('declara ganador al último jugador que queda en una sala de 3', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        agregarJugadorASala(sala, crearSocketFalso('s3', 'Eva'));
        iniciarPartidaEnSala(sala, 's1');

        expect(salirDeSala(sala, 's1').ganador).toBeNull();
        expect(salirDeSala(sala, 's2').ganador.usuario).toBe('Eva');
        expect(sala.jugadores).toHaveLength(1);
    });

    it('solo el anfitrión lanza los dados y transmite valores sincronizados', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');
        marcarTodosListos(sala);

        expect(lanzarDadosEnSala(sala, 's2').error).toBe(
            'Solo el anfitrión puede lanzar los dados.'
        );

        const random = jest
            .fn()
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.99);
        const resultado = lanzarDadosEnSala(sala, 's1', random);

        expect(resultado.error).toBeNull();
        expect(resultado.evento.dado1).toBe(1);
        expect(resultado.evento.dado2).toBe(6);
        expect(resultado.evento.numeroRonda).toBe(1);
        expect(resultado.evento.anfitrion).toBe('s1');
        expect(resultado.evento.duracionRondaSegundos).toBe(
            SEGUNDOS_POR_RONDA
        );
        expect(resultado.evento.segundosRestantes).toBe(SEGUNDOS_POR_RONDA);
        expect(sala.dadosRonda).not.toBeNull();

        expect(lanzarDadosEnSala(sala, 's1').error).toBe(
            'La ronda actual aún no ha terminado.'
        );
    });

    it('registra una acción por jugador y cierra la ronda al completarse', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');
        marcarTodosListos(sala);
        lanzarDadosEnSala(sala, 's1', () => 0);

        const primera = registrarAccionTurnoEnSala(sala, 's1');
        expect(primera.error).toBeNull();
        expect(primera.rondaCompleta).toBe(false);

        expect(registrarAccionTurnoEnSala(sala, 's1').error).toBe(
            'Ya completaste tu acción en esta ronda.'
        );

        const segunda = registrarAccionTurnoEnSala(sala, 's2');
        expect(segunda.error).toBeNull();
        expect(segunda.rondaCompleta).toBe(true);

        const evento = finalizarRondaEnSala(sala, 'completada');
        expect(evento.motivo).toBe('completada');
        expect(evento.numeroRonda).toBe(1);
        expect(evento.anfitrion).toBe('s1');
        expect(sala.dadosRonda).toBeNull();
        expect(sala.accionesTurno.size).toBe(0);

        const siguiente = lanzarDadosEnSala(sala, 's1', () => 0);
        expect(siguiente.error).toBeNull();
        expect(siguiente.evento.numeroRonda).toBe(2);
    });

    it('rechaza acciones antes de lanzar dados y de jugadores ajenos', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');

        expect(registrarAccionTurnoEnSala(sala, 's1').error).toBe(
            'Debes esperar el lanzamiento de dados del anfitrión.'
        );

        marcarTodosListos(sala);
        lanzarDadosEnSala(sala, 's1', () => 0);

        expect(registrarAccionTurnoEnSala(sala, 's9').error).toBe(
            'No perteneces a esta sala.'
        );
    });

    it('salta automáticamente las acciones pendientes al agotarse el tiempo', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');
        marcarTodosListos(sala);
        lanzarDadosEnSala(sala, 's1', () => 0);
        registrarAccionTurnoEnSala(sala, 's1');

        const evento = finalizarRondaPorTiempo(sala);

        expect(evento.motivo).toBe('tiempo');
        expect(evento.numeroRonda).toBe(1);
        expect(sala.dadosRonda).toBeNull();
        expect(sala.accionesTurno.size).toBe(0);
    });

    it('bloquea el lanzamiento hasta que todos los jugadores estén listos', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        iniciarPartidaEnSala(sala, 's1');

        expect(lanzarDadosEnSala(sala, 's1').error).toBe(
            'Esperando a que todos los jugadores estén listos.'
        );

        marcarJugadorListoEnSala(sala, 's1');
        expect(construirEstadoListos(sala).todosListos).toBe(false);
        expect(construirEstadoListos(sala).listos).toBe(1);
        expect(construirEstadoListos(sala).total).toBe(2);

        marcarJugadorListoEnSala(sala, 's2');
        expect(construirEstadoListos(sala).todosListos).toBe(true);

        expect(lanzarDadosEnSala(sala, 's1').error).toBeNull();
    });

    it('desbloquea el lanzamiento cuando un jugador pendiente se desconecta', () => {
        const sala = crearSalaParaSocket(crearSocketFalso('s1', 'Ana'));
        agregarJugadorASala(sala, crearSocketFalso('s2', 'Luis'));
        agregarJugadorASala(sala, crearSocketFalso('s3', 'Eva'));
        iniciarPartidaEnSala(sala, 's1');
        marcarJugadorListoEnSala(sala, 's1');
        marcarJugadorListoEnSala(sala, 's2');

        expect(lanzarDadosEnSala(sala, 's1').error).toBe(
            'Esperando a que todos los jugadores estén listos.'
        );

        salirDeSala(sala, 's3');

        expect(construirEstadoListos(sala).todosListos).toBe(true);
        expect(lanzarDadosEnSala(sala, 's1').error).toBeNull();
    });
});
