const request = require('supertest');
const servidor = require('../index');
const bd = require('../BD/base-datos');

describe('Pruebas del Endpoint POST /register', () => {

    // Limpiar los usuarios de prueba después de cada test
    afterEach((done) => {
        bd.run(
            "DELETE FROM usuarios WHERE LOWER(usuario) IN ('nuevo_test', 'nuevo_trim')",
            done
        );
    });

    it('debe registrar un usuario exitosamente con codigo 201', async () => {
        const respuesta = await request(servidor)
            .post('/register')
            .send({
                usuario: 'nuevo_test',
                contrasena: 'passwordSeguro123'
            });

        expect(respuesta.statusCode).toBe(201);
        expect(respuesta.body.estado).toBe('exito');
        expect(respuesta.body.idUsuario).toBeDefined();
        expect(respuesta.body.token).toBeDefined();
    });

    it('debe fallar si el usuario ya se encuentra registrado', async () => {
        // Primer registro
        await request(servidor)
            .post('/register')
            .send({
                usuario: 'nuevo_test',
                contrasena: 'passwordSeguro123'
            });

        // Intentar registrar el mismo usuario de nuevo
        const respuestaDuplicada = await request(servidor)
            .post('/register')
            .send({
                usuario: 'nuevo_test',
                contrasena: 'otroPassword'
            });

        expect(respuestaDuplicada.statusCode).toBe(400);
        expect(respuestaDuplicada.body.estado).toBe('error');
    });

    it('debe rechazar duplicados ignorando mayusculas, minusculas y espacios', async () => {
        await request(servidor)
            .post('/register')
            .send({
                usuario: 'nuevo_test',
                contrasena: 'passwordSeguro123'
            });

        const variantes = ['NUEVO_TEST', 'Nuevo_Test', '  nuevo_test  '];

        for (const usuario of variantes) {
            const respuesta = await request(servidor)
                .post('/register')
                .send({
                    usuario,
                    contrasena: 'otroPassword'
                });

            expect(respuesta.statusCode).toBe(400);
            expect(respuesta.body.estado).toBe('error');
        }
    });

    it('debe normalizar los espacios alrededor del usuario al registrarse', async () => {
        const respuesta = await request(servidor)
            .post('/register')
            .send({
                usuario: '  nuevo_trim  ',
                contrasena: 'passwordSeguro123'
            });

        expect(respuesta.statusCode).toBe(201);

        const respuestaLogin = await request(servidor)
            .post('/login')
            .send({
                usuario: 'nuevo_trim',
                contrasena: 'passwordSeguro123'
            });

        expect(respuestaLogin.statusCode).toBe(200);
        expect(respuestaLogin.body.estado).toBe('exito');
    });
});