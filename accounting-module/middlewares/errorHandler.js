const errorHandler = (err, req, res, next) => {
    console.error(`[Accounting API Error]: ${err.message}`);
    // If it's a Sequelize validation error or custom business logic error
    const status = err.status || 400;

    res.status(status).json({
        success: false,
        error: {
            message: err.message || 'An unexpected error occurred in the accounting module.',
            details: err.errors ? err.errors.map(e => e.message) : null
        }
    });
};

module.exports = errorHandler;
