import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { isValidObjectId } from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
  const user = await User.findById(userId);
  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};
const registerUser = asyncHandler(async (req, res) => {
  //get user detail from frontend
  //validation - check not empty
  //check if user alredy exists: username,email
  //check for images, and avatar
  //upload them to cloudinary
  //create user object - create entry in db
  //remove password and refresh token from response
  //check for user creation
  //return response

  const { fullName, email, username, password } = req.body;
  console.log("email:", email);
  //validation new way
  if (
    [fullName, email, password, username].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(404, "All field are required");
  }

  // validation old way
  //   if(fullName===""|| password==="" || email==="" || username===""){
  //     throw new ApiError(404, "All field are required");
  //   }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username alredy exists");
  }
  //multer gives file access through middleware

  // console.log(req.files);

  // const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  // let coverImageLocalPath;
  // if (
  //   req.files &&
  //   Array.isArray(req.files.coverImage) &&
  //   req.files.coverImage.length > 0
  // ) {
  //   coverImageLocalPath = req.files.coverImage[0].path;
  // }

  // if (!avatarLocalPath) {
  //   throw new ApiError(400, "Avatar file is required");
  // }

  // const avatar = await uploadOnCloudinary(avatarLocalPath);
  // const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // if (!avatar) {
  //   throw new ApiError(400, "Avatar file is required");
  // }

  const user = await User.create({
    fullName,
    // avatar: avatar.url,
    // coverImage: coverImage?.url || "",
    avatar: "",
    coverImage: "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) {
    throw new ApiError(500, "something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //get username email and password
  //validate fields not empty
  //check user exist or not
  // password check
  // generate access and refresh token
  //send cookie
  //login user
  //return response

  const { username, password, email } = req.body;
  if (!(username || email)) {
    throw new ApiError(400, "username or email is required");
  }
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "user does not exist");
  }

  // so the mongoes User has only inbuilt methods like findOne
  // and custom methods that we have create are available in
  // mongodb returned (instance) object in this case user has the custom methods

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // so options use in cokies if we write this options then cookies
  // is only modifieble from server and if we not write this then cookies in default modifieble frontend also

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from the document
      },
    },
    {
      new: true, //because of this the return response return new updated values
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, "Invalid refresh Token");
    }
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Token is used or expired");
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );

    const options = {
      httpOnly: true,
      secure: true,
    };

    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ApiError(401, "Unauthorized Access");
  }
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid Password");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  //check we get username or not
  if (!req.user) {
    throw new ApiError(401, "unauthorized Access");
  }

  //aggregation pipline
  const channel = await User.aggregate([
    {
      //this is first stage
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
      //from this stage we get the specific user that channel details we want
    },
    {
      //this is second stage
      $lookup: {
        from: "subscriptions", // we have to convert this model name in lowercase and plural and this is subscription model
        localField: "_id", // we are writing pipeline in user so this is User id
        foreignField: "channel", // this is subscription model field
        as: "subscribers", // we have given this stage 2 data a name that we can refer in below stages
        // and in this stage we get all document of channell and its subscriber ex:(i have 25000 subscribers on my channel)
      },
    },
    {
      //this is third stage
      //in this stage we want channels that current user subscribedTO ex:(i have suscribed 25channels on youtube)
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      //$addFields = this add additional fields in User
      $addFields: {
        //calculate total subscribers
        subscribersCount: {
          $size: "$subscribers", //we have to use $ because this is field and this is from stage two
        },
        //calculat total channels that user subscribed
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        //subscriber button value true or false like if true then grey and false then red
      },
    },
    {
      //$project = this is used so that we can give selected fields
      //we have write 1 for every field that we have to pass, this 1 work as flag
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        avatar: 1,
        coverImage: 1,
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "user channel fetched successfully")
    );
  // if (!user) {
  //   throw new ApiError(401, "Unauthorized Access");
  // }
  // return res
  //   .status(200)
  //   .json(new ApiResponse(200, user, "Current user Fetched Scuccessfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { username, fullName } = req.body;

  // Ensure at least one field is provided (username or fullName)
  if (!username && !fullName) {
    throw new ApiError(401, "Please enter a username or full name");
  }

  if (!req.user) {
    throw new ApiError(401, "Unauthorized request");
  }

  // Set default values if some fields are missing in the request
  const newUsername = username || req.user.username;
  const newFullName = fullName || req.user.fullName;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName: newFullName,
        username: newUsername,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  // const avatarLocalPath = req.files?.avatar[0]?.path;
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(401, "Avatar file is Missing");
  }
  if (!req.user) {
    throw new ApiError(401, "unauthorized Access");
  }
  const oldAvatarUrl = req.user.avatar;
  const publicId = oldAvatarUrl.split("/").pop().split(".")[0];
  const deleteResponse = await deleteFromCloudinary(publicId);
  if (!deleteResponse) {
    throw new ApiError(501, "Error while deleting avatar");
  }
  const response = await uploadOnCloudinary(avatarLocalPath);
  if (!response.url) {
    throw new ApiError(501, "Error while uploading on avatar");
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: response.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ApiError(401, "CoverImage file is Missing");
  }
  if (!req.user) {
    throw new ApiError(401, "unauthorized Access");
  }
  const oldCoverImageUrl = req.user.coverImage;
  const publicId = oldCoverImageUrl.split("/").pop().split(".")[0];
  const deleteResponse = await deleteFromCloudinary(publicId);
  if (!deleteResponse) {
    throw new ApiError(501, "Error while deleting avatar");
  }
  const response = await uploadOnCloudinary(coverImageLocalPath);
  if (!response.url) {
    throw new ApiError(501, "Error while uploading on CoverImage");
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: response.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "CoverImage updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  //get username from url
  const { username } = req.params;

  //check we get username or not
  if (!username?.trim()) {
    throw new ApiError(401, "Username is missing");
  }

  //aggregation pipline
  const channel = await User.aggregate([
    {
      //this is first stage
      $match: {
        username: username?.toLowerCase(),
      },
      //from this stage we get the specific user that channel details we want
    },
    {
      //this is second stage
      $lookup: {
        from: "subscriptions", // we have to convert this model name in lowercase and plural and this is subscription model
        localField: "_id", // we are writing pipeline in user so this is User id
        foreignField: "channel", // this is subscription model field
        as: "subscribers", // we have given this stage 2 data a name that we can refer in below stages
        // and in this stage we get all document of channell and its subscriber ex:(i have 25000 subscribers on my channel)
      },
    },
    {
      //this is third stage
      //in this stage we want channels that current user subscribedTO ex:(i have suscribed 25channels on youtube)
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      //$addFields = this add additional fields in User
      $addFields: {
        //calculate total subscribers
        subscribersCount: {
          $size: "$subscribers", //we have to use $ because this is field and this is from stage two
        },
        //calculat total channels that user subscribed
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        //subscriber button value true or false like if true then grey and false then red
        isSubscribed: {
          // so for this we have to chack that we present in subscribers data or not if we present means we have subscribed this channel
          // $cond = this is used for condition like if else
          $cond: {
            //$in = look userid in subscribers and it work on both arrays and object
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      //$project = this is used so that we can give selected fields
      //we have write 1 for every field that we have to pass, this 1 work as flag
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        avatar: 1,
        coverImage: 1,
        isSubscribed: 1,
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "user channel fetched successfully")
    );
});

const getUserChannelProfileById = asyncHandler(async (req, res) => {
  //get username from url
  const { userId } = req.params;

  //check we get username or not
  if (!userId) {
    throw new ApiError(401, "userId is missing");
  }

  if (!isValidObjectId(userId)) {
    throw new ApiError(401, "invalid userId");
  }

  //aggregation pipline
  const channel = await User.aggregate([
    {
      //this is first stage
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
      },
      //from this stage we get the specific user that channel details we want
    },
    {
      //this is second stage
      $lookup: {
        from: "subscriptions", // we have to convert this model name in lowercase and plural and this is subscription model
        localField: "_id", // we are writing pipeline in user so this is User id
        foreignField: "channel", // this is subscription model field
        as: "subscribers", // we have given this stage 2 data a name that we can refer in below stages
        // and in this stage we get all document of channell and its subscriber ex:(i have 25000 subscribers on my channel)
      },
    },
    {
      //this is third stage
      //in this stage we want channels that current user subscribedTO ex:(i have suscribed 25channels on youtube)
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      //$addFields = this add additional fields in User
      $addFields: {
        //calculate total subscribers
        subscribersCount: {
          $size: "$subscribers", //we have to use $ because this is field and this is from stage two
        },
        //calculat total channels that user subscribed
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        //subscriber button value true or false like if true then grey and false then red
        isSubscribed: {
          // so for this we have to chack that we present in subscribers data or not if we present means we have subscribed this channel
          // $cond = this is used for condition like if else
          $cond: {
            //$in = look userid in subscribers and it work on both arrays and object
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      //$project = this is used so that we can give selected fields
      //we have write 1 for every field that we have to pass, this 1 work as flag
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        avatar: 1,
        coverImage: 1,
        isSubscribed: 1,
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "user channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized Request");
  }

  //aggregation pipeline
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id), //if we have to match with then we have to give in this format because mongodb id is not only string
        // and this aggregation works direct on mongodb not in mongoose. and if we work with mongoose it will extract string in _id automaticaly behind the scene but we dont have mongoose here
      },
    },
    {
      $lookup: {
        //we are currently in user looking for all the videos of user watch history
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory", // here we get list of videos data but in than we have owner field and
        //that is not direct data type , it is a refrence of user model so because of that we cant get it here,
        //so for that we to write nested pipeline so we can get video owner details
        pipeline: [
          {
            //here we are in videos because above pipeline gives all watch history vidoes
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner", // here we get all owner details name username everything
              //but we dont want everything we just want fullname,username, avatar so we write one more nested pipeline
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            // this pipeline is only for sending clear data , we can ignore it if you want
            $addFields: {
              owner: {
                //$first is used for accesing array first element in our case above pipeline have given
                //array and we have first object that have user detail so we directly access that object with the help of this pipeline
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

const addToWatchHistory = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!req.user) {
    throw new ApiError(401, "Unauthorized request");
  }
  if (!videoId) {
    throw new ApiError(400, "Video Id is missing");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Video Id is Invalid");
  }
  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Video not found");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(400, "User not found");
  }

  const videoIndex = user.watchHistory.findIndex(
    (historyVideoId) => historyVideoId.toString() === videoId
  );

  if (videoIndex !== -1) {
    user.watchHistory.splice(videoIndex, 1);
  }

  user.watchHistory.unshift(videoId);

  const MAX_HISTORY_LIMIT = 50;

  if (user.watchHistory.length > MAX_HISTORY_LIMIT) {
    user.watchHistory.pop(); // Remove the oldest video if the limit is exceeded
  }

  await user.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.watchHistory,
        "video successfully added to watchHistory"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  addToWatchHistory,
  getUserChannelProfileById,
};
