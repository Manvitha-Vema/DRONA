const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Mentor = require("../models/mentorModel");
const Mentee = require("../models/menteeModel");
require("dotenv").config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;

      let user =
        (await Mentor.findOne({ googleId: profile.id })) ||
        (await Mentee.findOne({ googleId: profile.id }));

      if (!user) {
        // Assume Mentor by default; or handle different roles here
        user = new Mentor({
          name: profile.displayName,
          email,
          googleId: profile.id,
        });
        await user.save();
      }

      done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = (await Mentor.findById(id)) || (await Mentee.findById(id));
  done(null, user);
});
