const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint POST /register', () => {

    // Limpiar el usuario de prueba después de cada test
    afterEach((done) => {
        bd.run("DELETE FROM usuarios WHERE correo = 'nuevo@test.com'", done);
    });

    it('debe registrar un usuario exitosamente con codigo 201', async () => {
        const respuesta = await request(servidor)
            .post('/register')
            .send({
                correo: 'nuevo@test.com',
                contrasena: 'passwordSeguro123'
            });

        expect(respuesta.statusCode).toBe(201);
        expect(respuesta.body.estado).toBe('exito');
        expect(respuesta.body.idUsuario).toBeDefined();
    });

    it('debe fallar si el correo ya se encuentra registrado', async () => {
        // Primer registro
        await request(servidor)
            .post('/register')
            .send({
                correo: 'nuevo@test.com',
                contrasena: 'passwordSeguro123'
            });

        // Intentar registrar el mismo correo de nuevo
        const respuestaDuplicada = await request(servidor)
            .post('/register')
            .send({
                correo: 'nuevo@test.com',
                contrasena: 'otroPassword'
            });

        expect(respuestaDuplicada.statusCode).toBe(400);
        expect(respuestaDuplicada.body.estado).toBe('error');
    });
});