import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ApiError } from "./utils/ApiError.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" })); // means that our app is accepting json and max limit is 16kb
app.use(express.urlencoded({ extended: true, limit: "16kb" })); // this used for url
app.use(express.static("public"));
app.use(cookieParser());

// import routes
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import commentRouter from "./routes/comment.routes.js";
import likeRouter from "./routes/like.routes.js";
import tweetRouter from "./routes/tweet.routes.js";
import playlistRouter from "./routes/playlist.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/subscription", subscriptionRouter);
app.use("/api/v1/comment", commentRouter);
app.use("/api/v1/like", likeRouter);
app.use("/api/v1/tweet", tweetRouter);
app.use("/api/v1/playlist", playlistRouter);

// Error-handling middleware
app.use((err, req, res, next) => {
  // Check if it's an instance of your custom ApiError
  if (err instanceof ApiError) {
    // Use the ApiError's toJson method to format the error response
    return res.status(err.statusCode).json({
      success: err.success,
      message: err.message,
      statusCode: err.statusCode,
      errors: err.errors || null,
    });
  }

  // For unexpected errors, return a generic response
  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});

export default app;
