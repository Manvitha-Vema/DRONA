const mongoose = require("mongoose");

const userOtpVerifySchema = new mongoose.Schema({
  userId: String,
  otp: String,
  createdAt: Date,
  expiresAt: Date,
});

module.exports = mongoose.model("userOtpVerify", userOtpVerifySchema);
