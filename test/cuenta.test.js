const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint DELETE /account y Middleware de Seguridad', () => {

    let tokenAcceso = '';

    // Registrar e iniciar sesión para obtener un token válido antes de las pruebas
    beforeAll(async () => {
        await request(servidor)
            .post('/register')
            .send({
                correo: 'borrar@test.com',
                contrasena: 'passwordBorrar123'
            });

        const respuestaLogin = await request(servidor)
            .post('/login')
            .send({
                correo: 'borrar@test.com',
                contrasena: 'passwordBorrar123'
            });

        tokenAcceso = respuestaLogin.body.token;
    });

    afterAll((done) => {
        bd.run("DELETE FROM usuarios WHERE correo = 'borrar@test.com'", done);
    });

    it('debe denegar el acceso si no se envia el token JWT', async () => {
        const respuesta = await request(servidor).delete('/account');

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });

    it('debe denegar el acceso si se envia un token invalido', async () => {
        const respuesta = await request(servidor)
            .delete('/account')
            .set('Authorization', 'Bearer tokenInvalidoFalso123');

        expect(respuesta.statusCode).toBe(403);
        expect(respuesta.body.estado).toBe('error');
    });

    it('debe eliminar la cuenta exitosamente si se envia un token valido', async () => {
        const respuesta = await request(servidor)
            .delete('/account')
            .set('Authorization', `Bearer ${tokenAcceso}`);

        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.body.estado).toBe('exito');
    });
});