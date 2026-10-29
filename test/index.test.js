const request = require('supertest');
const servidor = require('../index');

describe('Pruebas de la ruta GET /ping', () => {
    it('debe responder con codigo 200 y un mensaje de exito', async () => {
        const respuesta = await request(servidor).get('/ping');
        
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.body.estado).toBe('exito');
        expect(respuesta.body.mensaje).toBeDefined();
    });
});