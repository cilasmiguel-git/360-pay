import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const userConn = mongoose.createConnection(process.env.MONGODB_URL_USERS);
export const payConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS);

userConn.on('connected', () => console.log(`MongoDB Users Connected: ${userConn.host}`));
userConn.on('error', (err) => console.error(`Error connecting to Users DB: ${err.message}`));

payConn.on('connected', () => console.log(`MongoDB Payments Connected: ${payConn.host}`));
payConn.on('error', (err) => console.error(`Error connecting to Payments DB: ${err.message}`));
