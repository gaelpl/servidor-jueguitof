const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint POST /login', () => {

    // Registrar un usuario de prueba antes de ejecutar las pruebas de login
    beforeAll((done) => {
        request(servidor)
            .post('/register')
            .send({
                correo: 'login@test.com',
                contrasena: 'passwordLogin123'
            })
            .end(done);
    });

    // Limpiar el usuario de prueba al finalizar todas las pruebas de este bloque
    afterAll((done) => {
        bd.run("DELETE FROM usuarios WHERE correo = 'login@test.com'", done);
    });

    it('debe iniciar sesion exitosamente y devolver un token JWT', async () => {
        const respuesta = await request(servidor)
            .post('/login')
            .send({
                correo: 'login@test.com',
                contrasena: 'passwordLogin123'
            });

        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.body.estado).toBe('exito');
        expect(respuesta.body.token).toBeDefined();
    });

    it('debe fallar si la contraseña es incorrecta', async () => {
        const respuesta = await request(servidor)
            .post('/login')
            .send({
                correo: 'login@test.com',
                contrasena: 'passwordIncorrecto'
            });

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });

    it('debe fallar si el correo no esta registrado', async () => {
        const respuesta = await request(servidor)
            .post('/login')
            .send({
                correo: 'noexiste@test.com',
                contrasena: 'passwordLogin123'
            });

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });
});