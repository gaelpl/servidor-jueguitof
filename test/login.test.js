const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint POST /login', () => {

    // Registrar un usuario de prueba antes de ejecutar las pruebas de login
    beforeAll((done) => {
        request(servidor)
            .post('/register')
            .send({
                usuario: 'login_test',
                contrasena: 'passwordLogin123'
            })
            .end(done);
    });

    // Limpiar el usuario de prueba al finalizar todas las pruebas de este bloque
    afterAll((done) => {
        bd.run("DELETE FROM usuarios WHERE usuario = 'login_test'", done);
    });

    it('debe iniciar sesion exitosamente y devolver un token JWT', async () => {
        const respuesta = await request(servidor)
            .post('/login')
            .send({
                usuario: 'login_test',
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
                usuario: 'login_test',
                contrasena: 'passwordIncorrecto'
            });

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });

    it('debe fallar si el usuario no esta registrado', async () => {
        const respuesta = await request(servidor)
            .post('/login')
            .send({
                usuario: 'noexiste_test',
                contrasena: 'passwordLogin123'
            });

        expect(respuesta.statusCode).toBe(401);
        expect(respuesta.body.estado).toBe('error');
    });
});