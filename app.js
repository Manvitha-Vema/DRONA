const express = require("express");
const app = express();
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const ejsMate = require("ejs-mate");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const Mentor = require("./models/mentorModel");
const Mentee = require("./models/menteeModel");
const userOtpVerify = require("./models/userOtpVerify");
const bodyParser = require("body-parser");

let transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.set("views", path.join(__dirname, "views"));

const Mongo =
  "mongodb+srv://manvithamanni13:hBkIw9pR7jmpfv9l@cluster0.zsw3k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use(passport.initialize());
app.use(passport.session());

main()
  .then(() => {
    console.log("connected");
  })
  .catch((err) => {
    console.log("not connected");
  });

async function main() {
  await mongoose.connect(Mongo, {});
}

app.use(express.static("public"));

app.get("/select", (req, res) => {
  res.render("index.ejs");
});

app.get("/", (req, res) => {
  res.render("hero.ejs");
});

app.get("/login", (req, res) => {
  res.render("users/login.ejs");
});

app.get("/signup", (req, res) => {
  res.render("users/signin.ejs");
});
app.get("/verify", (req, res) => {
  res.render("users/verify.ejs");
});
// app.get("/test-redirect", (req, res) => {
//   res.redirect("/verify");
// });

app.post("/signup", async (req, res) => {
  // res.render("users/verify.ejs");
  // try {
  const { email, password, role } = req.body;

  // Validate input fields
  if (email == "" || password == "" || role == "") {
    return res.status(400).json({ message: "Empty input field" });
    // } else if (!/^[a-zA-Z]*$/.test(name)) {
    //   return res.status(400).json({ message: "Invalid name entered" });
  } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    return res.status(400).json({ message: "Invalid email entered" });
  } else if (password.length < 6) {
    return res.status(400).json({ message: "Password is too short" });
  }

  const userModel = role === "mentor" ? Mentor : Mentee;
  const hashedPassword = await bcrypt.hash(password, 12);
  const existingUser = await userModel.findOne({ email });
  console.log(userModel);

  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }

  const newUser = new userModel({
    email,
    password: hashedPassword,
    isVerified: false,
  });
  console.log(newUser.isVerified);
  await newUser.save();
  // Store necessary details in the session for 2FA verification
  req.session.userid = newUser._id;
  req.session.email = newUser.email;
  req.session.role = role;

  // return res.status(400).json({ message: "2FA verification pending" });

  console.log("Session data set:", req.session);

  // Send verification email
  await sendVerificationEmail(newUser);

  // Render the verification page if successful
  console.log("Before redirect to /verify");
  return res.redirect("/verify");
  // return res.render("users/verify.ejs");
  // console.log("ushu");
  // } catch (error) {
  //   console.log("Error during signup:", error.message);
  //   return res.status(500).json({ message: "Internal server error" });
  // }
});

// Login Route
// router.post("/login", async (req, res) => {
//   const { email, password, role } = req.body;

//   const userModel = role === "mentor" ? Mentor : Mentee;
//   const user = await userModel.findOne({ email });

//   if (!user || !(await bcrypt.compare(password, user.password))) {
//     return res.status(400).json({ message: "Invalid credentials" });
//   }

//   if (!user.isVerified)
//     return res.status(400).json({ message: "2FA verification pending" });

//   const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY);
//   res.json({ token });
// });

// module.exports = router;

app.post("/verify-2fa", async (req, res) => {
  try {
    const userModel = req.session.role === "mentor" ? Mentor : Mentee;
    const email = req.session.email;
    const userId = req.session.userid;
    console.log(userModel, email, userId);
    const user = await userModel.findOne({ email });
    const { otp } = req.body;
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
});

const sendVerificationEmail = async ({ _id, email }) => {
  try {
    console.log("ohoo");
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Email",
      html: `<p>Enter <b>${otp}</b> in the app to verify your email address</p><p>This code <b>expires in 1 hour</b>.</p>`,
    };

    const hashedOTP = await bcrypt.hash(otp, 10);

    const newUserOtpVerify = new userOtpVerify({
      userId: _id,
      otp: hashedOTP,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    await newUserOtpVerify.save();

    await transporter.sendMail(mailOptions);

    console.log("Email sent and OTP saved.");
  } catch (error) {
    console.log("Error while sending verification email:", error.message);

    // return res.status(400).json({ message: error.message });
    throw new Error(error.message);
  }
};

// const authRoutes = require("./routes/auth");
// app.use("/auth", authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
