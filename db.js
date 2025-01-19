var mysql = require("mysql2");
var connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "movies",
});

connection.connect();
module.exports = connection;
