const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const transporter = require("../nodemailerConfig");
const Mentor = require("../models/mentorModel");
const Mentee = require("../models/menteeModel");
const userOtpVerify = require("../models/userOtpVerify");

const router = express.Router();
let transporter = nodemailer.createTransport({
  host: "smtp-mail.outlook.com",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 2FA Setup
router.post("/setup-2fa", async (req, res) => {
  const { email, role } = req.body;

  const userModel = role === "mentor" ? Mentor : Mentee;
  const user = await userModel.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  const secret = speakeasy.generateSecret({ name: "My Mentor App" });
  user.twoFactorSecret = secret.base32;

  await user.save();

  qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
    res.json({ qrCode: dataUrl, secret: secret.base32 });
  });
});

// 2FA Verify
router.post("/verify-2fa", async (req, res) => {
  try {
    const userModel = role === "mentor" ? Mentor : Mentee;
    const user = await userModel.findOne({ email });
    const { userId, otp } = req.body;
    if (!user || !otp) {
      throw Error("Empty otp details are not allowed");
    } else {
      const userOtp = await userOtpVerify.find({
        userId,
      });
      if (userOtp.length <= 0) {
        throw Error(
          "Account record does not exist or verified already.Please sign up"
        );
      } else {
        const { expiresAt } = userOtp[0];
        const hashedOTP = userOtp[0].otp;

        if (expiresAt < Date.now()) {
          await userOtpVerify.deleteMany({ userId });
          throw Error("Code has been expired.Please request again");
        } else {
          const validOTP = await bcrypt.compare(otp, hashedOTP);
          if (!validOTP) {
            throw Error("Invalid code");
          } else {
            await userModel.updateOne({ _id: userId }, { verified: true });
            await userOtpVerify.deleteMany({ userId });
            res.render("index");
          }
        }
      }
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }

  //   const userModel = role === "mentor" ? Mentor : Mentee;
  //   const user = await userModel.findOne({ email });

  //   if (!user || !user.twoFactorSecret)
  //     return res.status(400).json({ message: "User not found" });

  //   const verified = speakeasy.totp.verify({
  //     secret: user.twoFactorSecret,
  //     encoding: "base32",
  //     token,
  //   });

  //   if (verified) {
  //     user.isVerified = true;
  //     await user.save();
  //     res.json({ message: "2FA verified!" });
  //   } else {
  //     res.status(400).json({ message: "Invalid token" });
  //   }
});

// Sign-up Route
router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (name == "" || email == "" || password == "" || role == "") {
    res.status(400).json({ message: "Empty input feild" });
  } else if (!/^[a-zA-Z]*$/.test(name)) {
    res.status(400).json({ message: "Invalid name entered" });
  } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    res.status(400).json({ message: "Invalid email entered" });
  } else if (password.length < 6) {
    res.status(400).json({ message: "password is too short" });
  } else {
    const userModel = role === "mentor" ? Mentor : Mentee;

    const hashedPassword = await bcrypt.hash(password, 12);

    const existingUser = await userModel.findOne({ email });

    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const newUser = new userModel({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
    });
    newUser
      .save()
      .then((result) => {
        sendVerificationEmail(result, res);
      })
      .catch((err) => {
        res.status(400).json({ message: "Error occured while saving account" });
      });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  const userModel = role === "mentor" ? Mentor : Mentee;
  const user = await userModel.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  if (!user.isVerified)
    return res.status(400).json({ message: "2FA verification pending" });

  const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY);
  res.json({ token });
});

module.exports = router;

const sendVerificationEmail = async ({ _id, email }) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Email",
      //   text: `Your 2FA code is: ${speakeasy.totp({
      //     secret: newUser.twoFactorSecret,
      //     encoding: "base32",
      //   })}`,
      html: `<p>Enter <b>${otp}</b> in the app to verify your email address</p><p>This code <b>expries in 1 hour</b>.</p>`,
    };

    const hashedOTP = await bcrypt.hash(otp, 10);
    const newUserOtpVerify = new userOtpVerify({
      userId: _id,
      otp: hashedOTP,
      createdAt: Date.now(),
      expiresAt: Date.noew() + 3600000,
    });
    await newUserOtpVerify.save();
    await transporter.sendMail(mailOptions);
    res.render("users/verify.ejs");
  } catch (error) {}
};
