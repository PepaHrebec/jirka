var createError = require("http-errors");
var express = require("express");
var cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const session = require("express-session");
const cors = require("cors");
const port = 3000;
const connection = require("./db.js");
require("dotenv").config();

// init app
var app = express();
app.use(
  cors({
    origin: "https://site-production-70c0.up.railway.app",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// init session
app.use(
  session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      domain: "",
    },
  })
);

// init strategies and passport
const initializePassport = require("./passport.js");
initializePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

app.get("/", async (req, res) => {
  const totalPages = 500;
  const randomPage = Math.floor(Math.random() * totalPages) + 1;

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.API}&page=${randomPage}&language=cs-CZ`
    );
    const data = await response.json();

    if (req.user) {
      connection.execute(
        "SELECT movie_id FROM relations WHERE user_id = ?",
        [req.user.id],
        function (err, resp) {
          if (err) {
            console.error("Chyba při načítání oblíbených filmů:", err);
            return res.status(500).send("Chyba serveru");
          }

          const likedMovies = resp.map((film) => film.movie_id);

          data.results = data.results.map((movie) => ({
            ...movie,
            liked: likedMovies.includes(movie.id),
          }));

          console.log(data.results);
          res.json(data);
        }
      );
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error("Chyba při načítání oblíbených filmů:", error);
    res.status(500).send("Chyba při načítání filmů");
  }
});

app.listen(port, () => {
  console.log(`Node listening on port ${port}`);
});

app.get("/movie/:id", async (req, res) => {
  const movieId = req.params.id;
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.API}&language=cs-CZ`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    // Ošetření chyb
    console.error(error);
    res.status(500).send("Chyba při získávání dat o filmu");
  }
});
app.get("/movie/search/:name", async (req, res) => {
  const movieName = req.params.name;
  console.log(`Searching for movie: ${movieName}`);
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${
        process.env.API
      }&query=${encodeURIComponent(movieName)}&language=cs-CZ`
    );
    const data = await response.json();

    connection.execute(
      "SELECT movie_id FROM relations WHERE user_id = ?",
      [req.user.id],
      function (err, resp) {
        // Používáme map pro změnu objektů přímo v poli
        data.results = data.results.map((movie) => {
          let liked = false;
          resp.forEach((film) => {
            if (movie.id == film.movie_id) {
              liked = true;
            }
          });
          // Vytvoříme nový objekt, který obsahuje původní data a přidáme liked
          return { ...movie, liked };
        });
        console.log(data.results); // Tiskneme data s liked flagem
        res.json(data); // Posíláme upravená data zpět
      }
    );
  } catch (error) {
    console.error("Chyba při hledání filmu:", error);
    res.status(500).send("Chyba při hledání filmu");
  }
});

app.post("/register", async (req, res) => {
  console.log(req.body);
  connection.execute(
    "SELECT * FROM users WHERE user_name = ? ",
    [req.body.username],
    function (error, results, fields) {
      if (error) throw error;
      if (results.length !== 0) {
        return res
          .status(400)
          .json({ message: "Toto uživatelské jméno je již zabrané!" });
      }
      bcrypt.hash(req.body.password, 8, function (error, hash) {
        connection.execute(
          "INSERT INTO users (user_name, password) VALUES (?,?)",
          [req.body.username, hash],
          function (error, results) {
            if (error) throw error;
            // res.redirect("http://localhost:8080");
            return res.sendStatus(200);
          }
        );
      });
    }
  );
});
app.post("/login", async (req, res, next) => {
  passport.authenticate("local", function (err, user, info) {
    if (err) {
      console.log(err);
      return next(err);
    }
    console.log(user);
    if (!user) {
      return res.status(401).json({ message: "Neplatné přihlašovací údaje" });
    }

    req.login(user, function () {
      console.log("něco");
      return res.sendStatus(200);
    });
  })(req, res, next);
});
app.get("/test", async (req, res) => {
  console.log(req.user);
  res.json(req.user);
});

app.get("/db", async (req, res) => {
  connection.query("SELECT * FROM users", function (error, results, fields) {
    if (error) throw error;
    console.log("The solution is: ", results);
    res.json(results);
  });
});
app.get("/user-info", async (req, res) => {
  console.log(req.user);
  if (req.user) {
    const obj = { name: req.user.user_name, id: req.user.id };
    res.json(obj);
  } else {
    res.sendStatus(401);
  }
});

app.post("/logout", (req, res) => {
  if (req.isAuthenticated()) {
    req.logout((err) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Odhlášení selhalo.", error: err });
      }
      return res
        .status(200)
        .json({ message: "Uživatel byl úspěšně odhlášen." });
    });
  } else {
    res.status(400).json({ message: "Uživatel není přihlášen." });
  }
});
app.post("/list/:id", (req, res) => {
  const movieId = req.params.id;
  console.log("movieId: ", movieId);
  console.log("userId: ", req.user);

  connection.execute(
    "SELECT * FROM relations WHERE movie_id = ? AND user_id = ?",
    [movieId, req.user.id],
    function (error, results) {
      if (results.length == 0) {
        connection.execute(
          "INSERT INTO relations (user_id, movie_id) VALUES (?, ?)",
          [req.user.id, movieId],
          function (err, resp) {
            if (err) {
              res.sendStatus(400);
            } else {
              res.sendStatus(200);
            }
          }
        );
      } else {
        connection.execute(
          "DELETE FROM relations WHERE movie_id = ? AND user_id = ?",
          [movieId, req.user.id],
          function (err, resp) {
            if (err) {
              res.sendStatus(400);
            } else {
              res.sendStatus(200);
            }
          }
        );
      }
    }
  );
});
app.get("/search/liked", async (req, res) => {
  connection.execute(
    "SELECT movie_id FROM relations WHERE user_id = ?",
    [req.user.id],
    async function (err, resp) {
      if (err) {
        console.error(err);
        return res.status(500).send("Chyba při získávání dat z databáze");
      }
      const moviesArray = []; // Vytvoření pole pro filmy
      for (const movie of resp) {
        try {
          const response = await fetch(
            `https://api.themoviedb.org/3/movie/${movie.movie_id}?api_key=${process.env.API}&language=cs-CZ`
          );
          const data = await response.json();

          // Vytvoření objektu bez ID a nežádoucích klíčů
          const movieObj = {
            id: data.id,
            backdrop_path: data.backdrop_path,
            original_language: data.original_language,
            original_title: data.original_title,
            overview: data.overview,
            popularity: data.popularity,
            poster_path: data.poster_path,
            release_date: data.release_date,
            title: data.title,
            vote_average: data.vote_average,
            vote_count: data.vote_count,
            liked: true,
          };
          // Přidání objektu do pole
          moviesArray.push(movieObj);
        } catch (error) {
          console.error(error);
          return res.status(500).send("Chyba při získávání dat o filmu");
        }
      }
      console.log(moviesArray);

      res.json(moviesArray); // Odeslání výsledného pole objektů
    }
  );
});
