const express = require('express');
const servidor = express();

servidor.use(express.json());

// Controlador para la ruta de verificación de estado
const manejarPruebaEstado = (solicitud, respuesta) => {
    respuesta.json({
        estado: 'exito',
        mensaje: 'Servidor de autenticación funcionando correctamente 🚀'
    });
};

servidor.get('/ping', manejarPruebaEstado);

// Iniciar servidor solo si se ejecuta directamente
if (require.main === module) {
    const PUERTO = process.env.PUERTO || 3000;
    servidor.listen(PUERTO, () => {
        console.log(`Servidor corriendo en el puerto ${PUERTO}`);
    });
}

module.exports = servidor;