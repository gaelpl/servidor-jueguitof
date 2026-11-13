const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint GET /session', () => {
    let token;

    beforeAll(async () => {
        const respuesta = await request(servidor)
            .post('/register')
            .send({
                usuario: 'sesion_test',
                contrasena: 'passwordSesion123'
            });

        token = respuesta.body.token;
    });

    afterAll((done) => {
        bd.run(
            "DELETE FROM usuarios WHERE LOWER(usuario) IN ('sesion_test', 'sesion_borrada')",
            done
        );
    });

    it('devuelve la sesión activa con un token válido', async () => {
        const respuesta = await request(servidor)
            .get('/session')
            .set('Authorization', `Bearer ${token}`);

        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.body.estado).toBe('exito');
        expect(respuesta.body.usuario).toBe('sesion_test');
    });

    it('rechaza la petición sin token', async () => {
        const respuesta = await request(servidor).get('/session');

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });

    it('rechaza un token inválido', async () => {
        const respuesta = await request(servidor)
            .get('/session')
            .set('Authorization', 'Bearer token-invalido');

        expect(respuesta.statusCode).toBe(403);
        expect(respuesta.body.estado).toBe('error');
    });

    it('rechaza el token de una cuenta eliminada', async () => {
        const registro = await request(servidor)
            .post('/register')
            .send({
                usuario: 'sesion_borrada',
                contrasena: 'passwordSesion123'
            });

        await request(servidor)
            .delete('/account')
            .set('Authorization', `Bearer ${registro.body.token}`);

        const respuesta = await request(servidor)
            .get('/session')
            .set('Authorization', `Bearer ${registro.body.token}`);

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });
});
