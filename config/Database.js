import "dotenv/config";
import mongoose from "mongoose";

let connecting = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
    if (connecting) return connecting;

      const uri = process.env.MONGO_URI;
        if (!uri) {
            console.error("MONGO_URI is not set");
                process.exit(1);
                  }

                    console.log("Connecting to MongoDB...");

                      connecting = mongoose
                          .connect(uri, {
                                serverSelectionTimeoutMS: 10000, // fail fast instead of hanging
                                    })
                                        .then(() => {
                                              console.log("MongoDB connected");
                                                    return mongoose.connection;
                                                        })
                                                            .catch((err) => {
                                                                  connecting = null;
                                                                        console.error("MongoDB Connection Failed:", err.message);
                                                                              process.exit(1);
                                                                                  });

                                                                                    return connecting;
                                                                                    }

                                                                                    export default connectDB;