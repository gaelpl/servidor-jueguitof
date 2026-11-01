const bd = require('../BD/base-datos');
const bcrypt = require('bcrypt');

describe('Pruebas del Modelo de Base de Datos y Encriptacion', () => {
    
    // Limpiar el registro de prueba al terminar las ejecuciones
    afterAll((done) => {
        bd.run("DELETE FROM usuarios WHERE usuario = 'prueba_test'", () => {
            bd.close(done);
        });
    });

    it('debe encriptar correctamente una contraseña con bcrypt', async () => {
        const contrasenaPlana = 'miPassword123';
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(contrasenaPlana, saltRounds);

        const esCoincidente = await bcrypt.compare(contrasenaPlana, hashedPassword);
        expect(esCoincidente).toBe(true);
    });

    it('debe permitir insertar un usuario en la base de datos SQLite', (done) => {
        const usuarioPrueba = 'prueba_test';
        const passPrueba = 'hashSeguro123';

        bd.run(
            'INSERT INTO usuarios (usuario, contrasena) VALUES (?, ?)',
            [usuarioPrueba, passPrueba],
            function (error) {
                expect(error).toBeNull();
                expect(this.lastID).toBeGreaterThan(0);
                done();
            }
        );
    });
});