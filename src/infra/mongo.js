import mongoose from "mongoose";
import { ENV } from "../config/env.js";

export async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(ENV.mongoUri);
  console.log("✅ Mongo connected");
}
  