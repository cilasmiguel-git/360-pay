import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Vercel Connection Caching
let userConn = global.mongooseUserConn;
if (!userConn) {
  userConn = global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS);
}

let payConn = global.mongoosePayConn;
if (!payConn) {
  payConn = global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS);
}

export { userConn, payConn };

userConn.on('connected', () => console.log(`MongoDB Users Connected: ${userConn.host}`));
userConn.on('error', (err) => console.error(`Error connecting to Users DB: ${err.message}`));

payConn.on('connected', () => console.log(`MongoDB Payments Connected: ${payConn.host}`));
payConn.on('error', (err) => console.error(`Error connecting to Payments DB: ${err.message}`));
