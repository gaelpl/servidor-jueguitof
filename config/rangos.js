const LIGAS = [
    { nombre: 'Bronce', min: 0, max: 199, color: '#B45309' },
    { nombre: 'Plata', min: 200, max: 399, color: '#64748B' },
    { nombre: 'Oro', min: 400, max: 599, color: '#D97706' },
    { nombre: 'Platino', min: 600, max: 799, color: '#0D9488' },
    { nombre: 'Diamante', min: 800, max: null, color: '#4F46E5' }
];

const DIVISIONES = ['IV', 'III', 'II', 'I'];

const comoEntero = (valor) => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
};

const obtenerLiga = (rp) => {
    const puntos = comoEntero(rp);
    return LIGAS.find((liga) => liga.max === null || puntos <= liga.max) ||
        LIGAS[LIGAS.length - 1];
};

const obtenerDivision = (rp) =>
    DIVISIONES[Math.floor((comoEntero(rp) % 200) / 50)];

const obtenerSiguienteLiga = (rp) => {
    const liga = obtenerLiga(rp);
    const indice = LIGAS.indexOf(liga);
    return indice < LIGAS.length - 1 ? LIGAS[indice + 1] : null;
};

const obtenerProgresoLiga = (rp) => {
    const puntos = comoEntero(rp);
    const liga = obtenerLiga(puntos);
    const siguiente = obtenerSiguienteLiga(puntos);

    if (!siguiente) {
        return { liga, division: obtenerDivision(puntos), siguiente: null, progreso: 1, rpRestante: 0 };
    }

    return {
        liga,
        division: obtenerDivision(puntos),
        siguiente,
        progreso: (puntos - liga.min) / (liga.max - liga.min + 1),
        rpRestante: siguiente.min - puntos
    };
};

const redondeoSimetrico = (valor) =>
    Math.sign(valor) * Math.round(Math.abs(valor));

const deltaPorPosicion = (posicion, cantidadJugadores) => {
    if (cantidadJugadores === 2) {
        return posicion === 1 ? 25 : -15;
    }

    if (posicion === 1) {
        return 25;
    }

    const penalizacionMinima = 6;
    const penalizacionMaxima = 18;
    const penalizacion =
        penalizacionMinima +
        (penalizacionMaxima - penalizacionMinima) *
            ((posicion - 2) / Math.max(1, cantidadJugadores - 2));

    return -Math.round(penalizacion);
};

const asignarPuestosPorOrden = (ordenados) => {
    const clasificacion = [];
    let inicio = 0;

    while (inicio < ordenados.length) {
        let fin = inicio;
        while (
            fin + 1 < ordenados.length &&
            ordenados[fin + 1].puntuacion === ordenados[inicio].puntuacion
        ) {
            fin += 1;
        }

        const deltas = [];
        for (let posicion = inicio + 1; posicion <= fin + 1; posicion += 1) {
            deltas.push(deltaPorPosicion(posicion, ordenados.length));
        }

        const promedio =
            deltas.reduce((suma, delta) => suma + delta, 0) / deltas.length;
        const rpDelta = redondeoSimetrico(promedio);

        for (let indice = inicio; indice <= fin; indice += 1) {
            clasificacion.push({
                ...ordenados[indice],
                posicionDesde: inicio + 1,
                posicionHasta: fin + 1,
                puesto: inicio + 1,
                rpDelta
            });
        }

        inicio = fin + 1;
    }

    return clasificacion;
};

const calcularClasificacionRanked = (jugadores) =>
    asignarPuestosPorOrden(
        [...jugadores].sort((a, b) => b.puntuacion - a.puntuacion)
    );

const esEmparejable = (rpA, rpB, tolerancia = 200) =>
    Math.abs(comoEntero(rpA) - comoEntero(rpB)) <= tolerancia;

module.exports = {
    LIGAS,
    DIVISIONES,
    comoEntero,
    obtenerLiga,
    obtenerDivision,
    obtenerSiguienteLiga,
    obtenerProgresoLiga,
    redondeoSimetrico,
    deltaPorPosicion,
    asignarPuestosPorOrden,
    calcularClasificacionRanked,
    esEmparejable
};
