import mongoose from "mongoose";

// Replace with your actual MongoDB connection URL
const dbURI = process.env.MONGODB_HOST ?? "mongodb://localhost";
const dbName = process.env.MONGODB_DBNAME ?? "sys-main";

export default () => {
  const url = `${dbURI}/${dbName}`;
  mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
  });

  const db = mongoose.connection;

  db.on("error", (error) => {
    console.error("MongoDB connection error:", error);
  });

  db.once("open", () => {
    console.log("Connected to MongoDB");
  });
};
