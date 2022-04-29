//jshint esversion:6

require("dotenv").config({ path: "./.env" });
const ejs = require("ejs");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const flash = require("connect-flash");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: false,
    })
);

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGOURL, { useNewUrlParser: true });

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    googleId: String,
    password: String,
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

// Defining Schema for posts
const postSchema = {
    user_id: String,
    username: String,
    title: String,
    content: String,
    answers: [{ answerTitle: String, answerBody: String, link: String }],
};

//Creating mongoose model ...
const Post = mongoose.model("Post", postSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: "http://localhost:3000/auth/google/secrets",
            userProfileLink: "https://www.googleapis.com/oauth2/v3/userinfo",
        },
        function (accessToken, refreshToken, profile, cb) {
            console.log(profile);
            User.findOrCreate({ googleId: profile.id }, function (err, user) {
                return cb(err, user);
            });
        }
    )
);

app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("home");
    } else {
        res.redirect("login");
    }
});

app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile"] })
);

app.get(
    "/auth/google/secrets",
    passport.authenticate("google", { failureRedirect: "/login" }),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect("/home");
    }
);

app.get("/login", (req, res) => {
    res.render("login", {
        error: req.flash("error"),
    });
});

app.get("/signup", (req, res) => {
    res.render("signup", { error: "" });
});

app.get("/home", (req, res) => {
    if (req.isAuthenticated()) {
        Post.find({}, function (err, posts) {
            if (!err) {
                res.render("home", {
                    posts: posts,
                });
            } else {
                res.send(404);
            }
        });
    } else {
        console.log("not Authenticated dice!");
        res.redirect("login");
    }
});

app.get("/post", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("post");
    } else {
        console.log("not Authenticated!");
        res.redirect("login");
    }
});

app.get("/questions/:postid", function (req, res) {
    const requestedPostId = req.params.postid;
    Post.findOne({ _id: requestedPostId }, function (err, post) {
        if (!err) {
            res.render("question", {
                postTitle: post.title,
                postBody: post.content,
                post_id: post._id,
                answers: post.answers,
            });
        }
    });
});

app.get("/answer", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("answer");
    } else {
        console.log("not Authenticated dice!");
        res.redirect("login");
    }
});

app.post("/search", function (req, res) {
    const searchPost = req.body.searchTarget;
    console.log(searchPost);
    Post.findOne({ title: searchPost }, function (err, post) {
        if (!err) {
            res.redirect("/questions/" + post._id);
        } else {
            res.send(err.message);
        }
    });
});

app.post("/logout", (req, res) => {
    req.logout();
    res.redirect("/");
});

app.post("/signup", (req, res) => {
    User.register(
        {
            username: req.body.username,
            email: req.body.email,
        },
        req.body.password,
        (err, user) => {
            if (err) {
                console.log(err);
                res.render("signup", {
                    error: "A user with given username already registered !",
                });
            } else {
                passport.authenticate("local")(req, res, function () {
                    console.log("Registered and Authenticated !");
                    res.redirect("/home");
                });
            }
        }
    );
});

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/home",
        failureRedirect: "/login",
        failureFlash: {
            type: "error",
            message: "Invalid username or password.",
        },
    })
);

app.post("/compose", function (req, res) {
    console.log(req.user.username);
    const newPost = new Post({
        user_id: req.user._id,
        username: req.user.username,
        title: req.body.postTitle,
        content: req.body.postBody,
    });
    newPost.save(function (err) {
        if (!err) {
            res.redirect("/");
        }
    });
});

app.post("/yourposts", function (req, res) {
    let user_id = req.user._id;
    Post.find({ user_id: user_id }, function (err, posts) {
        if (!err) {
            res.render("home", {
                posts: posts,
            });
        } else {
            res.send(404);
        }
    });
});

app.post("/answers/:postid", function (req, res) {
    let post_id = req.params.postid;
    // const username = req.user.username
    // console.log(req);
    let newAnswers = [];
    Post.findOne({ _id: post_id }, function (err, post) {
        if (!err) {
            const newAnswer = {
                answerTitle: req.body.answerTitle,
                answerBody: req.body.answerBody,
                link: req.body.suggestReference,
            };
            newAnswers.push(newAnswer);
            newAnswers = post.answers;
            newAnswers.push(newAnswer);
            console.log(newAnswers.length);
            Post.findOneAndUpdate(
                { _id: post_id },
                { $set: { answers: newAnswers } },
                { new: true },
                (err, post) => {
                    if (!err) {
                        console.log("Added User");
                        res.redirect("/questions/" + post._id);
                    } else {
                        res.send(err.message);
                    }
                }
            );
        } else {
            res.send(err.message);
        }
    });
});

app.use("/*", (req, res) => {
    res.send("404");
});

const port = process.env.PORT || 3000;

app.listen(port, (req, res) => {
    console.log(`listening on port ${port}`);
});
