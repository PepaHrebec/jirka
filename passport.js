const bcrypt = require("bcryptjs");
const LocalStrategy = require("passport-local").Strategy;
const connection = require("./db.js");

function init(passport) {
  const authenticateUser = async (username, password, done) => {
    try {
      // const user = await User.findOne({ username: username });
      connection.execute(
        "SELECT * FROM users WHERE user_name = ? ",
        [username],
        function (error, results, fields) {
          if (error) throw error;
          if (results.length === 0) {
            return done(null, false, { message: "Incorrect username" });
          }
          const user = results[0];
          bcrypt.compare(password, user.password, (err, res) => {
            if (err) {
              return done(err);
            } else if (res) {
              return done(null, user);
            } else {
              return done(null, false, { message: "Incorrect password" });
            }
          });
        }
      );
    } catch (err) {
      return done(err);
    }
  };
  passport.use(new LocalStrategy(authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async function (id, done) {
    try {
      connection.execute(
        "SELECT * FROM users WHERE id = ? ",
        [id],
        function (error, results, fields) {
          const user = results[0];
          done(null, user);
        }
      );
    } catch (err) {
      done(err);
    }
  });
}

module.exports = init;
