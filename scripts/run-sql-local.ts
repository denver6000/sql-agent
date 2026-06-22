process.env.SQL_WORKSPACE_BACKEND = "mysql";
process.env.SQL_HOST ??= "127.0.0.1";
process.env.SQL_PORT ??= "3306";
process.env.SQL_USER ??= "root";
process.env.SQL_PASSWORD ??= "";
process.env.SQL_DATABASE ??= "";

await import("../index.js");
