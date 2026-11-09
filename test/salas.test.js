const {
    salas,
    MAX_JUGADORES,
    MIN_JUGADORES,
    calcularPuntosParaGanar,
    crearSalaParaSocket,
    agregarJugadorASala,
    iniciarPartidaEnSala,
    construirPartidaLista,
    construirSalaActualizada
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
});
