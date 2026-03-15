// This file will run before all tests
// You can use it to mock global dependencies, environment variables, etc.

jest.setTimeout(30000); // 30 seconds for long running tests

afterAll(async () => {
    // Clean up any remaining handles
    // await sequelize.close() // if imported
});
