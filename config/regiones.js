const PUNTOS_POR_REGION = {
    azulNorte: [7, 5, 3],
    azulSureste: [7, 5, 3],
    rojoNoroeste: [6, 4, 2],
    rojoSureste: [6, 4, 2],
    rojoNoreste: [6, 4, 2],
    rojoSuroeste: [6, 4, 2],
    verdeNoroeste: [4, 3, 2],
    verdeEste: [4, 3, 2],
    lilaNorte: [6, 4, 2],
    lilaSuroeste: [6, 4, 2],
    lilaSureste: [6, 4, 2],
    amarillo: [8, 6, 4],
    blanco: [8, 6, 4],
    naranjaNorte: [6, 4, 3],
    naranjaSur: [6, 4, 3]
};

const REGIONES_POR_MAPA = {
    1: [
        'amarillo',
        'azulNorte',
        'lilaNorte',
        'rojoNoroeste',
        'verdeNoroeste',
        'verdeEste',
        'lilaSuroeste',
        'rojoSureste',
        'azulSureste'
    ],
    2: [
        'blanco',
        'amarillo',
        'azulNorte',
        'azulSureste',
        'lilaNorte',
        'rojoNoroeste',
        'rojoSureste',
        'verdeNoroeste'
    ],
    3: [
        'amarillo',
        'blanco',
        'lilaNorte',
        'lilaSuroeste',
        'lilaSureste',
        'rojoNoroeste',
        'rojoSureste',
        'verdeNoroeste',
        'azulNorte'
    ],
    4: [
        'naranjaNorte',
        'naranjaSur',
        'amarillo',
        'azulNorte',
        'verdeNoroeste',
        'rojoNoroeste',
        'rojoNoreste',
        'rojoSuroeste',
        'rojoSureste',
        'lilaNorte'
    ]
};

const normalizarNumeroMapa = (numeroMapa) => {
    const numero = Number(numeroMapa);
    return REGIONES_POR_MAPA[numero] ? numero : 1;
};

const esRegionValidaParaMapa = (numeroMapa, region) => {
    const regiones = REGIONES_POR_MAPA[normalizarNumeroMapa(numeroMapa)];
    return Boolean(regiones && regiones.includes(region));
};

const obtenerPuntosRegion = (region, puesto) => {
    const puntos = PUNTOS_POR_REGION[region];
    if (!puntos) return 0;
    return puntos[puesto - 1] || 0;
};

module.exports = {
    PUNTOS_POR_REGION,
    REGIONES_POR_MAPA,
    normalizarNumeroMapa,
    esRegionValidaParaMapa,
    obtenerPuntosRegion
};
