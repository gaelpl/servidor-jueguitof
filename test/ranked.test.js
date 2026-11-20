const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');
const rangos = require('../config/rangos');

const idPartida = `ranked-test-${Date.now()}`;

const construirTableroValido = () => {
    const celdas = Array.from({ length: 49 }, (_, indice) => ({
        columna: indice % 7,
        fila: Math.floor(indice / 7),
        valor: null,
        region: 'blanco',
        esEstrella: false
    }));

    for (let indice = 0; indice < 6; indice += 1) {
        celdas[indice].esEstrella = true;
        celdas[indice].valor = indice + 1;
    }

    return { numeroMapa: 1, celdas };
};

describe('Ranked - reglas de ligas y RP', () => {
    it('asigna ligas y divisiones según el RP', () => {
        expect(rangos.obtenerLiga(0).nombre).toBe('Bronce');
        expect(rangos.obtenerLiga(199).nombre).toBe('Bronce');
        expect(rangos.obtenerLiga(200).nombre).toBe('Plata');
        expect(rangos.obtenerLiga(400).nombre).toBe('Oro');
        expect(rangos.obtenerLiga(600).nombre).toBe('Platino');
        expect(rangos.obtenerLiga(800).nombre).toBe('Diamante');

        expect(rangos.obtenerDivision(0)).toBe('IV');
        expect(rangos.obtenerDivision(150)).toBe('I');
        expect(rangos.obtenerDivision(200)).toBe('IV');
    });

    it('calcula progreso hacia la siguiente liga', () => {
        const progreso = rangos.obtenerProgresoLiga(100);
        expect(progreso.progreso).toBeCloseTo(0.5, 5);
        expect(progreso.rpRestante).toBe(100);

        const diamante = rangos.obtenerProgresoLiga(900);
        expect(diamante.siguiente).toBeNull();
        expect(diamante.rpRestante).toBe(0);
    });

    it('aplica +25/-15 en partidas 1vs1', () => {
        const resultados = rangos.calcularClasificacionRanked([
            { idUsuario: 1, puntuacion: 50 },
            { idUsuario: 2, puntuacion: 20 }
        ]);

        expect(resultados[0].rpDelta).toBe(25);
        expect(resultados[1].rpDelta).toBe(-15);
    });

    it('promedia el RP de jugadores empatados', () => {
        const resultados = rangos.calcularClasificacionRanked([
            { idUsuario: 1, puntuacion: 70 },
            { idUsuario: 2, puntuacion: 70 },
            { idUsuario: 3, puntuacion: 50 }
        ]);

        expect(resultados.map((entrada) => entrada.puesto)).toEqual([1, 1, 3]);
        expect(resultados[0].rpDelta).toBe(10);
        expect(resultados[1].rpDelta).toBe(10);
        expect(resultados[2].rpDelta).toBe(-18);
    });

    it('normaliza el modo y valida tableros ranked', () => {
        expect(servidor.normalizarModo('RANKED')).toBe('ranked');
        expect(servidor.normalizarModo('casual')).toBe('casual');
        expect(servidor.SEGUNDOS_GRACIA_RANKED).toBe(25);
        expect(servidor.esTableroValidoParaRanked(construirTableroValido())).toBe(true);

        const incompleto = construirTableroValido();
        incompleto.celdas[0].valor = null;
        expect(servidor.esTableroValidoParaRanked(incompleto)).toBe(false);
    });
});

describe('Ranked - persistencia y clasificación', () => {
    afterAll((done) => {
        bd.run('DELETE FROM partidas WHERE id_partida = ?', [idPartida], () => {
            bd.close(done);
        });
    });

    it('registra una partida ranked una sola vez', async () => {
        const sala = {
            idPartida,
            codigo: 'RANKED',
            numeroMapa: 1,
            modo: 'ranked'
        };

        servidor.registrarPartidaEnBD(sala);
        servidor.registrarPartidaEnBD(sala);

        const fila = await new Promise((resolver, rechazar) => {
            bd.get(
                'SELECT COUNT(*) AS cantidad FROM partidas WHERE id_partida = ?',
                [idPartida],
                (error, resultado) => {
                    if (error) return rechazar(error);
                    resolver(resultado);
                }
            );
        });

        expect(fila.cantidad).toBe(1);
    });

    it('expone la clasificación global sin exigir token', async () => {
        const respuesta = await request(servidor).get('/clasificacion?limite=3');

        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.body.estado).toBe('exito');
        expect(Array.isArray(respuesta.body.entradas)).toBe(true);
        expect(respuesta.body.entradas.length).toBeLessThanOrEqual(3);
        expect(respuesta.body.entradas[0].posicion).toBe(1);
    });
});
