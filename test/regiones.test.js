const {
    PUNTOS_POR_REGION,
    REGIONES_POR_MAPA,
    normalizarNumeroMapa,
    esRegionValidaParaMapa,
    obtenerPuntosRegion
} = require('../config/regiones');

describe('Configuración de regiones', () => {
    it('define los puntos por bloque según el documento de reglas', () => {
        expect(PUNTOS_POR_REGION.azulNorte).toEqual([7, 5, 3]);
        expect(PUNTOS_POR_REGION.azulSureste).toEqual([7, 5, 3]);
        expect(PUNTOS_POR_REGION.rojoNoroeste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.rojoSureste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.rojoNoreste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.rojoSuroeste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.verdeNoroeste).toEqual([4, 3, 2]);
        expect(PUNTOS_POR_REGION.verdeEste).toEqual([4, 3, 2]);
        expect(PUNTOS_POR_REGION.lilaNorte).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.lilaSuroeste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.lilaSureste).toEqual([6, 4, 2]);
        expect(PUNTOS_POR_REGION.amarillo).toEqual([8, 6, 4]);
        expect(PUNTOS_POR_REGION.blanco).toEqual([8, 6, 4]);
        expect(PUNTOS_POR_REGION.naranjaNorte).toEqual([6, 4, 3]);
        expect(PUNTOS_POR_REGION.naranjaSur).toEqual([6, 4, 3]);
    });

    it('otorga cero puntos a partir del cuarto puesto', () => {
        expect(obtenerPuntosRegion('amarillo', 1)).toBe(8);
        expect(obtenerPuntosRegion('amarillo', 2)).toBe(6);
        expect(obtenerPuntosRegion('amarillo', 3)).toBe(4);
        expect(obtenerPuntosRegion('amarillo', 4)).toBe(0);
        expect(obtenerPuntosRegion('amarillo', 5)).toBe(0);
        expect(obtenerPuntosRegion('inexistente', 1)).toBe(0);
    });

    it('valida las regiones disponibles en cada mapa', () => {
        expect(REGIONES_POR_MAPA[1]).toContain('azulSureste');
        expect(REGIONES_POR_MAPA[2]).toContain('blanco');
        expect(REGIONES_POR_MAPA[3]).toContain('lilaSureste');
        expect(REGIONES_POR_MAPA[4]).toEqual(
            expect.arrayContaining([
                'rojoNoreste',
                'rojoSuroeste',
                'naranjaNorte',
                'naranjaSur'
            ])
        );

        expect(esRegionValidaParaMapa(1, 'naranjaNorte')).toBe(false);
        expect(esRegionValidaParaMapa(4, 'naranjaNorte')).toBe(true);
        expect(esRegionValidaParaMapa(4, 'azulSureste')).toBe(false);
    });

    it('normaliza mapas desconocidos al mapa 1', () => {
        expect(normalizarNumeroMapa(3)).toBe(3);
        expect(normalizarNumeroMapa('4')).toBe(4);
        expect(normalizarNumeroMapa(99)).toBe(1);
        expect(normalizarNumeroMapa(undefined)).toBe(1);
    });
});
