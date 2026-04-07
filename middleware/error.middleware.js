function notFound(req, res) {
  res.status(404).json({
    ok: false,
    message: `Ruta no encontrada: ${req.originalUrl}`
  });
}

function errorHandler(err, req, res, next) {
  console.error(err);

  res.status(err.statusCode || 500).json({
    ok: false,
    message: err.message || 'Error interno del servidor'
  });
}

module.exports = {
  notFound,
  errorHandler
};