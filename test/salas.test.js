const {
    salas,
    MAX_JUGADORES,
    MIN_JUGADORES,
    calcularPuntosParaGanar,
    crearSalaParaSocket,
    agregarJugadorASala,
    iniciarPartidaEnSala,
    actualizarPuntuacionEnSala,
    salirDeSala,
    construirPartidaLista,
    construirSalaActualizada,
    construirPuntuaciones,
    construirPartidaGanada
} = require('../index');

const crearSocketFalso = (id, usuario = 'Jugador') => ({
    id,
    usuario: {
        idUsuario: id,
        usuario
    }
});

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

        const victoria = actualizarPuntuacionEnSala(sala, 's2', 26);

        expect(victoria.error).toBeNull();
        expect(victoria.gano).toBe(true);
        expect(victoria.ganador.usuario).toBe('Luis');
        expect(sala.ganador.usuario).toBe('Luis');

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
});
