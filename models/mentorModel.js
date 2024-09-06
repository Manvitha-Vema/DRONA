const mongoose = require("mongoose");

const mentorSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  // googleId: String,
  twoFactorSecret: String,
  isVerified: Boolean,
});

module.exports = mongoose.model("Mentor", mentorSchema);
