const mongoose = require("mongoose");

const menteeSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  // googleId: String,
  twoFactorSecret: String,
  isVerified: Boolean,
});

module.exports = mongoose.model("Mentee", menteeSchema);
